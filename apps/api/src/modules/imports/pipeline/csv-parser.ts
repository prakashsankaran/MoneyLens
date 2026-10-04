import { parse } from 'csv-parse/sync';
import type { TransactionFlow } from '@moneylens/types';
import { parseStatementAmount } from './amounts';
import { detectDayOrder, parseStatementDate } from './dates';
import {
  extractReference,
  extractUpiId,
  inferTransactionType,
  normalizeReference,
} from './normalize';
import {
  StatementParseError,
  type ParseResult,
  type ParsedRow,
  type TransactionParser,
  type UploadedFile,
} from './types';

type Field =
  'date' | 'description' | 'amount' | 'debit' | 'credit' | 'direction' | 'reference' | 'upi';

/** Header synonyms seen in Indian bank, card and wallet exports. Order = priority. */
const HEADER_SYNONYMS: Record<Field, string[]> = {
  date: [
    'transaction date',
    'txn date',
    'tran date',
    'date',
    'posting date',
    'value date',
    'date time',
    'transaction date time',
  ],
  description: [
    'description',
    'narration',
    'particulars',
    'transaction details',
    'details',
    'remarks',
    'transaction remarks',
    'merchant',
    'merchant name',
    'payee',
    'paid to',
    'name',
  ],
  amount: ['amount', 'amount inr', 'amount rs', 'transaction amount', 'txn amount', 'amt', 'value'],
  debit: [
    'debit',
    'debit amount',
    'withdrawal',
    'withdrawal amt',
    'withdrawal amount',
    'withdrawals',
    'dr',
    'dr amount',
    'paid out',
    'money out',
  ],
  credit: [
    'credit',
    'credit amount',
    'deposit',
    'deposit amt',
    'deposit amount',
    'deposits',
    'cr',
    'cr amount',
    'paid in',
    'money in',
  ],
  direction: [
    'type',
    'dr cr',
    'cr dr',
    'debit credit',
    'transaction type',
    'txn type',
    'dr/cr',
    'cr/dr',
  ],
  reference: [
    'reference',
    'reference no',
    'reference number',
    'ref no',
    'ref no cheque no',
    'chq ref no',
    'cheque ref no',
    'utr',
    'utr no',
    'transaction id',
    'txn id',
    'upi ref no',
    'upi transaction id',
    'rrn',
  ],
  upi: ['upi id', 'vpa', 'upi handle'],
};

function normaliseHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9/ ]/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\/\s*/g, '/');
}

type ColumnMap = Partial<Record<Field, number>>;

