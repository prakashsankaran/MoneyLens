# MoneyLens — Architecture Proposal & Phased Plan

Status: accepted for Phase 1 (2026-10-04). This document captures the proposal
written before implementation started. `ARCHITECTURE.md` describes what exists.

## 1. Inspection result

- No existing MoneyLens repository was found on the owner's GitHub account and
  the working directory was empty, so the monorepo was created from scratch.
  Nothing was overwritten.
- Tooling available: Node 22, npm 10, PostgreSQL 16. Docker is not available
  in the build environment, so the Docker Compose setup is written and
  reviewed but was not executed here (see Phase 1 summary).

## 2. Architecture proposal

```
                 ┌──────────────┐     ┌──────────────┐
                 │  apps/web    │     │ apps/mobile  │  (Phase 7, Expo)
                 │ React + Vite │     │ React Native │
                 └──────┬───────┘     └──────┬───────┘
                        │  REST/JSON + JWT   │
                        ▼                    ▼
                 ┌─────────────────────────────────┐
                 │           apps/api              │
                 │ Express · modules per domain    │
                 │ auth · dashboard · imports ...  │
                 └──┬──────────────┬───────────┬───┘
                    │              │           │
          ┌─────────▼───┐  ┌───────▼──────┐ ┌──▼────────────┐
          │ Prisma ORM  │  │ @moneylens/  │ │ AIProvider    │ (Phase 6)
          │ PostgreSQL  │  │ analytics    │ │ (interface +  │
          └─────────────┘  │ (pure TS)    │ │  mock/LLM)    │
                           └──────────────┘ └───────────────┘
```

Key principles

1. **Analytics is pure, deterministic TypeScript** in `packages/analytics`,
   operating on integer paise. It never touches the DB or HTTP, so it is
   trivially testable and reusable by API, web (if ever needed) and mobile.
2. **The API is the only place data is read/written.** React components never
   aggregate; they render API responses.
3. **Contracts live in shared packages.** `@moneylens/types` (enums, DTOs),
   `@moneylens/validation` (Zod schemas reused by API and forms),
   `@moneylens/shared` (formatting, dates in IST, money helpers),
   `@moneylens/ui` (design tokens shared by web and mobile).
4. **Every number shown to a user carries a provenance kind**: FACT,
   CALCULATION, OBSERVATION, AI_INTERPRETATION, RECOMMENDATION.
5. **Import sources are pluggable** via a `TransactionParser` interface
   (Phase 2/3). Google Pay is one source, never a dependency.
6. **AI receives sanitized, aggregated context only** via an `AIProvider`
   interface (Phase 6), and never does arithmetic.

## 3. Phased plan

| Phase | Scope                                                                               | Exit criteria                                                                          |
| ----- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1     | Monorepo, API, web, Prisma schema, auth, seed, dashboard shell                      | Login with demo user shows real dashboard from seeded data; tests/lint/typecheck green |
| 2     | Transaction list/detail/edit, CSV import, categories CRUD, analytics endpoints      | CSV round-trip, filters, category edits persist                                        |
| 3     | Google Pay PDF parser, XLSX parser, import review screen, duplicate detection       | Uploaded statement reviewed then confirmed explicitly                                  |
| 4     | Trends, recurring detection, behaviour insights, money-leakage engine, health score | Each insight has metric + supporting transactions                                      |
| 5     | Money plan, budgets, what-if simulator                                              | Projections state assumed return rate                                                  |
| 6     | AIProvider, MoneyLens AI chat with guardrails                                       | Answers cite structured context only                                                   |
| 7     | Expo mobile app reusing shared packages                                             | Upload, review, dashboard, insights on device                                          |
| 8     | Security hardening, perf, E2E, docs                                                 | Threat model reviewed, E2E suite in CI                                                 |

## 4. Assumptions

- Single currency (INR) for V1; `currency` column kept for the future.
- Amounts are stored as `Decimal(14,2)` and converted to integer paise at the
  repository boundary; all arithmetic is integer.
- Calendar months are bucketed in Asia/Kolkata (UTC+05:30, no DST).
- Subcategories are modelled as `Category` rows with a `parentId`
  (one self-referencing table) rather than a separate `Subcategory` table;
  `Transaction` keeps both `categoryId` and `subcategoryId`.
- "Spending" = outflows of type DEBIT or TRANSFER (to others) minus REFUNDs.
  SELF_TRANSFER is excluded from both income and spending. CASHBACK is shown
  separately and not counted as income.
- Web auth: short-lived access JWT held in memory + rotating refresh token in
  an httpOnly cookie. Mobile (Phase 7) will receive the refresh token in the
  body and keep it in SecureStore.

## 5. Dependencies

Runtime: Express 5, Prisma 6 (pinned to the 6.x stable line; the npm
`latest` tag currently points at an 8.0 release candidate), Zod 4,
@node-rs/argon2, jsonwebtoken, helmet, cors, express-rate-limit, pino.
Web: React 19, Vite, Tailwind CSS 4, TanStack Query 5, React Router 7,
React Hook Form, Recharts. Dev: TypeScript strict, Vitest, Supertest,
React Testing Library, ESLint 9 (flat config), Prettier, Playwright (E2E
scaffold).

## 6. Risks

| Risk                                   | Mitigation                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Google Pay PDF layout varies / changes | Parser abstraction, fixture-based tests, confidence scores, mandatory user review             |
| Miscategorisation erodes trust         | Show confidence, user corrections become rules, never hide "Uncategorized"                    |
| AI hallucinating numbers               | AI gets aggregated context only; numbers rendered from API, not from AI text; guardrail tests |
| Sensitive data exposure                | Minimal PII, masked UPI IDs/references in UI, delete-everything endpoints, no raw docs to AI  |
| Floating point money errors            | Integer paise everywhere in analytics                                                         |
| Monorepo/Expo tooling friction         | Mobile deferred to Phase 7; shared packages are plain TS with no DOM deps                     |
