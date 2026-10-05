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
  type ColumnMapping,
  type ParsedRow,
  type TablePreview,
  type TableField,
} from './types';

/**
 * Shared reader for tabular statements (CSV and Excel). Each format turns its
 * file into rows of text cells; this module finds the columns and turns cells
 * into transactions.
 */

/** Header synonyms seen in Indian bank, card and wallet exports. Order = priority. */
const HEADER_SYNONYMS: Record<TableField, string[]> = {
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

export type ColumnMap = Partial<Record<TableField, number>>;

export function mapColumns(header: string[]): ColumnMap {
  const normalised = header.map(normaliseHeader);
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const field of Object.keys(HEADER_SYNONYMS) as TableField[]) {
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

export function isUsableHeader(map: ColumnMap): boolean {
  const hasAmount =
    map.amount !== undefined || (map.debit !== undefined && map.credit !== undefined);
  return map.date !== undefined && map.description !== undefined && hasAmount;
}

const DIRECTION_OUT = /^(dr|debit|d|withdrawal|out|paid|sent)$/i;
const DIRECTION_IN = /^(cr|credit|c|deposit|in|received)$/i;

/** Rows that summarise rather than record a transaction. */
const SUMMARY_ROW =
  /^(total|opening balance|closing balance|balance b\/f|balance c\/f|grand total)/i;

/** Rows searched for a heading row, and rows shown when the user picks columns. */
export const HEADER_SEARCH_ROWS = 30;
export const PREVIEW_ROWS = 15;
const PREVIEW_COLUMNS = 12;
const PREVIEW_CELL = 40;

/** The first rows of the file, trimmed for display in the column picker. */
export function tablePreview(records: string[][]): TablePreview {
  return records
    .slice(0, PREVIEW_ROWS)
    .map((r) => r.slice(0, PREVIEW_COLUMNS).map((c) => (c ?? '').trim().slice(0, PREVIEW_CELL)));
}

/**
 * Turn table rows into transactions. `lineNumbers[i]` is the 1-based source
 * line or sheet row of `records[i]`, used in messages. With `mapping`, the
 * user's column choice replaces heading detection.
 */
export function parseTable(
  records: string[][],
  lineNumbers: number[],
  mapping?: ColumnMapping,
): { rows: ParsedRow[]; warnings: string[] } {
  let headerIndex: number;
  let columns: ColumnMap;
  if (mapping) {
    headerIndex = mapping.headerRow;
    columns = mapping.columns;
    const width = Math.max(0, ...records.slice(0, PREVIEW_ROWS).map((r) => r.length));
    const indexes = Object.values(columns);
    const valid =
      Number.isInteger(headerIndex) &&
      headerIndex >= 0 &&
      headerIndex < Math.min(records.length, PREVIEW_ROWS) &&
      indexes.every((c) => Number.isInteger(c) && c >= 0 && c < width) &&
      new Set(indexes).size === indexes.length &&
      columns.date !== undefined &&
      columns.description !== undefined &&
      (columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined);
    if (!valid) {
      throw new StatementParseError(
        'Those columns do not fit this file. Choose a date, a description and an amount (or debit/credit) column.',
        'COLUMNS_NOT_FOUND',
        tablePreview(records),
      );
    }
  } else {
    headerIndex = records
      .slice(0, HEADER_SEARCH_ROWS)
      .findIndex((r) => isUsableHeader(mapColumns(r)));
    if (headerIndex < 0) {
      throw new StatementParseError(
        'Could not find the column headings. Choose which columns hold the date, description and amount.',
        'COLUMNS_NOT_FOUND',
        tablePreview(records),
      );
    }
    columns = mapColumns(records[headerIndex] as string[]);
  }
  const body = records.slice(headerIndex + 1);
  const lineOf = (i: number) => lineNumbers[headerIndex + 1 + i] ?? headerIndex + 2 + i;
  const cell = (r: string[], f: TableField) =>
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

  return { rows, warnings };
}
