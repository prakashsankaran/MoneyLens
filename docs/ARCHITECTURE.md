# Architecture

This document describes what exists today and the design every later phase
plugs into. The original proposal, assumptions and risks are in
[PLAN.md](PLAN.md).

## The five questions

The product is organised around five questions. Each screen and analytic exists
to answer one of them:

1. **Where** did my money go? (category and merchant breakdowns)
2. **Why** did my spending change? (period comparisons, frequency vs size)
3. **What** patterns should I be aware of? (behavioural insights, recurring)
4. **Where** can I potentially save? (money-leakage signals)
5. **What** should I do differently next month? (plan, budgets, what-if)

Phase 1's dashboard answers 1 and 4 in a first form, and the trend chart starts on 2.

## System overview

```
 Browser (React SPA)                 Mobile (Expo, phase 7)
        │  /api (same origin via Vite proxy or nginx)   │
        ▼                                               ▼
 ┌───────────────────────────────────────────────────────────┐
 │ apps/api  Express 5                                       │
 │  helmet · CORS allowlist · JSON 100 kB · rate limits      │
 │  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐   │
 │  │ auth     │ │ dashboard │ │ categories │ │ health   │   │
 │  └────┬─────┘ └─────┬─────┘ └─────┬──────┘ └──────────┘   │
 │       │      AnalyticsDataSource (user-scoped queries)    │
 │       │             │  rows → integer paise               │
 │       │             ▼                                     │
 │       │   @moneylens/analytics (pure functions)           │
 │       ▼             │                                     │
 │   Prisma Client ◄───┘                                     │
 └───────┬───────────────────────────────────────────────────┘
         ▼
     PostgreSQL 16
```

### Layering rules

| Layer                 | May depend on                 | Must not                                                       |
| --------------------- | ----------------------------- | -------------------------------------------------------------- |
| `packages/types`      | nothing                       | contain logic                                                  |
| `packages/shared`     | types                         | touch I/O, DOM or React Native                                 |
| `packages/validation` | types, zod                    | –                                                              |
| `packages/analytics`  | types, shared                 | import Prisma, Express, React or `node:*` (enforced by ESLint) |
| `apps/api` modules    | all packages, Prisma          | put arithmetic in route handlers                               |
| `apps/web`            | types, shared, validation, ui | aggregate or compute analytics in components                   |

The web app only formats numbers it receives. For example, the month-over-month
change on the overview tiles is computed by `comparePeriods` in the analytics
package and returned by the API.

### Packages are consumed as TypeScript source

Workspace packages export `src/index.ts` directly ("internal packages"). Vite,
Vitest and `tsx` compile them on the fly, and the API's production build
(`tsup`) bundles them into `dist/server.js`. There is no separate package
build step to forget, and editor go-to-definition lands in real source.

## API structure

```
apps/api/src/
  app.ts                  createApp({ env, prisma, logger }): dependency-injected for tests
  server.ts               process entry: env, logger, listen, graceful shutdown
  config/env.ts           zod-validated environment, refuses weak secrets
  lib/                    errors (AppError), response envelope, money, analytics data source
  middleware/             authenticate, validate (zod), rate limits, error handler
  modules/<domain>/       routes + service per domain (auth, dashboard, categories, health)
prisma/
  schema.prisma           full relational schema (all 16 entities, see DATABASE.md)
  migrations/             SQL migrations, including hand-written constraints
  seed.ts, demo/          system categories + deterministic demo data
```

Each module exposes a router factory that receives its dependencies. Services
hold business logic and are plain classes; routes only parse input, call a
service and send the envelope.

### Response envelope

All responses use `{ success: true, data }` or
`{ success: false, error: { code, message, details? } }`. Unknown errors are
logged with a stack trace server-side and returned as a generic
`INTERNAL_ERROR`. See [API.md](API.md).

## Money and time

- **Integer paise everywhere in analytics.** The database stores
  `Decimal(14,2)` rupees; `decimalToPaise` converts at the data-source boundary
  using string parsing (no floats). Formatting to `₹1,45,000` happens only in
  the client via `formatINR` (Indian digit grouping).
- **IST calendar.** Months and days are bucketed in Asia/Kolkata (UTC+05:30)
  regardless of server timezone (`packages/shared/src/dates.ts`, and the SQL in
  `AnalyticsDataSource.monthsWithData`).
- Amounts are always positive; direction comes from `flow` (`IN`/`OUT`) plus
  `transactionType`.

### What counts as income and spending

Implemented in `classifyTransaction` (`packages/analytics/src/classify.ts`):

