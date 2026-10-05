# Import pipeline

> **Status (Phase 3):** Google Pay statement PDFs (including password
> protected ones), bank CSV and Excel (.xlsx) exports are imported end to end:
> upload, parse, categorise, duplicate check, review, confirm, delete. A
> scanned (image-only) PDF is explained, not read; OCR is a later addition.

MoneyLens does not depend on a Google Pay API. Users download a statement
(the Google Pay statement PDF, or a bank CSV/Excel export) and upload it.
Nothing is saved as a transaction until the user has reviewed and confirmed
the import.

## Flow

```
Upload ─► validate file ─► hash ─► select parser ─► extract rows
   ─► normalise ─► flag duplicates ─► categorise
   ─► ImportTransaction rows (READY_FOR_REVIEW) ─► user review/edit
   ─► POST /imports/:id/confirm ─► Transaction rows ─► analytics
```

| Stage      | What happens                                                                                                                                                                                                                                                                                                                                   | Code                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Validate   | One `file` field in memory, `MAX_UPLOAD_MB` limit, plus optional `password` and `mapping` fields. Extensions `.pdf`, `.csv`, `.xlsx` (`.xls` gets a "save as .xlsx or CSV" message). Content sniffing: a `.csv` must be text, a `.xlsx` a ZIP, a `.pdf` a PDF. An encrypted workbook (OLE container) is explained                              | `imports.routes.ts`, `imports.service.ts`                  |
| Store      | **The raw file is not stored.** Only its SHA-256, size, MIME type and a sanitised filename are kept. Re-uploading the same bytes returns `409` with the earlier import's id                                                                                                                                                                    | `ImportsService.upload`                                    |
| Parse      | `selectParser` picks the registered `TransactionParser` with the highest `canParse()` score: `csv@1`, `xlsx@1`, `google-pay-pdf@1`. Parsers are pure and never touch the database. Problems the user can fix (password, unrecognised columns) return `400` with `details.reason` and no history entry; anything else becomes a `FAILED` import | `pipeline/registry.ts`, `*-parser.ts`, `google-pay-pdf.ts` |
| Normalise  | Dates → IST instants (date-only values become 12:00 IST), amounts → positive paise + `flow`, type inferred from wording, UPI ID and reference extracted                                                                                                                                                                                        | `dates.ts`, `amounts.ts`, `normalize.ts`                   |
| Duplicates | Scored against the user's transactions near the statement dates (see below). A likely duplicate is marked `DUPLICATE` (excluded by default) with a reason the user can read. Never deleted                                                                                                                                                     | `pipeline/duplicates.ts`                                   |
| Categorise | Merchant text comes from the statement's counterparty when it states one (Google Pay "Paid to …"), else from the narration. Then: user rules → user's merchant mapping → self transfer by type → ~50 well-known Indian merchants → keyword rules → uncategorised. Stores `categoryConfidence`                                                  | `pipeline/categorize.ts`, `merchants.ts`                   |
| Review     | Summary (calculated by `importStats` in `@moneylens/analytics`), file warnings, and per row: include/exclude, category, merchant name, type, and "duplicate". A category, merchant or type change can be applied to the same merchant's other rows. Edits only while `READY_FOR_REVIEW`                                                        | `ImportReviewPage.tsx`                                     |
| Confirm    | One database transaction: claims the import (so a double submit cannot commit twice), finds or creates merchants with the statement text as an alias, inserts the transactions, links each staged row to its transaction                                                                                                                       | `ImportsService.confirm`                                   |
| Delete     | Deleting an import deletes exactly the transactions it created (`Transaction.sourceFileId`)                                                                                                                                                                                                                                                    | `ImportsService.remove`                                    |

## CSV parser (`csv@1`)

Built for the exports Indian banks and apps produce:

- **Encoding and layout:** UTF-8 with or without BOM. Delimiter detected
  (comma, semicolon, tab, pipe). The header row is found within the first 30
  rows, so account preambles are skipped.
- **Columns** are matched by synonyms (`Date`, `Txn Date`, `Value Date`,
  `Narration`, `Description`, `Particulars`, `Withdrawal Amt.`, `Debit`,
  `Deposit Amt.`, `Credit`, `Amount (INR)`, `Dr/Cr`, `Chq./Ref.No.`,
  `UPI ID`, …). Three amount layouts are supported: separate debit and credit
  columns; one amount column with a Dr/Cr column; one signed amount column.
  If a signed column has no negative values at all, every row is treated as
  money out and a warning says so.
- **Amounts:** `₹`, `Rs.`, `INR`, Indian digit grouping (`1,45,000.00`),
  brackets and minus signs, `Dr`/`Cr` suffixes.
- **Dates:** ISO, `DD/MM/YYYY`, `DD-MM-YY`, `05 Sep 2026`, `Sep 5, 2026`, with
  optional time. Day/month order is detected from the file; when it cannot be
  told apart, day-first is assumed and a file warning says so.
- **Skipped lines** (summary rows such as "Opening Balance", rows without a
  valid date or amount) become warnings with their line numbers, never silent
  drops.
- **References** are normalised for matching: leading zeros are removed and
  placeholders such as `0000000000` are ignored.

## Parser contract

```ts
interface ParsedRow {
  rowIndex: number; // 1-based source line
  date: Date; // IST instant
  amountPaise: number; // positive
  flow: 'IN' | 'OUT';
  type: TransactionType;
  description: string;
  upiId: string | null;
  reference: string | null;
  counterparty?: string | null; // e.g. Google Pay's "Paid to Swiggy"
  warnings: string[];
}

interface TransactionParser {
  readonly name: string; // 'csv@1', 'xlsx@1', 'google-pay-pdf@1'
  readonly source: TransactionSource;
  canParse(file: UploadedFile): number; // 0..1 confidence
  // UploadedFile may carry a PDF `password` and a column `mapping`
  parse(file: UploadedFile): Promise<ParseResult>; // { parserName, source, rows, warnings }
}
```

