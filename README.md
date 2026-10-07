# MoneyLens

Upload transaction history → understand where money goes → spot spending patterns
and potential leakage → get actionable, explainable recommendations → build a
personal money plan.

MoneyLens is a personal finance **analysis** product for India, not an expense
tracker. Every number on screen is computed by a deterministic analytics engine,
and every statement is labelled as a fact, calculation, observation, AI
interpretation or recommendation.

> **Status: all 8 phases complete.** Authentication, the dashboard, statement import
> (Google Pay PDF including password-protected ones, bank CSV and Excel) with
> a review step and duplicate detection, the transaction list with editing,
> category and merchant management, analytics with period comparisons,
> recurring payment detection, behaviour insights, potential saving
> opportunities, an explainable financial health score, the monthly report,
> the personal money plan, monthly budgets, the what-if simulator, MoneyLens
> AI (chat and the AI Money Brief, with figure-checking guardrails) and data
> deletion are working on the web, and the Expo mobile app covers the same
> flows on Android and iOS. Phase 8 added sign-in activity, per-account
> sign-in throttling, password change, parser limits, a strict CSP and an
> end-to-end suite in CI.
> See [docs/PLAN.md](docs/PLAN.md) and [docs/PHASE8_SUMMARY.md](docs/PHASE8_SUMMARY.md).

## Repository layout

```
apps/
  api/        Express + TypeScript REST API, Prisma schema, migrations, seed
  web/        React + Vite + Tailwind web app
  mobile/     Expo (React Native) app for Android and iOS
packages/
  types/      Shared enums and API contracts
  validation/ Zod schemas shared by API and clients
  shared/     Money (integer paise), IST dates, formatting, masking
  analytics/  Pure, deterministic analytics engine
  ui/         Design tokens shared by web and mobile
infrastructure/docker/   Dockerfiles, Compose stack, nginx config
samples/                 Fictional statements for trying the import flow
docs/                    Architecture and engineering docs
```

## Prerequisites

- Node.js 22.13 or newer (see `.nvmrc`; the PDF reader needs it) and npm 10
- PostgreSQL 16, either local or via Docker Compose. With a local install,
  create the role and database the template `.env` expects (the role needs
  `CREATEDB` because `prisma migrate dev` uses a temporary shadow database):

  ```bash
  psql -U postgres -c "CREATE ROLE moneylens LOGIN PASSWORD 'moneylens' CREATEDB"
  psql -U postgres -c "CREATE DATABASE moneylens OWNER moneylens"
  ```

## Quick start

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Start PostgreSQL (skip if you already run Postgres locally)
npm run docker:up -- postgres

# 3. Configure the API
cp apps/api/.env.example apps/api/.env      # then set JWT_ACCESS_SECRET

# 4. Create the schema and load six months of demo data
npm run db:migrate
npm run db:seed

# 5. Run API (http://localhost:4000) and web (http://localhost:5173)
npm run dev
```

Sign in with the demo account **demo@moneylens.app / moneylens-demo**, or
create your own account and import one of the fictional statements in
[`samples/`](samples/) (Google Pay PDF, bank CSV or Excel) from the
**Imports** page.

## Environment variables

API variables live in `apps/api/.env` (template: `apps/api/.env.example`).
They are validated at startup and the API refuses to start if they are invalid.

| Variable                   | Required | Default                 | Purpose                                                                                                                     |
| -------------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | yes      | –                       | PostgreSQL connection string                                                                                                |
| `JWT_ACCESS_SECRET`        | yes      | –                       | ≥ 32 chars. Signs access tokens. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `NODE_ENV`                 | no       | `development`           | `development`, `test` or `production`                                                                                       |
| `PORT`                     | no       | `4000`                  | API port                                                                                                                    |
| `CORS_ORIGINS`             | no       | `http://localhost:5173` | Comma-separated allowed browser origins                                                                                     |
| `ACCESS_TOKEN_TTL_SECONDS` | no       | `900`                   | Access token lifetime                                                                                                       |
| `REFRESH_TOKEN_TTL_DAYS`   | no       | `30`                    | Refresh session lifetime                                                                                                    |
| `AUTH_RATE_LIMIT`          | no       | `20`                    | Credential requests per 15 min per IP                                                                                       |
| `API_RATE_LIMIT`           | no       | `300`                   | API requests per minute per IP                                                                                              |
| `TRUST_PROXY`              | no       | `0`                     | Proxy hops to trust for client IPs                                                                                          |
| `LOG_LEVEL`                | no       | `info`                  | pino log level                                                                                                              |
| `MAX_UPLOAD_MB`            | no       | `10`                    | Statement upload size limit                                                                                                 |
| `PARSE_TIMEOUT_MS`         | no       | `20000`                 | Longest time one statement may take to parse                                                                                |
| `LOGIN_LOCKOUT_ATTEMPTS`   | no       | `10`                    | Wrong passwords for one account before its sign-in is paused                                                                |
| `LOGIN_LOCKOUT_MINUTES`    | no       | `15`                    | How long those failures count, and the pause                                                                                |
| `AI_PROVIDER`              | no       | `none`                  | `none`, `anthropic`, `openai-compatible` or `mock`. With `none`, MoneyLens AI shows calculated figures only                 |
| `AI_API_KEY`               | for AI   |                         | Provider API key (anthropic, openai-compatible)                                                                             |
| `AI_MODEL`                 | no       | `claude-sonnet-5-5`     | Model id; required for openai-compatible                                                                                    |
| `AI_BASE_URL`              | no       |                         | Base URL for openai-compatible (e.g. `https://host/v1`)                                                                     |
| `AI_MAX_OUTPUT_TOKENS`     | no       | `700`                   | Output token cap per answer                                                                                                 |
| `AI_TIMEOUT_MS`            | no       | `30000`                 | Provider request timeout                                                                                                    |
| `AI_DAILY_MESSAGE_LIMIT`   | no       | `50`                    | Questions per user per 24 hours                                                                                             |
| `AI_CHAT_RATE_LIMIT`       | no       | `10`                    | Questions per user per minute                                                                                               |

