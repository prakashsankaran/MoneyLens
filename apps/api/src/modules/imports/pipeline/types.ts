import type { TransactionFlow, TransactionSource, TransactionType } from '@moneylens/types';

export interface UploadedFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  /** Password for a protected PDF. Used in memory only, never stored or logged. */
  password?: string;
  /** User-chosen columns for a spreadsheet whose headings were not recognised. */
  mapping?: ColumnMapping;
  /** Aborted when parsing has taken too long; parsers stop at the next check. */
  signal?: AbortSignal;
}

/** Spreadsheet fields MoneyLens reads. */
export const TABLE_FIELDS = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'direction',
  'reference',
  'upi',
] as const;
export type TableField = (typeof TABLE_FIELDS)[number];

/**
 * Manual column choice: the 0-based index of the heading row in the preview
 * and a 0-based column index per field.
 */
export interface ColumnMapping {
  headerRow: number;
  columns: Partial<Record<TableField, number>>;
}

/** One transaction as read from a statement, before categorisation. */
export interface ParsedRow {
  /** 1-based line/row number in the source file, for user-facing messages. */
  rowIndex: number;
  date: Date;
  /** Always positive; direction is in `flow`. */
  amountPaise: number;
  flow: TransactionFlow;
  type: TransactionType;
  description: string;
  upiId: string | null;
  reference: string | null;
  /**
   * Counterparty name when the statement states it separately (e.g. Google
   * Pay's "Paid to Swiggy"); otherwise merchant text is taken from the description.
   */
  counterparty?: string | null;
  warnings: string[];
}

export interface ParseResult {
  parserName: string;
  source: TransactionSource;
  rows: ParsedRow[];
  /** File-level notes: skipped lines, assumed formats. */
  warnings: string[];
}

/**
 * A statement format. Parsers are pure: they never touch the database, so
 * they can be unit-tested with fixture files and new sources plug in without
 * changing the rest of the pipeline.
 */
export interface TransactionParser {
  readonly name: string;
  readonly source: TransactionSource;
  /** 0..1 confidence that this parser understands the file. */
  canParse(file: UploadedFile): number;
  parse(file: UploadedFile): Promise<ParseResult>;
}

/** The first rows of a spreadsheet, so the user can pick its columns. */
export type TablePreview = string[][];

/**
 * The file could not be read; the message is shown to the user.
 * - `UNREADABLE`: recorded as a failed import.
 * - `COLUMNS_NOT_FOUND`: the user can choose the columns from `preview`.
 * - `PASSWORD_REQUIRED` / `PASSWORD_INCORRECT`: the user can supply a password.
 */
export type ParseErrorReason =
  'UNREADABLE' | 'COLUMNS_NOT_FOUND' | 'PASSWORD_REQUIRED' | 'PASSWORD_INCORRECT';

export class StatementParseError extends Error {
  constructor(
    message: string,
    readonly reason: ParseErrorReason = 'UNREADABLE',
    readonly preview?: TablePreview,
  ) {
    super(message);
    this.name = 'StatementParseError';
  }
}

/** Shown when a statement takes longer than the parse deadline. */
export const TOO_SLOW =
  'This file took too long to read. Download a shorter date range and try again.';
