# Security and privacy

Financial data is sensitive. MoneyLens stores as little as it can and keeps
every user's data isolated.

## What is implemented

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
- **Mobile app:** the refresh token is returned in the response body only
  when the request carries `X-MoneyLens-Client: mobile`, and is stored with
  `expo-secure-store` (iOS Keychain, Android Keystore). The access token stays
  in memory. The header only changes where the token travels; rotation,
  reuse detection and revocation are identical, and a body token is ignored
  without the header so a web page cannot opt out of the `HttpOnly` cookie.
  Sign-out deletes the stored token even when the API is unreachable.
- **Sign-in throttling per account:** after 10 wrong passwords for one email
  within 15 minutes (`LOGIN_LOCKOUT_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`),
  further attempts for that email are refused with `429` without checking the
  password. It applies to unknown emails too, so it does not reveal which
  accounts exist, and failures before the last successful sign-in do not
  count. The pause expires on its own, so an attacker can at most delay the
  owner's sign-in for 15 minutes; the per-IP limit still applies on top.
- **Sign-in activity:** registrations, sign-ins (successful, failed and
  paused), refresh-token reuse, sign-outs, password changes and "sign out
  everywhere" are recorded in `AuthEvent` with the user agent. Emails are not
  stored there: failed attempts are keyed by an HMAC of the email with a key
  derived from the server secret. Owners see their last 20 events in
  Settings. Events are deleted with the account (including failures for that
  email before it was registered) and pruned after 90 days.
- **Password change** re-checks the current password and revokes every
  session; **sign out on all devices** revokes every session without a
  password change. Both are in Settings on the web and the phone.

### Authorisation

- Every financial query filters by the authenticated `userId` taken from the
  token, never from request parameters. Looking up another user's
  transaction, import, import row or category returns `404`, so ids cannot be
  probed. Category ids supplied by a client are checked to be visible to that
  user before they are attached to anything. Tests cover each of these.

### Uploads

- One file per request, held in memory (multer), limited to `MAX_UPLOAD_MB`.
- Extension allowlist (`.pdf`, `.csv`, `.xlsx`) plus content sniffing: a
  `.csv` must be text, a `.xlsx` a ZIP container and a `.pdf` a PDF. Anything
  else, including a renamed binary, is rejected before a parser runs.
- **PDFs** are read with pdf.js with font loading, scripts and network access
  off, at most 200 pages per file. Only the text layer is used.
- **PDF passwords** arrive as a multipart field, are passed to the PDF reader
  in memory for that one request, and are never stored, logged or returned.
  Wrong passwords get the same short message every time. The multipart form
  accepts at most two small text fields besides the file.
- A password-protected Excel workbook is refused with an explanation rather
  than opened.
- Filenames are reduced to a base name without control characters before
  being stored or shown.
- **Parse deadline:** each statement must be parsed within
  `PARSE_TIMEOUT_MS` (20 s). The request is answered when the deadline
  passes, and the PDF reader is told to stop and free its memory; it checks
  between pages.
- **Excel ZIP bombs:** before an `.xlsx` is unzipped, its ZIP directory is
  read and the file is refused if it declares more than 100 MB of content,
  more than 2,000 parts, or ZIP64. The Excel library has no limit of its own.
- **Raw files are never written to disk or kept.** Only metadata and the
  SHA-256 are stored, and staged rows are committed only after the user
  confirms. A row cap (20,000) bounds the work per upload.

### Transport and request hardening

- `POST /api/auth/refresh` and `/logout`, the routes that act on the refresh
  cookie, refuse requests whose `Origin` header is not one of `CORS_ORIGINS`
  (`403`). This backs up the cookie's `SameSite=Strict` setting.

- `helmet` security headers. `x-powered-by` is disabled.
- **Web app headers (nginx):** a Content-Security-Policy that allows scripts
  only from the app's own origin (no inline scripts, no `eval`), styles from
  the app and Google Fonts, fonts from Google Fonts, and API calls only to
  the same origin; `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'` and `form-action 'self'`. Also `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Opener-Policy` and a `Permissions-Policy` that turns off the
  camera, microphone, location and payments. The headers are in
  `infrastructure/docker/security-headers.conf` and are included in every
  nginx location (nginx does not inherit `add_header` into a location that
  sets its own, which had left the cached `/assets/` responses without them).
  Inline style attributes are allowed because the chart library uses them.
  Zod runs in `jitless` mode so it never probes for `eval`. The built app was
  checked page by page under this policy with no violations.