Web variables (optional, `apps/web/.env`): `VITE_API_BASE_URL` (default `/api`)
and `VITE_API_PROXY_TARGET` for the dev proxy (default `http://localhost:4000`).

Configuration per environment: `apps/api/.env` (development),
`apps/api/.env.test` (tests, committed, no secrets), and real environment
variables in production. Never commit `.env`.

## Database setup

```bash
npm run db:migrate   # create/apply migrations in development (prisma migrate dev)
npm run db:deploy    # apply migrations only (CI/production)
npm run db:seed      # system categories + demo user with 6 months of data
npm run db:reset     # DROP and recreate the dev database, then re-apply migrations
```

The API tests use a separate `moneylens_test` database (created automatically by
the Docker Compose stack; create it yourself for a local Postgres:
`createdb -O moneylens moneylens_test`). Tests only apply migrations and never
drop data. See [docs/DATABASE.md](docs/DATABASE.md).

## Running

| What               | Command                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| API + web together | `npm run dev`                                                                         |
| API only           | `npm run dev:api`                                                                     |
| Web only           | `npm run dev:web`                                                                     |
| Production build   | `npm run build` then `npm start -w @moneylens/api` and serve `apps/web/dist`          |
| Mobile (Expo)      | `npm run dev:mobile`, then scan the QR code with Expo Go. See `apps/mobile/README.md` |

## Tests and quality checks

```bash
npm test             # all unit + integration tests (packages, API, web)
npm run test:mobile  # mobile app tests (Jest + React Native Testing Library)
npm run test:e2e     # Playwright end-to-end (start servers with `npm run dev:e2e` and seeded demo data)
npm run lint         # ESLint
npm run typecheck    # strict TypeScript, every workspace
npm run format       # Prettier
npm run check        # format check + lint + typecheck + tests (including mobile)
node scripts/audit-runtime.mjs  # high/critical advisories in API and web runtime dependencies
```

API integration tests need PostgreSQL with the `moneylens_test` database.

## Docker

```bash
npm run docker:up                                                     # postgres + api on :4000
docker compose -f infrastructure/docker/docker-compose.yml --profile web up -d   # + web on :8080
docker compose -f infrastructure/docker/docker-compose.yml --profile seed run --rm seed  # demo data
npm run docker:down
```

The API container applies migrations on start. The web container serves the
built app with nginx and proxies `/api` to the API.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md): system design and key decisions
- [API.md](docs/API.md): endpoints and error format
- [DATABASE.md](docs/DATABASE.md): schema and conventions
- [SECURITY.md](docs/SECURITY.md): auth, privacy and hardening
- [THREAT_MODEL.md](docs/THREAT_MODEL.md): assets, threats and how each is handled
- [DEVELOPMENT.md](docs/DEVELOPMENT.md): workflow and conventions
- [IMPORT_PIPELINE.md](docs/IMPORT_PIPELINE.md): statement import pipeline, supported formats and duplicate detection
- [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md): MoneyLens AI: providers, context, guardrails
- [PLAN.md](docs/PLAN.md): architecture proposal and phased plan
- [PHASE4_SUMMARY.md](docs/PHASE4_SUMMARY.md): insights, recurring payments, health score and monthly report
- [PHASE7_SUMMARY.md](docs/PHASE7_SUMMARY.md): the mobile app
- [PHASE8_SUMMARY.md](docs/PHASE8_SUMMARY.md): security hardening, testing and performance
- [apps/mobile/README.md](apps/mobile/README.md): running the mobile app on a phone

MoneyLens provides educational analysis, not regulated financial advice.
