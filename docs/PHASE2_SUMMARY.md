# Phase 2 summary

Date: 2026-10-04. Scope: transaction model in use, CSV import, transaction
list, categories, analytics endpoints and data deletion.

## What is implemented

### Import (CSV)

- `POST /api/imports` takes one file in memory. It checks the extension and
  the bytes (a renamed PDF or spreadsheet is rejected), hashes the file to
  catch re-uploads, and never stores the file itself.
- `csv@1` parser for Indian bank exports. It finds the header row under a
  preamble and supports separate withdrawal/deposit columns, a Dr/Cr column,
  or one signed amount. It reads ₹/Rs./INR, Indian digit grouping, many date
  formats with day/month order detection, and skips summary lines with a
  warning per line.
- Normalisation: positive paise plus direction, type inferred from wording
  (refund, cashback, self transfer), UPI ID and reference extracted.
  References are normalised so the same UPI reference matches across formats.
- Merchant and category resolution, in order: the user's rules, the user's
  own merchant mapping, self transfers, about 50 well-known Indian merchants,
  then keyword rules. Each assignment stores a confidence.
- Staged rows go to `ImportTransaction` for review. A row whose reference
  matches an existing transaction is marked as a possible duplicate and left
  out by default.
- **Review screen**:
  - Calculated totals, file warnings and a "Needs a look" filter.
  - Per row: include or exclude, and change the category.
  - Confirm runs in one database transaction and can't commit twice.
  - Failed files stay in the history with the reason.
- History with delete. Deleting an import removes exactly the transactions it
  added.

### Transactions

- `GET /api/transactions` supports search, date range (IST days), category
  (including "uncategorised"), merchant, amount range, type, direction,
  recurring, source, status, sort and pagination. Totals cover every match.
- Detail view: facts, masked UPI ID and reference, source file, and whether
  the category was suggested automatically.
- Edit category, merchant, notes and type. A transaction can be excluded
  from totals.
- **"Apply to merchant"** turns a correction into a rule. It updates the
  merchant, stores a rule for future imports and recategorises the merchant's
  past transactions in one step.
- Delete one transaction, or all of them after typing `DELETE`.

### Categories, analytics, account

- Category CRUD for the user's own categories and subcategories. Built-in
  ones are protected, and names are unique among siblings.
- `/api/analytics/{monthly,categories,merchants,trends}`. Category analytics
  can drill into one top-level category's subcategories.
- Analytics screen:
  - Month selector and overview tiles.
  - Category breakdown with drill-down.
  - Merchant table.
  - Trend chart up to 12 months long, shorter when there's less history.
  - Each row links to the matching filtered transaction list.
- `DELETE /api/auth/account` with a password re-check.

### Privacy and robustness

- Identifiers are masked in every response, including UPI IDs and long
  numbers inside statement narrations (`maskIdentifiersInText`).
- Session refresh now has its own rate-limit budget. Before this change,
  reloading the app 20 times in 15 minutes locked out sign-in from that IP.
  This was found during manual testing.

## Verification (run in the build environment)

| Check                                            | Result                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass                                                                                                                                                                                                          |
| `npm test`                                       | **268 tests in 35 files pass** (packages 72, API 163, web 33)                                                                                                                                                 |
| `npm run test:e2e`                               | **6 pass**: 3 specs, each at desktop and mobile viewports. The new spec registers, imports the sample statement, excludes a row, confirms, searches, applies a category to a merchant and deletes the account |
| `npm run build`                                  | pass                                                                                                                                                                                                          |
| Manual                                           | Every new screen reviewed at 1440px and 390px with the demo user and a fresh account. No horizontal overflow at 390px                                                                                         |

## Technical decisions

- **No raw file storage.** The file is parsed in memory and discarded. Only
  its hash and metadata are kept. Review needs only the staged rows.
- **The review screen was built now rather than in Phase 3.** The brief says
  nothing is saved before the user reviews it, so CSV import needed one.
  Phase 3 extends it with PDF/XLSX sources, more duplicate signals and more
  row actions.
- **Duplicate detection is reference-based only.** Fuzzy matching (amount,
  date ±1 day, merchant) is Phase 3 work.
- **The upload rejects PDF and XLSX by name.** Its message says those
  formats arrive in Phase 3, rather than failing with a generic error.
- **Category filter `uncategorized`.** It is a reserved value instead of a
  separate parameter, so filters stay one key per control.
- **Account deletion lives under `/api/auth`.** The refresh cookie (path
  `/api/auth`) can then be cleared in the same response.

## Assumptions

- **Dates:** a CSV with ambiguous dates is read day-first, the Indian
  convention, and the review screen says so.
- **Signed amounts:** when a signed amount column has no negative values, the
  file is treated as all money out, with a warning. Some exports list only
  payments this way.
- **Confidence scores:** a category chosen by the user has confidence 1. A
  well-known merchant has 0.85 and a keyword match 0.6. The detail view flags
  anything below 1 as "suggested automatically".

## Issues encountered

- Prettier reformatting moved an `eslint-disable` comment away from its line.
  The regex became a named constant instead.
- Playwright's `uncheck()` reports a failure on a controlled checkbox when the
  re-render lands a moment after the click. Row toggles are now optimistic,
  and the checks use `click()`.
- A mobile layout overflow on the review screen came from grid items' default
  minimum width. It was fixed with `minmax(0,1fr)` tracks.
- Docker is still unavailable in the build environment, so the Compose stack
  was not re-run. No Docker files changed in this phase.

## What remains

| Phase | Next work                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| 3     | Google Pay PDF and XLSX parsers, fuzzy duplicate detection, review actions (mark transfer, merge merchant, manual column mapping) |
| 4     | Recurring detection, behavioural insights, money leakage, explainable health score, monthly report                                |
| 5     | Financial profile, money plan, budgets, what-if simulator                                                                         |
| 6     | AIProvider, MoneyLens AI chat with guardrails, AI Money Brief                                                                     |
| 7     | Expo mobile app                                                                                                                   |
| 8     | Security hardening, performance, dark mode, E2E in CI, docs pass                                                                  |