- CORS allowlist from `CORS_ORIGINS`, with credentials only for listed origins.
- JSON bodies are limited to 100 kB. Malformed JSON returns a 400 envelope.
- Rate limits: `API_RATE_LIMIT` per minute per IP across the API,
  `AUTH_RATE_LIMIT` per 15 minutes on register, login and account deletion,
  and a separate budget of 5 × `AUTH_RATE_LIMIT` for session refresh (it runs
  on every page load and carries a 256-bit token, not a password).
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
- UPI IDs and transaction references are kept for duplicate detection only
  and are masked in every API response, including inside statement
  narrations shown as descriptions.
- Raw statement files are processed into normalised rows in memory and then
  discarded.
- The AI pipeline is `document → parser → normalised data → sanitised
aggregates → AI`. Raw documents, transaction lists, UPI IDs, references and
  account numbers are never sent to an AI provider; only monthly aggregates
  are (see AI_ARCHITECTURE.md). With `AI_PROVIDER=none` (the default) nothing
  is sent anywhere.
- MoneyLens AI refuses messages containing a PIN, password, OTP, CVV or card
  number before they are stored or sent, keeping only a placeholder, and
  masks UPI IDs and long numbers in every other question. Every amount and
  percentage in an AI answer is checked against the calculated figures before
  it is shown. Questions are limited per user per minute and per 24 hours.
- The AI provider key lives only in the API's environment. Provider errors
  are reported by HTTP status only; response bodies are never logged.
- Deletion: every user-owned table cascades from `User`. Users can delete a
  transaction, an import (with the transactions it added), all transactions
  (typed `DELETE` confirmation), and their account (password re-check).
  After account deletion an already-issued access token can live up to its
  15-minute expiry but finds no data; refresh tokens are deleted with the
  account.

## Remaining risks and future work

| Item                                                      | Why it is not done yet                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsing in a separate worker thread or process            | The deadline stops PDF parsing between pages and always answers the request on time, but a CPU-bound step inside one page or inside the Excel reader can keep running until it finishes.       |
| Two-factor sign-in                                        | Not in the V1 scope. The activity log and "sign out on all devices" cover detection and response.                                                                                              |
| Email notifications for new sign-ins and password changes | MoneyLens sends no email yet.                                                                                                                                                                  |
| Revoking access tokens before they expire                 | Access tokens are stateless and live 15 minutes. Signing out everywhere ends sessions at once, but a token already issued works until it expires.                                              |
| Per-IP rate limits are kept in memory                     | The per-account pause is stored in PostgreSQL and works across instances; the per-IP limits use memory and would need a shared store (for example Redis) if the API runs on several instances. |

See [THREAT_MODEL.md](THREAT_MODEL.md) for the full list of threats and how
each one is handled.

## Known advisories

`scripts/audit-runtime.mjs` runs in CI and fails on any high or critical
advisory in the API's or web app's runtime dependencies. As of 2026-10-07 it
accepts one, with a review date of 2027-01-31:

- **GHSA-ggr8-5vv4-36mx** in `deepmerge-ts`, used by the Prisma CLI to merge
  its own configuration file. No request data reaches it. Prisma 6 pins
  `deepmerge-ts` 7, and forcing version 8 breaks the CLI.

`npm audit` also lists advisories in development-only tooling: the Expo CLI
(`node-forge`, `@expo/config-plugins`), Jest (`braces`, `micromatch`) and
`esbuild` inside `tsup`. None of them runs in the API or ships in the web
bundle, and most have no fixed version yet. `shell-quote` (used by the
`concurrently` dev runner and React Native's dev tools) is pinned to the
fixed 1.12 with an npm override.

## Reporting

Report suspected vulnerabilities privately to the repository owner rather than
in a public issue.
