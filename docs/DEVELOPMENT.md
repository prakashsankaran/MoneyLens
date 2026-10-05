# Development guide

## Daily workflow

```bash
npm install
npm run docker:up -- postgres     # or use a local PostgreSQL 16
npm run db:migrate && npm run db:seed
npm run dev                       # API :4000, web :5173 (proxies /api)
```

Before pushing, run `npm run check`. It runs a Prettier check, ESLint, strict
typecheck of every workspace, and all tests.

## Scripts (root)

| Script                                                          | What it does                                        |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `dev`, `dev:api`, `dev:web`                                     | Run with watch/HMR                                  |
| `build`                                                         | `tsup` bundle of the API, Vite build of the web app |
| `test`, `test:watch`                                            | Vitest across `packages`, `api` and `web` projects  |
| `test:e2e`                                                      | Playwright (desktop + mobile viewports)             |
| `lint`, `format`, `format:check`, `typecheck`, `check`          | Code quality                                        |
| `db:migrate`, `db:deploy`, `db:seed`, `db:reset`, `db:generate` | Prisma                                              |
| `docker:up`, `docker:down`                                      | Compose stack                                       |

Run one test project with `npx vitest run --project api` (or `packages` or
`web`).

## Tests

| Project    | Environment             | Covers                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages` | node                    | money parsing/formatting, IST dates, masking, classification, aggregation, trends, observations                                                                                                                                                                                                 |
| `api`      | node + PostgreSQL       | env validation, enum drift between Prisma and shared types, demo data generator, auth (register/login/refresh rotation/reuse detection/logout/token tampering/rate limit), dashboard API (totals consistency, month selection, validation, cross-user isolation), error envelope, CORS, headers |
| `web`      | jsdom + Testing Library | overview tiles, category list folding, observations, dashboard page with mocked API, login validation, IST greeting                                                                                                                                                                             |
| e2e        | Playwright              | demo sign-in to dashboard, protected-route redirect                                                                                                                                                                                                                                             |

API tests run `prisma migrate deploy` against the `moneylens_test` database
named in `apps/api/.env.test`, then isolate themselves with unique emails. They
never drop data. Set `TEST_DATABASE_URL` to point them elsewhere (the name must
end in `_test`).

E2E tests expect the API to be running with seeded demo data. Start the
servers with `npm run dev:e2e`: every test signs in, so the suite needs more
than the default 20 sign-ins per 15 minutes, and `dev:e2e` raises
`AUTH_RATE_LIMIT` for that run only (Playwright starts it for you when nothing
is running). If Playwright's
own browser is not installed, set `PLAYWRIGHT_CHROMIUM_PATH` to an existing
Chromium binary.

## Conventions

- **Strict TypeScript** (`strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`). Use `import type` for types (ESLint enforces it).
- **Money:** integer paise in code; never `parseFloat` an amount. Use
  `rupeesToPaise`, `formatINR`.
- **Dates:** use the IST helpers in `@moneylens/shared`. Never use
  `Date#getMonth()` for bucketing.
- **No analytics in React.** If a component needs a derived number, add it to
  the analytics package and return it from the API.
- **Provenance:** anything shown as an insight carries a `ProvenanceKind`.
- **Copy:** "Potential saving opportunity", never "You wasted". Chart titles are
  questions the chart answers.
- **Errors:** throw `AppError(code, message)` for client-visible errors.
  Anything else becomes a generic 500.
- **New endpoint checklist:** Zod schema in `@moneylens/validation`, a route
  that uses `requireUserId(req)` for user scoping, a service, Supertest tests
  including a cross-user access test, and an update to `docs/API.md`.
- Commit messages: imperative mood, explain why.

## Adding a database change

1. Edit `apps/api/prisma/schema.prisma`.
2. `npm run db:migrate -- --name short_description`
3. Review the SQL. Add hand-written constraints or partial indexes to the
   migration where Prisma cannot express them.
4. If an enum changed, update `packages/types`. The enum drift test fails until
   you do.
