# Security and privacy

Financial data is sensitive. MoneyLens stores as little as it can and keeps
every user's data isolated.

## What is implemented (Phase 1)

### Authentication

- Passwords are hashed with **argon2id** (19 MiB, t=2, p=1; OWASP baseline).
  Plaintext passwords are never stored or logged.
- Password policy: 10–128 characters, no composition rules (NIST 800-63B).
- Login runs a hash verification even for unknown emails and returns the same
  error, so accounts cannot be enumerated by response or timing.
- **Access token:** HS256 JWT. It lives 15 minutes and pins issuer, audience,
  `typ=access` and the algorithm (rejects `alg=none` and other-secret tokens,
  covered by tests). It is held in memory by the web app and never put in
  localStorage.
- **Refresh token:** 256-bit random value in an `HttpOnly; SameSite=Strict;
Path=/api/auth` cookie (`Secure` in production). Only its SHA-256 hash is
  stored. It is rotated on every use, and re-using a rotated token revokes the
  whole session family. Logout revokes the family.

### Authorisation

- Every financial query goes through `AnalyticsDataSource` (and, from phase
  2, the transaction repositories), which filters by the authenticated
  `userId` taken from the token. It is never taken from request parameters.
  Tests check that a second user sees none of the demo user's data, and that a
  `userId` query parameter is ignored.

### Transport and request hardening

- `helmet` security headers. `x-powered-by` is disabled.
- CORS allowlist from `CORS_ORIGINS`, with credentials only for listed origins.
- JSON bodies are limited to 100 kB. Malformed JSON returns a 400 envelope.
- Rate limits: `API_RATE_LIMIT` per minute per IP across the API, and
  `AUTH_RATE_LIMIT` per 15 minutes on register, login and refresh.
- All input is validated with Zod schemas shared with the clients.
- SQL injection: Prisma's parameterised queries. The one raw query uses tagged
  template parameters.
- Errors: unknown errors return a generic message. Stack traces and internal
  messages are logged server-side only. A test asserts that nothing leaks.
- Logs redact `Authorization`, cookies, `Set-Cookie` and password/token fields.

### Configuration and secrets

- Secrets come only from environment variables, validated at startup. The API
  refuses secrets under 32 characters and the example secret in production.
- `.env` files are git-ignored. `apps/api/.env.test` is committed and holds
  only test-only values.
- The seed script refuses to run with `NODE_ENV=production`.

## Data minimisation and privacy principles

- MoneyLens never asks for or stores a UPI PIN, bank passwords, CVV or full
  authentication secrets. The schema has no fields for them.
- UPI IDs and transaction references are kept for duplicate detection only and
  will be masked in API responses by default (helpers in `@moneylens/shared`).
- Raw statement files are processed into normalised rows. The file itself can
  be deleted after the import is confirmed (`Import.storageKey` is nullable for
  this).
- The AI pipeline (phase 6) is `document → parser → normalised data → sanitised
aggregates → AI`. Raw documents and raw transaction lists are not sent to an
  AI provider.
- Deletion: every user-owned table cascades from `User`. Endpoints for deleting
  a transaction, an import, all transactions, and the account arrive in phase 2.

## Planned hardening

| Phase | Item                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2     | Upload validation: extension + magic-byte sniffing, size limit (`MAX_UPLOAD_MB`), files stored outside the web root under random keys, never executed |
| 2     | Masked identifiers in transaction responses; data deletion endpoints                                                                                  |
| 2     | Origin check on cookie-authenticated auth routes, in addition to SameSite                                                                             |
| 7     | Mobile refresh tokens in the body, stored in `expo-secure-store`                                                                                      |
| 8     | Account lockout/backoff per email, audit log of auth events, CSP review for the web build, dependency scanning in CI, threat-model review             |

## Known advisories

`npm audit` reports advisories in development-only tooling (as of
2026-10-04): esbuild inside `tsup`, which affects only its dev server on
Windows and is not used, and `deepmerge-ts` inside the Prisma 6 CLI. Neither
ships in the API runtime bundle. Both are tracked for the phase 8 dependency
review.

## Reporting

Report suspected vulnerabilities privately to the repository owner rather than
in a public issue.
