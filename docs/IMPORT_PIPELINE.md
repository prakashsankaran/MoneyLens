# Import pipeline

> **Status (Phase 2):** CSV import is implemented end to end: upload, parse,
> categorise, review, confirm, delete. Google Pay PDF and XLSX parsers, the
> full duplicate-scoring model and the richer review actions (mark as
> transfer, merge merchants) arrive in Phase 3. The design below marks which
> parts exist.

MoneyLens does not depend on a Google Pay API. Users export a statement (a
bank CSV now; Google Pay India e-statement PDF and XLSX in Phase 3) and upload
it. Nothing is saved as a transaction until the user has reviewed and
confirmed the import.

## Flow

```
Upload ─► validate file ─► hash ─► select parser ─► extract rows
   ─► normalise ─► flag duplicates ─► categorise
   ─► ImportTransaction rows (READY_FOR_REVIEW) ─► user review/edit
   ─► POST /imports/:id/confirm ─► Transaction rows ─► analytics
```

| Stage      | What happens (Phase 2)                                                                                                                                                                                                   | Code                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Validate   | One `file` field in memory, `MAX_UPLOAD_MB` limit. Extension allowlist (`.csv`; `.pdf/.xlsx/.xls` get a "Phase 3" message). Content sniffing rejects PDF, ZIP/XLSX, OLE and binary (NUL byte) content in a `.csv`        | `imports.routes.ts`, `imports.service.ts` |
| Store      | **The raw file is not stored.** Only its SHA-256, size, MIME type and a sanitised filename are kept. Re-uploading the same bytes returns `409` with the earlier import's id                                              | `ImportsService.upload`                   |
| Parse      | `selectParser` picks the registered `TransactionParser` with the highest `canParse()` score. Parsers are pure and never touch the database                                                                               | `pipeline/registry.ts`, `csv-parser.ts`   |
| Normalise  | Dates → IST instants (date-only values become 12:00 IST), amounts → positive paise + `flow`, type inferred from wording, UPI ID and reference extracted                                                                  | `dates.ts`, `amounts.ts`, `normalize.ts`  |
| Duplicates | A row whose reference number matches one of the user's existing transactions is marked `DUPLICATE` (excluded by default) with a reason. Never deleted                                                                    | `ImportsService.upload`                   |
| Categorise | User rules → user's merchant mapping → self transfer by type → ~50 well-known Indian merchants → keyword rules → uncategorised. Stores `categoryConfidence`                                                              | `pipeline/categorize.ts`, `merchants.ts`  |
| Review     | Summary (calculated by `importStats` in `@moneylens/analytics`), file warnings, and each row with include/exclude and category. Edits are allowed only while `READY_FOR_REVIEW`                                          | `ImportReviewPage.tsx`                    |
| Confirm    | One database transaction: claims the import (so a double submit cannot commit twice), finds or creates merchants with the statement text as an alias, inserts the transactions, links each staged row to its transaction | `ImportsService.confirm`                  |
| Delete     | Deleting an import deletes exactly the transactions it created (`Transaction.sourceFileId`)                                                                                                                              | `ImportsService.remove`                   |

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
  warnings: string[];
}

interface TransactionParser {
  readonly name: string; // 'csv@1', later 'google-pay-pdf@1'
  readonly source: TransactionSource;
  canParse(file: UploadedFile): number; // 0..1 confidence
  parse(file: UploadedFile): Promise<ParseResult>; // { parserName, source, rows, warnings }
}
```

A file the parser cannot read throws `StatementParseError`; the import is
recorded as `FAILED` with that message so it shows in the history.

## Phase 3 additions

- `GooglePayPdfParser`: extract text with positions, locate the header row by
  keywords, read rows by column position. Encrypted PDFs get a clear message.
- `XlsxTransactionParser`, reusing the CSV column mapping.
- Duplicate scoring beyond reference numbers: same amount, same IST date
  (±1 day), same normalised merchant or UPI ID, same source, and duplicates
  within one file.
- Review actions: mark as transfer, merge merchants, manual column mapping.
- A future `OcrEngine` interface for scanned PDFs.

Parsers are tested with synthetic fixture files only (`apps/api/test/fixtures`).
A fictional sample statement lives in `samples/sample-bank-statement.csv`.
