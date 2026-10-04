# Import pipeline (design; phases 2–3)

> **Status:** designed, not implemented. The database tables (`Import`,
> `ImportTransaction`, `Merchant`, `MerchantAlias`, `UserCategoryRule`) exist
> from Phase 1. CSV import lands in phase 2. Google Pay PDF, XLSX, the review
> screen and duplicate detection land in phase 3.

MoneyLens does not depend on a Google Pay API. Users export a statement (Google
Pay India e-statement PDF, or a bank CSV/XLSX) and upload it. Nothing is saved
as a transaction until the user has reviewed and confirmed the import.

## Flow

```
Upload ─► validate file ─► store (private) ─► detect parser ─► extract rows
   ─► normalise ─► validate rows ─► detect duplicates ─► categorise
   ─► ImportTransaction rows (READY_FOR_REVIEW) ─► user review/edit
   ─► POST /imports/:id/confirm ─► Transaction rows ─► analytics
```

| Stage      | Responsibility                                                                            | Notes                                                                    |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Validate   | extension allowlist (`.pdf .csv .xlsx`), magic-byte sniff, `MAX_UPLOAD_MB`, page/row caps | Reject encrypted PDFs with a clear message                               |
| Store      | `FileStorage` interface; local disk in dev, S3-compatible later                           | Random key, outside web root; `sha256` flags re-uploads                  |
| Parse      | `TransactionParser` chosen by `canParse()` confidence                                     | Parsers never touch the DB                                               |
| Normalise  | dates → IST instant, amounts → positive paise + `flow`, type mapping                      | Ambiguous dates add a row warning                                        |
| Duplicates | deterministic scoring against existing transactions and within the file                   | Never deletes; marks `DUPLICATE` with a reason                           |
| Categorise | user rules → merchant alias → merchant default → keyword rules → Uncategorized            | Stores `categoryConfidence`                                              |
| Review     | summary + editable preview                                                                | Edit category/merchant, exclude, mark transfer/duplicate, merge merchant |
| Confirm    | single DB transaction creating `Transaction` rows                                         | Corrections can become `UserCategoryRule`s                               |

## Parser contract

```ts
interface ParsedRow {
  rowIndex: number;
  date: Date; // IST instant
  amountPaise: number; // positive
  flow: 'IN' | 'OUT';
  type: TransactionType; // best guess, UNKNOWN allowed
  rawDescription: string;
  counterparty?: string;
  upiId?: string;
  reference?: string;
  warnings: string[];
}

interface TransactionParser {
  readonly name: string; // 'google-pay-pdf@1'
  readonly source: TransactionSource;
  canParse(file: UploadedFile): Promise<number>; // 0..1 confidence
  parse(
    file: UploadedFile,
  ): Promise<{ rows: ParsedRow[]; period?: { start: Date; end: Date }; warnings: string[] }>;
}
```

Implementations: `GooglePayPdfParser`, `CsvTransactionParser` (with column
mapping for common Indian bank exports and a manual mapping fallback),
`XlsxTransactionParser`. The PDF parser extracts text with positions and does
not assume one fixed layout: it locates the header row by keywords and reads
rows by column positions. Unparseable lines become warnings, never silent
drops. A future `OcrEngine` interface plugs in for scanned PDFs.

Parsers are tested with fixture files (synthetic, no real personal data),
including layout variants, multi-page statements, ₹ and comma formats,
Cr/Dr columns, and malformed rows.

## Duplicate detection

The same reference (UPI/bank ref) is a strong match. Otherwise the score
combines same amount, same IST date (±1 day for settlement lag), same
normalised merchant/UPI ID and same source. Rows above a threshold are marked
`DUPLICATE` with `duplicateOfId` and a human-readable `duplicateReason`; the
user decides. Re-uploading a file with the same `sha256` is flagged up front.

## Review summary

Transactions detected, date range, total debits, total credits, possible
duplicates and uncategorised count. All figures are computed by the analytics
package, not by the UI.
