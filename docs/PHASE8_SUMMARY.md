# Phase 8 summary

Date: 2026-10-07. Scope: security hardening, testing, performance and
documentation (spec section 35, phase 8). The threats this phase addresses
are listed in [THREAT_MODEL.md](THREAT_MODEL.md); the controls are in
[SECURITY.md](SECURITY.md).

## What is implemented

### Accounts and sign-in

- **Per-account sign-in pause.** After 10 wrong passwords for one email in
  15 minutes, further attempts for that email get `429` without the
  password being checked. Unknown emails are treated the same, so the pause
  does not reveal which accounts exist. Failures before the last successful
  sign-in do not count. Configurable with `LOGIN_LOCKOUT_ATTEMPTS` and
  `LOGIN_LOCKOUT_MINUTES`.
- **Sign-in activity log** (`AuthEvent` table, new migration). It records
  registrations, sign-ins, failed and paused sign-ins, refresh-token reuse,
  sign-outs, password changes and "sign out everywhere", with the user agent.
  Emails are stored only as an HMAC. Events are deleted with the account and
  pruned after 90 days by the API process.
- **New endpoints:** `GET /api/auth/activity`, `POST /api/auth/password`
  (re-checks the current password and signs out every other device) and
  `POST /api/auth/sign-out-everywhere`.
- **Settings on the web and the phone** now have "Password and devices"
  (change password, sign out on all devices) and "Recent sign-in activity",
  which names the device ("Chrome on Mac", "MoneyLens app on Android") and
  flags failed or paused sign-ins and token reuse.

### Imports

- **Parse deadline** (`PARSE_TIMEOUT_MS`, 20 s). The request is answered when
  the deadline passes, and the PDF reader stops at the next page and frees
  its memory. The upload is recorded as failed with advice to use a shorter
  date range.
- **Excel ZIP-bomb guard.** The ZIP directory of an `.xlsx` is read before
  anything is unzipped, and files declaring more than 100 MB, more than 2,000
  parts, or ZIP64 are refused. The Excel library has no limit of its own.

### Web app

- **Content-Security-Policy** and other headers in
  `infrastructure/docker/security-headers.conf`. Scripts are allowed only
  from the app's origin, with no inline scripts and no `eval`.
- **Header bug fixed:** nginx does not inherit `add_header` into a location
  that sets its own, so the long-cached `/assets/` files had been served
  without security headers. The headers are now included in every location.
- **Zod runs in `jitless` mode**, so it no longer probes for `eval` (which
  would show as a CSP violation).
- **gzip** for the app bundle and API JSON in nginx, and `index.html` is
  revalidated on every load so a new deploy is picked up at once.
- **Route-level code splitting.** Dashboard and Transactions load with the
  app; the other eight sections load when first opened. The main bundle went
  from 315 kB to 218 kB (86 kB to 65 kB gzipped).

### CI and dependencies

- **End-to-end tests in CI.** A new `e2e` job migrates and seeds a fresh
  database and runs the Playwright suite at desktop and phone sizes. A
  failed run uploads its traces.
- **Runtime dependency audit.** `scripts/audit-runtime.mjs` fails CI on any
  high or critical advisory in the API's or web app's runtime dependencies.
  Accepted advisories need a reason and a review date (one is accepted; see
  SECURITY.md).
- **Dependabot** for npm (weekly) and GitHub Actions (monthly). Expo and React
  Native majors are left for planned SDK upgrades.
- `shell-quote` (dev tooling) is pinned to its fixed version with an npm
  override.

### Performance

Measured on the local API with a test account of **19,584 transactions**
(six years, amounts varied), three runs each:

| Endpoint                     | Time            |
| ---------------------------- | --------------- |
| `GET /api/dashboard`         | 160–210 ms      |
| `GET /api/insights`          | 165–180 ms      |
| `GET /api/reports/monthly`   | 130–170 ms      |
| `GET /api/transactions` (30) | 170–290 ms      |
| `GET /api/transactions?q=…`  | 45–60 ms        |
| Analytics endpoints          | 25–50 ms        |
| With the demo account (408)  | all under 30 ms |

The transaction list is the slowest because its totals cover every match,
not just the page. The database part takes about 6 ms; the rest is turning
20,000 rows into numbers. The query now reads only the three columns the
totals need. Grouping identical amounts in the database was tried and
dropped: it only helped when amounts repeat, which real statements rarely
do. JSON responses are 9–23 kB before compression.

### Documentation

- New [THREAT_MODEL.md](THREAT_MODEL.md): assets, attackers, 20 threats with
  their controls and remaining risk, and a checklist for new features.
- SECURITY.md, API.md, DEVELOPMENT.md, README (environment variables,
  status) and the mobile README updated.

## Verification (run in the build environment)

| Check                                            | Result                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass                                                                                      |
| `npm test`                                       | **525 tests pass**: packages 150, API 319, web 56                                         |
| `npm run test:mobile`                            | **23 tests pass**                                                                         |
| `npm run test:e2e`                               | **24 pass**: 12 tests at desktop and phone sizes, including the new account-security test |
| `npm run build`                                  | pass                                                                                      |
| `node scripts/audit-runtime.mjs`                 | pass (one accepted advisory)                                                              |
| Built web app under the production CSP           | Every section opened with no CSP violations                                               |

New tests cover the sign-in pause (including unknown emails and resetting
after a success), the activity log and its privacy, pruning, password
change, signing out everywhere, the ZIP guard, the parse deadline, device
names, and the new Settings cards.

## Not verified here

- **nginx itself.** Docker is not available in this environment, so the
  nginx configuration was not loaded by nginx. The CSP was checked by serving
  the built app with the same header from a small Node server.
- **The new CI `e2e` job** runs for the first time on this pull request.

## Technical decisions

- **Throttle by account in the database, not in memory.** It works across
  API instances and survives restarts, and the same table gives users their
  activity history.
- **No permanent lockout.** A pause that expires limits guessing without
  letting an attacker lock someone out of their account indefinitely.
- **A deadline rather than a worker thread for parsing.** It needs no
  separate build entry for the worker and covers the realistic case (large
  PDFs, which are read page by page). The remaining gap is in SECURITY.md.
- **Accept, don't force, the Prisma CLI advisory.** Forcing `deepmerge-ts` 8
  broke `prisma generate`; the affected code never sees request data.
