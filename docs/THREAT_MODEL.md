# Threat model

Reviewed 2026-10-07 (Phase 8). This covers the API, the web app, the mobile
app and the import pipeline as they are in this repository. Controls are
described in [SECURITY.md](SECURITY.md); this document says what each one
protects against and what is left.

## What we protect

| Asset                              | Where it lives                                    | Why it matters                                                     |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| Transactions and derived insights  | PostgreSQL, scoped by `userId`                    | A full picture of someone's spending, income and habits            |
| UPI IDs and transaction references | PostgreSQL, masked in every response              | Identify counterparties and can be used in social engineering      |
| Account credentials                | argon2id hash in `User`; refresh token hashes     | Access to everything above                                         |
| Statement files and PDF passwords  | Request memory only, never stored                 | Statements carry full names, account numbers and every transaction |
| Server secrets (JWT key, AI key)   | Environment variables                             | Forging sessions; spending on the AI provider                      |
| Sign-in activity                   | `AuthEvent`, 90 days, emails stored only as HMACs | Shows when and from which device someone used the account          |

## Who might attack

- **An outsider on the internet** guessing passwords, scanning for
  vulnerabilities, or sending crafted files.
- **Another MoneyLens user** trying to read or change someone else's data
  through the API.
- **Someone with a stolen token or device**, for example a lost phone or a
  copied refresh token.
- **A malicious web page** the user visits while signed in (CSRF, clickjacking).
- **A compromised dependency** in the build or at runtime.
- **The AI provider**, which receives aggregates when AI is turned on.

Out of scope: an attacker with database or host access, a compromised
device operating system, and the user's own bank or Google Pay accounts.

## Threats and how they are handled

| #   | Threat                                                   | Controls                                                                                                                                                                                                                                      | Residual risk                                                                                           |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| T1  | Password guessing against one account                    | argon2id; per-IP limit on credential routes; per-account pause after 10 failures in 15 minutes, applied to unknown emails too                                                                                                                 | An attacker can delay the owner's sign-in by up to 15 minutes. No two-factor sign-in.                   |
| T2  | Finding out which emails have accounts                   | Same error and similar timing for unknown email and wrong password; the pause applies to every email. Registration does reveal an existing email (`409`), as most sign-up forms do                                                            | Registration enumeration, slowed by the per-IP limit                                                    |
| T3  | Stolen refresh token                                     | Only its SHA-256 is stored; rotated on every use; reuse revokes the whole family and is logged; `HttpOnly` `SameSite=Strict` cookie on the web, Keychain/Keystore on phones; "sign out on all devices"; password change revokes every session | A token used before its owner refreshes works until the owner's next refresh                            |
| T4  | Stolen access token                                      | 15-minute lifetime, held in memory only, algorithm, issuer, audience and type pinned                                                                                                                                                          | Valid until it expires, even after sign-out everywhere                                                  |
| T5  | Reading or changing another user's data (IDOR)           | Every query filters by the `userId` from the token; foreign ids return `404`; category ids checked for visibility; tests for each resource                                                                                                    | None known                                                                                              |
| T6  | Cross-site request forgery                               | Bearer tokens for data routes (a browser never attaches them by itself); refresh and logout check `Origin` against `CORS_ORIGINS` and use a `SameSite=Strict` cookie; CORS allowlist                                                          | None known                                                                                              |
| T7  | Cross-site scripting                                     | React escapes output; model text rendered as plain text, never HTML; CSP allows scripts only from the app's origin, no inline scripts or `eval`                                                                                               | Inline style attributes are allowed for the chart library                                               |
| T8  | Clickjacking                                             | `frame-ancestors 'none'` and `X-Frame-Options: DENY`                                                                                                                                                                                          | None known                                                                                              |
| T9  | Malicious upload: wrong type, oversized, renamed binary  | Extension allowlist plus content sniffing; `MAX_UPLOAD_MB`; one file per request; multipart field limits                                                                                                                                      | None known                                                                                              |
| T10 | Malicious upload: parser exhaustion (huge PDF, ZIP bomb) | 200-page PDF cap; parse deadline that answers the request and stops the PDF reader; ZIP directory checked (100 MB, 2,000 parts, no ZIP64) before unzipping; 20,000-row cap                                                                    | A single slow page can keep a CPU busy until it finishes, because parsing is not in a separate worker   |
| T11 | Malicious upload: active content in PDFs                 | pdf.js with scripts, fonts and network access off; only the text layer is read                                                                                                                                                                | Depends on pdf.js staying free of parser bugs; kept up to date by Dependabot                            |
| T12 | Leaking statement files or PDF passwords                 | Files parsed in memory and discarded; only the hash and staged rows are stored; passwords never stored, logged or returned; logs redact auth headers, cookies and password fields                                                             | None known                                                                                              |
| T13 | Leaking identifiers in the interface or to AI            | UPI IDs and references masked in every response; AI gets only monthly aggregates; questions with PINs, passwords, OTPs, CVVs or card numbers are refused before storage; other identifiers masked                                             | Users can still type personal details in free text, which is masked where recognised                    |
| T14 | AI inventing figures or giving unsafe advice             | Figures come from the engine; every amount and percentage in AI text is checked against them; one regeneration, then figures only; refusals for credential and illegal requests; "not financial advice" note                                  | The wording of an interpretation can still be unhelpful, though not numerically wrong                   |
| T15 | Brute-forcing or abusing the API in general              | Per-IP API limit; JSON body limit 100 kB; AI questions limited per minute and per day                                                                                                                                                         | Per-IP limits are in memory and per instance                                                            |
| T16 | Information disclosure in errors                         | Unknown errors return a generic message; stack traces only in server logs; a test asserts nothing leaks                                                                                                                                       | None known                                                                                              |
| T17 | Weak or leaked secrets                                   | Secrets only from the environment; under 32 characters or the example value refused in production; `.env` ignored by git                                                                                                                      | Secret rotation signs everyone out (acceptable)                                                         |
| T18 | Vulnerable dependency at runtime                         | `scripts/audit-runtime.mjs` fails CI on high or critical advisories in API and web runtime dependencies (accepted exceptions need a reason and expire); Dependabot updates                                                                    | One accepted advisory in the Prisma CLI (see SECURITY.md); development tooling advisories without fixes |
| T19 | Lost or stolen phone                                     | Refresh token in Keychain/Keystore, access token in memory; "sign out on all devices" from any other device; activity log shows the phone                                                                                                     | Anyone who can unlock the phone can use the app until the session is revoked                            |
| T20 | Data left behind after deletion                          | Every user-owned table cascades from `User`, including sign-in activity; failed sign-ins for the email before registration are removed too                                                                                                    | Database backups, if any are configured by the operator, keep data until they expire                    |

## Review checklist for new features

- Does every new query filter by `userId` from the token?
- Does any new response include a UPI ID, reference or account number that
  should be masked?
- Does anything new reach the AI provider? It must be an aggregate.
- Does a new upload path go through the same type, size and deadline checks?
- Does a new page need anything the CSP blocks? Change the policy on
  purpose, not by loosening `script-src`.
- Does a new dependency ship to production? It is then covered by the
  runtime audit in CI.
