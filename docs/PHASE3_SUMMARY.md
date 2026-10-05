# Phase 3 summary

Date: 2026-10-05. Scope: Google Pay statement PDF import, Excel import,
manual column mapping, fuzzy duplicate detection, richer review actions and
merchant management.

## What is implemented

### Google Pay statement PDF (`google-pay-pdf@1`)

- Reads the statement PDF downloaded from Google Pay. Text and positions are
  extracted with pdf.js, which runs with fonts, scripts and network off and
  stops at 200 pages.
- Each page's "Date & time / Transaction details / Amount" heading row gives
  the columns. Page headers (name, phone, email), the statement period and
  footers are ignored.
- Per transaction, it reads:
  - the date and the IST time;
  - the payee from "Paid to …", "Received from …", "Self transfer to …" and
    similar, joining names that wrap onto a second line;
  - the UPI transaction ID, which becomes the reference;
  - the amount;
  - the account line, which closes the transaction and settles the
    direction when the wording is unfamiliar.
- The payee becomes the merchant, so people and small shops keep readable
  names ("Arjun Mehta", not "Paid To Arjun Mehta").
- **Cross-check:** the totals of the rows read are compared with the
  statement's own "Sent" and "Received" figures. A mismatch shows both
  figures as a file warning on the review screen, and a missing summary is
  noted the same way.
- **Password-protected PDFs:** the upload asks for the password and opens the
  file with it. A wrong password says so. The password is used once in memory
  and is never stored, logged or returned.
- Clear messages instead of silent failures for:
  - a PDF that is not a Google Pay statement (it suggests CSV or Excel for
    bank statements);
  - a scanned PDF with no text;
  - a damaged file.

### Excel (`xlsx@1`)

- Reads `.xlsx` files using the same column detection and row rules as CSV.
  That shared code moved into `pipeline/tabular.ts`.
- Date cells keep the day Excel shows.
- The first sheet with recognisable headings is used, and the review screen
  names the sheet.
- Legacy `.xls` files and password-protected workbooks get a message asking
  for `.xlsx` or CSV.

### Manual column mapping

- When a CSV or Excel file's headings are not recognised, the upload screen
  shows the first rows. The user picks the heading row and which columns are
  the date, description, amount (or money out and money in), Dr/Cr marker and
  reference.
- The file is then re-sent with that choice. Nothing is recorded until it
  works.

### Duplicate detection

- New rows are scored against the user's transactions around the statement
  dates:
  - **Reference numbers:** the same reference is a duplicate; two different
    references are never duplicates.
  - **Amount and direction** must otherwise match exactly. Then same IST day
    scores +3, one day apart +1, same merchant +3 and same UPI ID +3.
  - **Threshold:** a score of 4 or more is a possible duplicate.
- The reason is written out for the user, for example "Same amount, same day
  and same merchant as a transaction you already have".
- Each existing transaction absorbs only one new row. Inside one file only a
  repeated reference counts, so two genuine equal payments stay.
- This works across sources. Importing the Google Pay statement and then the
  bank statement flags the Swiggy payment by its shared UPI reference. A bank
  row with no reference is flagged by amount, day and merchant.

### Review actions

- Per row, the user can now edit:
  - the merchant name, with the user's existing merchants suggested;
  - the type (payment, money in, refund, cashback, transfer, self transfer);
  - whether the row is a duplicate.
- After a category change, the screen offers "Use this category for the N
  other rows from Swiggy?". The row editor can apply the merchant and type
  changes to those rows too. Include and exclude always stay per row.

### Merchants (Settings)

- Search, rename and merge.
- **Rename:** the old name is kept as an alias, so statements that still say
  "SWIGGY" map to the renamed merchant. Merchant rules follow the rename.
- **Merge:** moves transactions, aliases, rules and recurring payments into
  the kept merchant, then deletes the other. The screen says what will happen
  before the user confirms.

### Also done

- `POST /api/auth/refresh` and `/logout` refuse requests from origins
  outside `CORS_ORIGINS`. This was listed as Phase 3 hardening.
- Files without any numeric day/month dates (ISO or "05 Sep 2026") no longer
  get the "dates were read as day/month/year" note, because nothing was
  assumed.
- Fictional samples added: `samples/sample-google-pay-statement.pdf` and
  `samples/sample-bank-statement.xlsx`.

