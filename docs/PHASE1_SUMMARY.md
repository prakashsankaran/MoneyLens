# Phase 1 summary

Date: 2026-10-04. Scope: repository and architecture, React web, Node API,
PostgreSQL + Prisma, authentication, dashboard shell, and demo data.

## What is implemented

- **Monorepo** (npm workspaces): `apps/api`, `apps/web`, `apps/mobile`
  (placeholder), and the packages `types`, `validation`, `shared`, `analytics`
  and `ui`.
- **API** (Express 5, TypeScript strict):
  - Register, login, refresh (rotating, with reuse detection), logout and me.
  - Dashboard and category tree endpoints, plus a health check.
  - Standard success/error envelope.
  - Zod validation, helmet, a CORS allowlist, and global plus credential rate
    limits.
  - Redacted structured logging and env validation that refuses weak secrets.
- **Database:** the full relational schema for every entity in the brief (16
  models plus `Session`). It has foreign keys with cascades and user-scoped
  composite indexes. The initial migration adds a partial unique index for
  system categories and positive-amount check constraints.
- **Analytics engine** (pure TS, integer paise, IST months):
  - Period totals, category breakdown (top or leaf level), monthly trend,
    month-over-month comparison and top merchants.
  - Two deterministic observations: a subcategory above its 3-month average,
    and accumulation of small payments. Each carries its metric and supporting
    transaction ids.
- **Seed:** the system category tree and a demo user with 408 fictional
  transactions over six months (Apr–Sep 2026). The data is deterministic and
  built to show rising food delivery, small-payment accumulation, a one-off
  purchase, a refund and seasonal bills.
- **Web:**
  - Sign in and registration (React Hook Form + shared Zod schemas).
  - Session restore via the refresh cookie.
  - Responsive shell: sidebar on desktop; on mobile, a bottom tab bar with a
    More sheet.
  - Dashboard: overview tiles with month-over-month change and a month
    selector. Sections answer "Where did my money go?" (ranked category bars),
    "Where can I potentially save?" (labelled observations with evidence),
    "How has my spending changed over the last 6 months?" (chart with a table
    toggle) and "Who did I pay the most?".
  - An explicit "not available yet" AI Money Brief card.
  - Placeholder pages for later-phase screens that name their phase.
  - Settings page.
- **Tooling:** ESLint 9 flat config (with a rule keeping analytics free of I/O
  and framework imports), Prettier, Vitest projects, Playwright E2E scaffold,
  GitHub Actions CI, and Dockerfiles plus a Compose stack.
- **Docs:** README, ARCHITECTURE, API, DATABASE, SECURITY, DEVELOPMENT,
  IMPORT_PIPELINE (design), AI_ARCHITECTURE (design) and PLAN.

## Verification (run in the build environment)

| Check                                  | Result                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                 | pass                                                                                                                                          |
| `npm run lint`                         | pass, 0 warnings                                                                                                                              |
| `npm run typecheck` (all 7 workspaces) | pass                                                                                                                                          |
| `npm test`                             | **127 tests in 19 files pass** (packages 67, API 46, web 14)                                                                                  |
| `npm run test:e2e`                     | 4 pass (2 specs × desktop and mobile viewports)                                                                                               |
| `npm run build`                        | pass. The API bundle starts and answers `/api/health`. The web bundle is split into app 152 kB, framework 294 kB and charts 365 kB (minified) |
| Manual                                 | Signed in as the demo user and reviewed the dashboard at 1440px and 390px                                                                     |

## Commands

```bash
npm install
npm run docker:up -- postgres          # or local PostgreSQL 16
cp apps/api/.env.example apps/api/.env # set JWT_ACCESS_SECRET
npm run db:migrate && npm run db:seed
npm run dev                            # http://localhost:5173  (demo@moneylens.app / moneylens-demo)
npm run check                          # format, lint, typecheck, tests
```

## Technical decisions

See the decision table in [ARCHITECTURE.md](ARCHITECTURE.md#key-decisions).
The most consequential ones:

- **Money:** `Decimal(14,2)` in the database, integer paise in code.
- **Time:** months are bucketed in IST.
- **Auth:** the access JWT is held in memory and the refresh token is an
  httpOnly cookie, rotated with reuse detection. Passwords use argon2id.
- **Schema additions:** `Transaction.flow` and `Session`. Subcategories are
  `Category.parentId`, and Housing and Income categories were added.
- **Prisma:** pinned to 6.19.3. The npm `latest` tag points at an 8.0 release
  candidate.
- **Packages:** consumed as TypeScript source. The API is bundled with `tsup`.
- **Mobile:** kept out of the workspaces until phase 7.

## Assumptions

- INR only for V1. Users are in IST.
- Spending is DEBIT plus outgoing TRANSFER, minus REFUND. Income is CREDIT
  plus incoming TRANSFER. SELF_TRANSFER is excluded and CASHBACK is shown
  separately.
- "Above average" means at least ₹1,000 and 15% over the mean of the previous
  three months, with at least two months of history in that category. "Small"
  means under ₹300, reported when there are eight or more.
- The demo data is fictional. Demo credentials appear on the sign-in page in
  development builds only.

## Issues encountered

- **Docker is not available in the build environment**, so the Dockerfiles and
  Compose stack were written and reviewed but **not executed**. Local
  PostgreSQL 16 was used for development and tests. Run `npm run docker:up`
  once on a machine with Docker to confirm.
- Prisma blocks `migrate reset` when run by an AI agent. The test setup
  therefore uses the non-destructive `migrate deploy`, and the tests isolate
  data with unique emails instead of wiping the database.
- The rate limiter tripped during tests as designed. The test env raises the
  credential limit, and a dedicated test checks that limiting works.
- `npm audit` reports advisories in dev-only tooling (esbuild inside tsup,
  `deepmerge-ts` inside the Prisma CLI). See SECURITY.md.
- Google Fonts could not be fetched in the sandbox during screenshots, so the
  system font fallback rendered. This does not affect real browsers.

## What remains

| Phase | Next work                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 2     | Transaction list, detail and edit; CSV import; category CRUD; analytics endpoints; masking in responses; delete endpoints |
| 3     | Google Pay PDF and XLSX parsers, import review screen, duplicate detection                                                |
| 4     | Trends, recurring detection, behavioural insights, money leakage, explainable health score, monthly report                |
| 5     | Financial profile, money plan, budgets, what-if simulator                                                                 |
| 6     | AIProvider, MoneyLens AI chat with guardrails, AI Money Brief                                                             |
| 7     | Expo mobile app                                                                                                           |
| 8     | Security hardening, performance, dark mode, full E2E in CI, docs pass                                                     |

Dark mode is not implemented yet. Chart colours already have validated dark
variants in `@moneylens/ui`.
