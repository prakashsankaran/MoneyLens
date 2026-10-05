import { parse } from 'csv-parse/sync';
import { parseTable } from './tabular';
import {
  StatementParseError,
  type ParseResult,
  type TransactionParser,
  type UploadedFile,
} from './types';

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 20).join('\n');
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLines.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function decode(buffer: Buffer): string {
  if (buffer.includes(0)) {
    throw new StatementParseError('This file does not look like a CSV text file.');
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return text.replace(/^\uFEFF/, '');
}

/**
 * Generic CSV statement parser. Finds the header row (exports often start with
 * account details), maps columns by common header names, and supports either a
 * single signed amount column (optionally with a Dr/Cr column) or separate
 * debit and credit columns.
 */
export class CsvTransactionParser implements TransactionParser {
  readonly name = 'csv@1';
  readonly source = 'CSV' as const;

  canParse(file: UploadedFile): number {
    const ext = file.filename.toLowerCase().split('.').pop();
    if (ext === 'csv') return 0.9;
    if (file.mimeType === 'text/csv') return 0.8;
    return 0;
  }

  async parse(file: UploadedFile): Promise<ParseResult> {
    const text = decode(file.buffer);
    let records: string[][];
    let lineNumbers: number[];
    try {
      const parsed = parse(text, {
        delimiter: detectDelimiter(text),
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        info: true,
      }) as unknown as { record: string[]; info: { lines: number } }[];
      records = parsed.map((p) => p.record);
      // Source line numbers, so messages match what the user sees in the file.
      lineNumbers = parsed.map((p) => p.info.lines);
    } catch {
      throw new StatementParseError(
        'The CSV file could not be read. Check that it is a valid CSV export.',
      );
    }

    const { rows, warnings } = parseTable(records, lineNumbers, file.mapping);
    return { parserName: this.name, source: this.source, rows, warnings };
  }
}