A file the parser cannot read throws `StatementParseError`. Its `reason` is
`UNREADABLE` (recorded as a `FAILED` import so it shows in the history) or
one the user can resolve: `PASSWORD_REQUIRED`, `PASSWORD_INCORRECT`,
`COLUMNS_NOT_FOUND` (with a `preview`).

## Excel parser (`xlsx@1`)

Reads `.xlsx` with `read-excel-file`. Every sheet is turned into rows of text
(date cells become `YYYY-MM-DD`, keeping the calendar day Excel shows) and
read by the same column detection and row rules as CSV (`pipeline/tabular.ts`).
The first sheet with recognisable headings is used, and the review says which
sheet when there are several. Legacy `.xls` and password-protected workbooks
are explained rather than read.

## Choosing columns by hand

When no heading row is recognised in the first 30 rows of a CSV or Excel
file, the upload returns `400` with `details.reason = "COLUMNS_NOT_FOUND"`
and `details.preview`: the first 15 rows, at most 12 columns and 40
characters per cell. The web app shows that preview and lets the user pick
the heading row and the date, description, amount (or money out / money in),
debit/credit marker and reference columns, then re-sends the file with
`mapping = {"headerRow": n, "columns": {"date": 0, ...}}`. A mapping that does
not fit the file (unknown column, the same column twice, no amount) is
refused the same way.

## Google Pay statement parser (`google-pay-pdf@1`)

**Assumption, stated plainly:** the layout below comes from public
descriptions of the Google Pay (India) statement PDF, not from a real user's
statement. The tests use synthetic PDFs built at test time
(`apps/api/test/fixtures/statements.ts`). If a real statement differs, the
parser fails with a clear message or a summary-mismatch warning rather than
importing wrong numbers silently, and the layout rules live in one file.

```
Date & time      Transaction details                      Amount
01 Sep, 2026     Paid to Swiggy                           ₹450
09:15 AM         UPI Transaction ID: 424698765432
                 Paid by HDFC Bank 1234
```

- **Text with positions** is extracted with `pdfjs-dist` (no fonts, scripts
  or network), at most 200 pages. Words on the same baseline (within 2pt)
  form a line.
- **Columns** come from each page's heading row ("Date & time",
  "Transaction details", "Amount"), whether the PDF writes the headings as
  phrases or word by word. Everything above the heading row (name, phone,
  email, the statement period) and page footers is ignored.
- **A transaction** starts at a line whose date column reads `DD Mon, YYYY`.
  The time below it gives the IST time. Details lines before the
  `UPI Transaction ID` line are the payee, so a name wrapped over two lines is
  joined. The `Paid by …` / `Paid to … Bank …` line closes the transaction (a
  payee that is itself a bank, such as "Paid to HDFC Bank Credit Card", is not
  mistaken for it).
- **Direction** comes from the wording: "Paid to", "Sent to" and "Self
  transfer to" are money out; "Received from", "Refund from", "Cashback from"
  are money in. Unfamiliar wording falls back to the account line ("Paid by"
  = out), with a row warning.
- **Counterparty** ("Swiggy", "Arjun Mehta") is stored as the merchant
  candidate, so people and shops keep readable names.
- **Reference:** the UPI transaction ID, normalised like CSV references, so
  the same payment in a bank statement is recognised.
- **Cross-check:** the statement's own "Sent" and "Received" totals are
  compared with the rows read (a CALCULATION). A mismatch becomes a file
  warning naming both figures; a missing summary is also noted.
- **Passwords:** a protected PDF returns `400` with
  `details.reason = "PASSWORD_REQUIRED"`, a wrong password
  `"PASSWORD_INCORRECT"`. The password is sent with the file, handed to the
  PDF reader in memory, and never stored, logged or returned.
- **Not a Google Pay statement / no text:** a PDF without the heading row is
  refused with a message suggesting CSV or Excel for bank statements; an
  image-only PDF is reported as probably scanned.

## Duplicate detection

`findDuplicates` (pure, in `pipeline/duplicates.ts`) compares each new row
with the user's transactions from one day before the statement's first date
to one day after its last, plus any transaction sharing a reference number:

| Signal                                    | Effect                   |
| ----------------------------------------- | ------------------------ |
| Same reference number                     | Duplicate (score 10)     |
| Different reference numbers on both sides | Never a duplicate        |
| Amount or direction differ                | Never a duplicate        |
| Same IST day                              | +3                       |
| One day apart                             | +1 (bank posting delays) |
| More than one day apart                   | Never a duplicate        |
| Same merchant (normalised name)           | +3                       |
| Same UPI ID                               | +3                       |

A score of 4 or more marks the row `DUPLICATE` with a reason such as "Same
amount, same day and same merchant as a transaction you already have". Each
existing transaction can absorb only one new row, so two genuine ₹20 teas on
the same day against one recorded tea flag only one. Inside a single file only
a repeated reference number counts: a statement listing two equal payments
means two payments. The user can include a flagged row, or mark any row as a
duplicate, during review.

## Still to come

- An `OcrEngine` interface for scanned PDFs (Phase 8 or later).
- Statement layouts beyond Google Pay as PDFs (bank PDFs).

Parsers are tested with synthetic fixture files only (`apps/api/test/fixtures`):
CSVs, workbooks and PDFs built at test time, plus one password-protected PDF
(`gpay-protected.pdf`, password `ASHA0101`, invented content). Fictional
samples for trying the app live in `samples/`.