function mapColumns(header: string[]): ColumnMap {
  const normalised = header.map(normaliseHeader);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const field of Object.keys(HEADER_SYNONYMS) as Field[]) {
    for (const synonym of HEADER_SYNONYMS[field]) {
      const index = normalised.findIndex(
        (h, i) => !used.has(i) && (h === synonym || h.replace(/\//g, ' ') === synonym),
      );
      if (index >= 0) {
        map[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return map;
}

function isUsableHeader(map: ColumnMap): boolean {
  const hasAmount =
    map.amount !== undefined || (map.debit !== undefined && map.credit !== undefined);
  return map.date !== undefined && map.description !== undefined && hasAmount;
}

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

const DIRECTION_OUT = /^(dr|debit|d|withdrawal|out|paid|sent)$/i;
const DIRECTION_IN = /^(cr|credit|c|deposit|in|received)$/i;

/** Rows that summarise rather than record a transaction. */
const SUMMARY_ROW =
  /^(total|opening balance|closing balance|balance b\/f|balance c\/f|grand total)/i;

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

    const headerIndex = records.slice(0, 30).findIndex((r) => isUsableHeader(mapColumns(r)));
    if (headerIndex < 0) {
      throw new StatementParseError(
        'Could not find the column headings. MoneyLens needs a date, a description and either an amount or debit/credit columns.',
      );
    }
    const columns = mapColumns(records[headerIndex] as string[]);
    const body = records.slice(headerIndex + 1);
    const lineOf = (i: number) => lineNumbers[headerIndex + 1 + i] ?? headerIndex + 2 + i;
    const cell = (r: string[], f: Field) =>
      columns[f] === undefined ? '' : (r[columns[f]] ?? '').trim();

    const warnings: string[] = [];
    const { order, assumed } = detectDayOrder(body.map((r) => cell(r, 'date')));
    if (assumed) warnings.push('Dates were read as day/month/year.');
    if (order === 'MDY')
      warnings.push('Dates were read as month/day/year, as the file uses that order.');

    // With a single amount column and no Dr/Cr column, negative values mean money out.
    // If the file has no negative values at all, direction cannot be known.
    const signedOnly = columns.amount !== undefined && columns.direction === undefined;
    const anyNegative =
      signedOnly && body.some((r) => parseStatementAmount(cell(r, 'amount'))?.flow === 'OUT');
    if (signedOnly && !anyNegative) {
      warnings.push(
        'The file has one amount column with no debit/credit indicator, so every row was treated as money out. Review income rows before confirming.',
      );
    }

    const rows: ParsedRow[] = [];
    let skipped = 0;
    body.forEach((record, i) => {
      if (record.every((c) => !c)) return;
      const rawDate = cell(record, 'date');
      const description = cell(record, 'description');
      if (SUMMARY_ROW.test(description) || SUMMARY_ROW.test(rawDate)) return;

      const date = parseStatementDate(rawDate, order);
      if (!date) {
        skipped += 1;
        warnings.push(`Line ${lineOf(i)} skipped: unreadable date "${rawDate.slice(0, 30)}".`);
        return;
      }

      const rowWarnings: string[] = [];
      let paise: number | null = null;
      let flow: TransactionFlow | null = null;

      if (columns.debit !== undefined || columns.credit !== undefined) {
        const debit = parseStatementAmount(cell(record, 'debit'));
        const credit = parseStatementAmount(cell(record, 'credit'));
        if (debit && credit) rowWarnings.push('Both debit and credit had values; used the debit.');
        if (debit) [paise, flow] = [debit.paise, 'OUT'];
        else if (credit) [paise, flow] = [credit.paise, 'IN'];
      }
      if (paise === null && columns.amount !== undefined) {
        const amount = parseStatementAmount(cell(record, 'amount'));
        if (amount) {
          paise = amount.paise;
          const direction = cell(record, 'direction');
          if (DIRECTION_OUT.test(direction)) flow = 'OUT';
          else if (DIRECTION_IN.test(direction)) flow = 'IN';
          else if (amount.flow) flow = amount.flow;
          else if (anyNegative) flow = 'IN';
          else {
            flow = 'OUT';
            if (columns.direction !== undefined) {
              rowWarnings.push(
                `Unrecognised debit/credit value "${direction}"; treated as money out.`,
              );
            }
          }
        }
      }

      if (paise === null || flow === null) {
        skipped += 1;
        warnings.push(`Line ${lineOf(i)} skipped: no amount.`);
        return;
      }

      const upiFromColumn = cell(record, 'upi').toLowerCase() || null;
      rows.push({
        rowIndex: lineOf(i),
        date,
        amountPaise: paise,
        flow,
        type: inferTransactionType(description, flow),
        description: description || '(no description)',
        upiId: upiFromColumn ?? extractUpiId(description),
        reference: normalizeReference(cell(record, 'reference')) ?? extractReference(description),
        warnings: rowWarnings,
      });
    });

    // Keep the file-level warning list readable for very messy files.
    if (skipped > 10) {
      const lineWarnings = warnings.filter((w) => w.startsWith('Line '));
      const others = warnings.filter((w) => !w.startsWith('Line '));
      warnings.length = 0;
      warnings.push(
        ...others,
        ...lineWarnings.slice(0, 10),
        `${skipped - 10} more lines were skipped.`,
      );
    }

    return { parserName: this.name, source: this.source, rows, warnings };
  }
}