## Verification (run in the build environment)

| Check                                            | Result                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (format, lint, typecheck, tests) | pass                                                                                                                                                                                                                                           |
| `npm test`                                       | **313 tests in 40 files pass**: packages 72, API 204, web 37                                                                                                                                                                                   |
| New parser tests                                 | Synthetic PDFs built with pdf-lib at test time (multi-page, wrapped payee, payee named "… Bank …", summary match and mismatch, not-Google-Pay, image-only, damaged), a password-protected PDF, and Excel workbooks built with write-excel-file |
| `npm run test:e2e`                               | **8 pass**: 4 tests at desktop and mobile sizes. The new spec opens the protected PDF (wrong password, then right), imports it, imports the Excel sample and sees the cross-source duplicate, then renames a merchant                          |
| `npm run build`                                  | pass                                                                                                                                                                                                                                           |
| Manual                                           | Column picker, review row editor and Merchants card checked at 390px and 1440px; no horizontal overflow                                                                                                                                        |
| `npm audit --omit=dev`                           | Only the known Prisma `deepmerge-ts` advisory (see SECURITY.md); the new libraries add none                                                                                                                                                    |

## Technical decisions

- **pdf.js (`pdfjs-dist`) for PDF text.** It is maintained, gives each text
  run's position (needed to tell columns apart), and handles encrypted PDFs.
  It needs Node 22.13 or newer, so `engines` now says so. The Docker images
  and CI already use the latest Node 22.
- **`read-excel-file` for Excel, not SheetJS.** The `xlsx` package on npm is
  no longer updated there and has open advisories.
- **Layout parsing is a pure function over positioned lines.**
  `parseGooglePayLines` takes text lines with x positions, so edge cases are
  tested without building a PDF. Building PDFs in tests (pdf-lib) covers the
  extraction itself.
- **"Needs input" is a 400, not a failed import.** A missing password or
  unrecognised columns is something the user fixes immediately, so it gets a
  dialog. A history entry is only created for files that can't be read.
- **No schema change.** The counterparty feeds the merchant name, and
  duplicate details use the existing `duplicateOfId` and `duplicateReason`
  columns.
- **`applyToSimilar` matches on the merchant name as shown in review.** That
  is what the user sees and corrects, and it is the same key the confirm step
  uses to create merchants.

## Assumptions

- **Google Pay layout.** The statement format comes from public descriptions,
  not from a real statement. The synthetic fixtures follow that description.
  If a real statement differs, the likely symptoms are a "does not look like
  a Google Pay statement" message or a summary-mismatch warning, not silently
  wrong numbers. **A real statement (with names and numbers removed) would be
  the best next test.**
- **Self transfers** in a Google Pay statement are treated as money out of
  the account shown on the statement.
- **Bank account lines** ("Paid by HDFC Bank 1234") are used only for
  direction and are not stored.
- **Duplicate weights** (same day 3, next day 1, merchant 3, UPI ID 3,
  threshold 4) are starting values chosen so that amount and day alone do not
  flag a row. They are constants in one file.

## Issues encountered

- pdf-lib's standard fonts cannot draw "₹", so the PDF fixtures write
  amounts as "Rs.". The parser accepts ₹, Rs. and INR. A pure-function test
  covers "₹".
- Creating an encrypted PDF needed a tool that pdf-lib lacks. The protected
  fixture was generated once (pypdf, AES-128) and committed. Its content is
  invented.
- An end-to-end run caught that the two samples share a UPI reference on
  purpose, so the bank import correctly flags one duplicate. The spec now
  asserts it.
- One earlier test encoded the unneeded day/month note for ISO dates. It was
  updated with the fix.
- Docker is still unavailable in the build environment, so the Compose stack
  was not re-run. No Docker files changed.

## What remains

| Phase | Next work                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------- |
| 4     | Recurring detection, behavioural insights, money leakage, explainable health score, monthly report |
| 5     | Financial profile, money plan, budgets, what-if simulator                                          |
| 6     | AIProvider, MoneyLens AI chat with guardrails, AI Money Brief                                      |
| 7     | Expo mobile app                                                                                    |
| 8     | Security hardening (parser time limits in a worker), performance, dark mode, E2E in CI, docs pass  |
