import type { TransactionFlow, TransactionSource, TransactionType } from '@moneylens/types';

export interface UploadedFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
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

/** The file could not be read at all; the message is shown to the user. */
export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementParseError';
  }
}