| Type                  | Flow   | Counts as                                                 |
| --------------------- | ------ | --------------------------------------------------------- |
| DEBIT                 | OUT    | spending                                                  |
| TRANSFER              | OUT    | spending (money to someone else, e.g. rent, family)       |
| CREDIT                | IN     | income                                                    |
| TRANSFER              | IN     | income (money received from someone else)                 |
| REFUND                | IN     | reduces spending (net per category too)                   |
| CASHBACK              | IN     | reported separately, not income                           |
| SELF_TRANSFER         | any    | excluded (moving your own money)                          |
| UNKNOWN               | OUT/IN | spending/income, so money is never silently dropped       |
| DEBIT IN / CREDIT OUT | –      | excluded as contradictory (flagged for review in phase 3) |

## Analytics engine (Phase 1 scope)

`packages/analytics` currently provides:

- `summarizePeriod`: income, gross spending, refunds, net spending, cashback,
  saved, savings rate, count, mean and median spend.
- `categoryBreakdown`: net spend per category at top level (subcategories
  rolled up) or leaf level, with shares.
- `monthlyTrend`, `groupByMonth`, `comparePeriods`: month series and
  month-over-month change.
- `topMerchants`.
- Observations (deterministic, labelled `OBSERVATION`, each with metric and
  supporting transaction ids):
  - `categoriesAboveAverage`: a subcategory (or, failing that, its parent)
    whose spend this month is at least ₹1,000 and 15% above its average over the
    previous three months. It needs two or more months of history in that
    category.
  - `smallTransactionAccumulation`: eight or more payments under ₹300.

Later phases add recurring detection, behavioural insights, money-leakage
scoring and the explainable health score in the same package.

## Provenance: fact vs interpretation

`ProvenanceKind` (`FACT`, `CALCULATION`, `OBSERVATION`, `AI_INTERPRETATION`,
`RECOMMENDATION`) is part of the shared types, the `Insight` table (`kind`
column) and the UI (`ProvenanceBadge`). AI-produced text will always carry
`AI_INTERPRETATION`, and figures shown next to it always come from the engine,
never from the model's output.

## Web application

- React 19, React Router 7, TanStack Query 5, React Hook Form + Zod
  (schemas from `@moneylens/validation`), Tailwind CSS 4, Recharts 3, lucide icons.
- `features/` holds feature folders (auth, dashboard); `components/` holds the
  shared UI and layout.
- **Layout:** sidebar at `lg` (1024px) and above. Below that, a sticky header
  and a bottom tab bar (Home, Transactions, Insights, Plan, More), where More
  opens a sheet with the remaining sections.
- **Session handling:** the access token is kept in memory, and the refresh
  token is an httpOnly cookie. On load the app calls `/auth/refresh` to
  restore the session, and a 401 triggers one shared refresh followed by a
  retry.
- **Charts:** card titles are phrased as questions. Categories are a ranked
  bar list with a single colour, which compares sizes better than a donut and
  folds the tail into "Everything else". The six-month trend is a two-series
  column chart with a legend, a tooltip and a "Show as table" toggle. Its
  palette was checked with a colour-vision-deficiency validator in light and
  dark mode.
- Screens planned for later phases render an explicit "not available yet"
  page that names the phase, rather than imitating a working screen.

## Extensibility points

| Concern              | Extension point                                                     | Phase |
| -------------------- | ------------------------------------------------------------------- | ----- |
| New statement source | `TransactionParser` implementations + `TransactionSource` enum      | 2–3   |
| OCR for scanned PDFs | `OcrEngine` interface behind the PDF parser                         | later |
| LLM vendor           | `AIProvider` interface, chosen by env var                           | 6     |
| File storage         | `FileStorage` interface (local disk → S3-compatible)                | 2     |
| Mobile auth          | Refresh token returned in body when the client identifies as mobile | 7     |

## Key decisions

| Decision                                       | Why                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| npm workspaces (no Turborepo/Nx yet)           | Fewer moving parts. Revisit if build times grow                                                                         |
| Prisma 6.19 (not the 8.0 RC tagged `latest`)   | Stable generator and APIs. Upgrade deliberately                                                                         |
| Express 5                                      | Native async error propagation, no wrapper needed                                                                       |
| argon2id via `@node-rs/argon2`                 | OWASP-recommended hash with prebuilt binaries                                                                           |
| Access JWT in memory + rotating refresh cookie | Script injection cannot read the long-lived credential, and stolen refresh tokens are detected on reuse                 |
| Subcategories as `Category.parentId`           | One tree, arbitrary depth for custom categories. `Transaction` keeps both `categoryId` and `subcategoryId` as specified |
| `Decimal(14,2)` + integer paise in code        | Human-readable SQL with exact arithmetic                                                                                |
| Added `flow` column                            | A `TRANSFER` can be in or out. Type alone cannot give direction                                                         |
| Added Housing and Income system categories     | Rent is the largest expense for many Indian households, and salary needs a home                                         |
| Mobile excluded from workspaces until phase 7  | Keeps Expo/Metro tooling from destabilising web and API now                                                             |
