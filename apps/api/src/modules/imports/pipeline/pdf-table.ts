import type { TransactionFlow } from '@moneylens/types';
import { parseStatementAmount } from './amounts';
import { detectDayOrder, parseStatementDate, type DayOrder } from './dates';
import {
  extractReference,
  extractUpiId,
  inferTransactionType,
  normalizeReference,
} from './normalize';
import type { PdfLine } from './pdf-text';
import { DIRECTION_IN, DIRECTION_OUT, normaliseHeader, SUMMARY_ROW } from './tabular';
import { StatementParseError, type ParsedRow } from './types';

/**
 * Statement PDFs laid out as a table: bank account statements (HDFC, ICICI,
 * SBI, Axis, Kotak and most others), PhonePe and Paytm. Built from public
 * descriptions of those statements, not from real customers' files:
 *
 *   Date       Narration                 Chq./Ref.No.  Withdrawal  Deposit   Balance
 *   01/10/26   UPI-SWIGGY-swiggy@icici   424512345678  450.00                12,550.00
 *              -PAYMENT
 *
 *   Date          Transaction Details        Type     Amount
 *   Oct 01, 2026  Paid to Swiggy             DEBIT    ₹450
 *   10:30 am      Transaction ID T2610011030...
 *                 UTR No. 424512345678
 *
 * The heading row names the columns; each later line's words go to the
 * column they sit under. A line with a date in the date column starts a
 * transaction, and the lines under it continue its description.
 */

type Field =
  | 'date'
  | 'valueDate'
  | 'description'
  | 'reference'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'direction'
  | 'balance'
  | 'other';

/** Heading words (as `normaliseHeader` writes them) for each column. */
const HEADINGS: [Field, string[]][] = [
  [
    'date',
    [
      'transaction date',
      'txn date',
      'tran date',
      'trans date',
      'txn dt',
      'date',
      'posting date',
      'post date',
      'date time',
      'transaction date time',
      'date and time',
    ],
  ],
  ['valueDate', ['value date', 'value dt', 'val date', 'value']],
  [
    'description',
    [
      'description',
      'narration',
      'particulars',
      'transaction details',
      'transaction remarks',
      'transaction description',
      'transaction particulars',
      'remarks',
      'details',
    ],
  ],
  [
    'reference',
    [
      'chq/ref no',
      'chq ref no',
      'ref no/cheque no',
      'ref no cheque no',
      'cheque no',
      'chq no',
      'cheque number',
      'reference no',
      'reference number',
      'ref no',
      'reference',
      'utr no',
    ],
  ],
  [
    'debit',
    [
      'withdrawal amt',
      'withdrawal amount',
      'withdrawals',
      'withdrawal',
      'debit amount',
      'debits',
      'debit',
      'dr',
    ],
  ],
  [
    'credit',
    [
      'deposit amt',
      'deposit amount',
      'deposits',
      'deposit',
      'credit amount',
      'credits',
      'credit',
      'cr',
    ],
  ],
  ['amount', ['transaction amount', 'amount', 'amt']],
  [
    'direction',
    ['type', 'dr/cr', 'cr/dr', 'dr cr', 'cr dr', 'debit/credit', 'txn type', 'transaction type'],
  ],
  [
    'balance',
    ['closing balance', 'running balance', 'available balance', 'balance amount', 'balance'],
  ],
  [
    'other',
    [
      's no',
      'sl no',
      'sr no',
      'serial no',
      'init br',
      'branch',
      'your account',
      'account',
      'time',
      'category',
      'tags',
      'notes',
    ],
  ],
];

const HEADING_FIELD = new Map<string, Field>(
  HEADINGS.flatMap(([field, words]) => words.map((w) => [w, field] as const)),
);
/** The longest heading is four words ("ref no cheque no"). */
const MAX_HEADING_WORDS = 4;

interface Column {
  field: Field;
  x: number;
  /** Right edge of the heading text. */
  right: number;
}

/** Width of a word when the PDF did not say: about 5 points per character. */
const widthOf = (item: { text: string; w?: number }) => item.w ?? item.text.length * 5;

function fieldOf(text: string): Field | undefined {
  const h = normaliseHeader(text);
  return HEADING_FIELD.get(h) ?? HEADING_FIELD.get(h.replace(/\//g, ' '));
}

/** The columns a heading line names, or null when it is not a heading. */
function readHeading(items: PdfLine['items']): Column[] | null {
  const columns: Column[] = [];
  for (let i = 0; i < items.length;) {
    let matched = 0;
    let field: Field | undefined;
    for (let k = Math.min(MAX_HEADING_WORDS, items.length - i); k >= 1; k -= 1) {
      field = fieldOf(
        items
          .slice(i, i + k)
          .map((it) => it.text)
          .join(' '),
      );
      if (field) {
        matched = k;
        break;
      }
    }
    const first = items[i] as PdfLine['items'][number];
    if (matched > 0 && field) {
      const last = items[i + matched - 1] as PdfLine['items'][number];
      columns.push({ field, x: first.x, right: last.x + widthOf(last) });
      i += matched;
    } else {
      // An unknown heading still bounds its neighbours.
      if (normaliseHeader(first.text)) {
        columns.push({ field: 'other', x: first.x, right: first.x + widthOf(first) });
      }
      i += 1;
    }
  }
  const has = (f: Field) => columns.some((c) => c.field === f);
  const usable =
    (has('date') || has('valueDate')) &&
    has('description') &&
    (has('amount') || has('debit') || has('credit'));
  if (!usable) return null;
  // With both, the transaction date is the date; a lone "Value Date" is the date.
  if (!has('date')) {
    const value = columns.find((c) => c.field === 'valueDate') as Column;
    value.field = 'date';
  }
  return columns;
}

const DATE_LIKE =
  /^(\d{1,4}[-/. ]\d{1,2}[-/. ]\d{2,4}|\d{1,2}[\s-]?[A-Za-z]{3,9}[\s,-]*\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/;

/**
 * Headings sometimes wrap onto a second line ("Withdrawal" over "Amt.").
 * Join the second line's words onto the heading word above them.
 */
function mergeHeadingLines(a: PdfLine, b: PdfLine): PdfLine['items'] {
  const items = a.items.map((i) => ({ ...i }));
  for (const word of b.items) {
    const above = items.find((i) => Math.abs(i.x - word.x) <= 25);
    if (above) {
      above.text = `${above.text} ${word.text}`;
      above.w = Math.max(widthOf(above), word.x + widthOf(word) - above.x);
    } else {
      items.push({ ...word });
    }
  }
  return items.sort((p, q) => p.x - q.x);
}

/** Find a heading at line `i`; returns its columns and how many lines it used. */
function headingAt(lines: PdfLine[], i: number): { columns: Column[]; used: number } | null {
  const line = lines[i] as PdfLine;
  const single = readHeading(line.items);
  const next = lines[i + 1];
  const canMerge =
    next &&
    next.page === line.page &&
    next.y - line.y <= 16 &&
    !next.items.some((item) => DATE_LIKE.test(item.text));
  const merged = canMerge ? readHeading(mergeHeadingLines(line, next)) : null;
  const known = (cols: Column[] | null) => cols?.filter((c) => c.field !== 'other').length ?? 0;
  if (merged && known(merged) > known(single)) return { columns: merged, used: 2 };
  return single ? { columns: single, used: 1 } : null;
}

const NUMERIC_FIELDS = new Set<Field>(['debit', 'credit', 'amount', 'balance']);
/** Amount-looking text: a currency sign, paise, or Indian digit grouping. */
const AMOUNT_TEXT =
  /^[-+]?\s?(?:(?:₹|Rs\.?|INR)\s?[-+]?\s?[\d,]+(?:\.\d{1,2})?|[\d,]*\d\.\d{2}|\d{1,3}(?:,\d{2,3})+)(?:\s?(?:Cr|Dr|CR|DR))?$/;

/** Put each word of a line under its column. */
function splitLine(line: PdfLine, columns: Column[]): Partial<Record<Field, string>> {
  const numeric = columns.filter((c) => NUMERIC_FIELDS.has(c.field));
  const out: Partial<Record<Field, string[]>> = {};
  for (const item of line.items) {
    let column: Column | undefined;
    if (numeric.length > 0 && AMOUNT_TEXT.test(item.text)) {
      // Amounts are usually right-aligned: match by centre to the nearest
      // amount column.
      const centre = item.x + widthOf(item) / 2;
      column = numeric.reduce((best, c) =>
        Math.abs((c.x + c.right) / 2 - centre) < Math.abs((best.x + best.right) / 2 - centre)
          ? c
          : best,
      );
    } else {
      // Text is left-aligned under its heading.
      column = columns.filter((c) => c.x <= item.x + 8).at(-1) ?? columns[0];
    }
    if (!column) continue;
    (out[column.field] ??= []).push(item.text);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, (v as string[]).join(' ').replace(/\s+/g, ' ').trim()]),
  ) as Partial<Record<Field, string>>;
}

interface Block {
  page: number;
  lastY: number;
  date: string;
  time: string;
  details: string[];
  references: string[];
  debit: string;
  credit: string;
  amount: string;
  direction: string;
  balance: string;
  closed: boolean;
}

/** Lines that end a statement's table. */
const TABLE_END =
  /^(\*+\s*end of statement|end of statement|statement summary|opening balance|closing balance|grand total|total\b|page \d+|this is a (computer|system) generated)/i;
const OPENING = /^(opening balance|balance b\/f|balance brought forward|b\/f)\b/i;
const TIME_ONLY = /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?$/;
/** Continuation lines further below the last one than this belong to something else. */
const MAX_LINE_GAP = 24;

/** Lines inside a transaction's details that are not its description. */
const DETAIL_NOISE =
  /^(Transaction ID|Txn ID|UTR|UPI Ref|UPI Transaction ID|Order ID|Paid by|Debited from|Credited to|Tag|Note|Your Account|UPI ID)\b/i;
const UTR = /\bUTR\s*(?:No\.?|Number)?\s*:?\s*([A-Za-z0-9]{6,})/i;
const UPI_REF = /\bUPI\s*Ref\.?\s*(?:No\.?)?\s*:?\s*(\d{6,})/i;
const ACTION =
  /^(Paid to|Sent to|Received from|Refund from|Money sent to|Payment to|Payment from|Cashback from|Self transfer to|Self transfer from)\s+(.+)$/i;

/** Statement issuers, for the import record. */
const ISSUERS: [string, RegExp][] = [
  ['phonepe', /\bPhonePe\b/i],
  ['paytm', /\bPaytm\b/i],
  ['hdfc', /\bHDFC\s*BANK\b/i],
  ['icici', /\bICICI\s*BANK\b/i],
  ['sbi', /\bState\s+Bank\s+of\s+India\b|\bSBI\b/i],
  ['axis', /\bAxis\s+Bank\b/i],
  ['kotak', /\bKotak\b/i],
  ['yes', /\bYES\s+BANK\b/i],
  ['idfc', /\bIDFC\s+FIRST\b/i],
  ['indusind', /\bIndusInd\b/i],
  ['federal', /\bFederal\s+Bank\b/i],
  ['canara', /\bCanara\s+Bank\b/i],
  ['bob', /\bBank\s+of\s+Baroda\b/i],
  ['pnb', /\bPunjab\s+National\s+Bank\b/i],
  ['union', /\bUnion\s+Bank\b/i],
];

/**
 * Who issued the statement, from the text above its table (the table itself
 * names merchants such as Paytm, so it is not searched).
 */
export function detectIssuer(lines: PdfLine[]): string | null {
  const first = lines.findIndex((_, i) => headingAt(lines, i) !== null);
  const text = lines
    .slice(0, first >= 0 ? first : 60)
    .map((l) => l.items.map((i) => i.text).join(' '))
    .join('\n');
  return ISSUERS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Read every transaction from a table statement's lines. Pure, for tests. */
export function parseStatementTableLines(lines: PdfLine[]): {
  rows: ParsedRow[];
  warnings: string[];
} {
  // First pass: where the headings are, and every date-column value, so the
  // day order (01/02 = 1 Feb or 2 Jan) is decided from the whole file.
  const tableLines: { line: PdfLine; columns: Column[] }[] = [];
  let columns: Column[] | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = headingAt(lines, i);
    if (heading) {
      columns = heading.columns;
      i += heading.used - 1;
      continue;
    }
    if (columns) tableLines.push({ line: lines[i] as PdfLine, columns });
  }
  if (tableLines.length === 0 && !columns) {
    throw new StatementParseError(
      'MoneyLens could not find the transaction table in this PDF. It reads Google Pay, PhonePe and Paytm statements and most bank statement PDFs; if this one does not work, download it from your bank as CSV or Excel instead.',
    );
  }
  const dateTexts = tableLines
    .map(({ line, columns: cols }) => splitLine(line, cols).date ?? '')
    .filter((t) => DATE_LIKE.test(t));
  const { order } = detectDayOrder(dateTexts);

  const blocks: Block[] = [];
  let current: Block | null = null;
  let openingPaise: number | null = null;
  for (const { line, columns: cols } of tableLines) {
    const cells = splitLine(line, cols);
    const whole = line.items.map((i) => i.text).join(' ');
    if (blocks.length === 0 && openingPaise === null && OPENING.test(cells.description ?? whole)) {
      openingPaise = parseStatementAmount(cells.balance)?.paise ?? null;
    }
    const dateText = cells.date ?? '';
    const isDate = DATE_LIKE.test(dateText) && parseStatementDate(dateText, order) !== null;
    if (isDate && !SUMMARY_ROW.test(cells.description ?? '')) {
      current = {
        page: line.page,
        lastY: line.y,
        date: dateText,
        time: '',
        details: cells.description ? [cells.description] : [],
        references: cells.reference ? [cells.reference] : [],
        debit: cells.debit ?? '',
        credit: cells.credit ?? '',
        amount: cells.amount ?? '',
        direction: cells.direction ?? '',
        balance: cells.balance ?? '',
        closed: false,
      };
      blocks.push(current);
      continue;
    }
    if (!current || current.closed) continue;
    if (
      line.page !== current.page ||
      line.y - current.lastY > MAX_LINE_GAP ||
      TABLE_END.test(whole) ||
      SUMMARY_ROW.test(cells.description ?? '')
    ) {
      current.closed = true;
      continue;
    }
    current.lastY = line.y;
    if (TIME_ONLY.test(dateText)) current.time = dateText;
    else if (dateText && !cells.description) current.details.push(dateText);
    if (cells.description) current.details.push(cells.description);
    if (cells.reference) current.references.push(cells.reference);
    current.debit ||= cells.debit ?? '';
    current.credit ||= cells.credit ?? '';
    current.amount ||= cells.amount ?? '';
    current.direction ||= cells.direction ?? '';
    current.balance ||= cells.balance ?? '';
  }

  if (blocks.length === 0) {
    throw new StatementParseError('No transactions were found in this statement PDF.');
  }

  const warnings: string[] = [];
  const rows: (ParsedRow & { balancePaise: number | null; guessed: boolean })[] = [];
  blocks.forEach((block, n) => {
    const line = n + 1;
    const date = parseStatementDate(`${block.date} ${block.time}`.trim(), order as DayOrder);
    const rowWarnings: string[] = [];
    let paise: number | null = null;
    let flow: TransactionFlow | null = null;

    const debit = parseStatementAmount(block.debit);
    const credit = parseStatementAmount(block.credit);
    if (debit && credit)
      rowWarnings.push('Both withdrawal and deposit had values; used the withdrawal.');
    if (debit) [paise, flow] = [debit.paise, 'OUT'];
    else if (credit) [paise, flow] = [credit.paise, 'IN'];
    else {
      const amount = parseStatementAmount(block.amount);
      if (amount) {
        paise = amount.paise;
        const direction = block.direction.replace(/[^A-Za-z]/g, '');
        if (DIRECTION_OUT.test(direction)) flow = 'OUT';
        else if (DIRECTION_IN.test(direction)) flow = 'IN';
        else flow = amount.flow;
      }
    }

    const allDetails = block.details.join(' ');
    const description =
      block.details
        .filter((d, i) => i === 0 || !DETAIL_NOISE.test(d))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() || '(no description)';
    const action = ACTION.exec(block.details[0] ?? '');
    if (!flow && action) {
      flow = /^(paid to|sent to|money sent to|payment to|self transfer to)$/i.test(
        action[1] as string,
      )
        ? 'OUT'
        : 'IN';
    }
    let guessed = false;
    if (!flow) {
      flow = 'OUT';
      guessed = true;
    }

    if (!date || paise === null) {
      warnings.push(
        `Transaction ${line} skipped: ${!date ? `unreadable date "${block.date.slice(0, 30)}"` : 'no amount'}.`,
      );
      return;
    }

    const referenceText = block.references.join('').replace(/\s+/g, '');
    const reference =
      normalizeReference(UTR.exec(allDetails)?.[1]) ??
      normalizeReference(UPI_REF.exec(allDetails)?.[1]) ??
      normalizeReference(referenceText) ??
      extractReference(allDetails);

    rows.push({
      rowIndex: line,
      date,
      amountPaise: paise,
      flow,
      type: inferTransactionType(description, flow),
      description,
      upiId: extractUpiId(allDetails),
      reference,
      counterparty: action?.[2]?.trim() || null,
      warnings: rowWarnings,
      balancePaise: parseStatementAmount(block.balance)?.paise ?? null,
      guessed,
    });
  });

  checkRunningBalance(rows, openingPaise, warnings);
  for (const row of rows) {
    if (row.guessed) {
      row.warnings.push('No withdrawal/deposit or debit/credit was shown; treated as money out.');
    }
  }
  if (rows.some((r) => r.guessed)) {
    warnings.push(
      'Some rows did not say whether money went out or came in, so they were treated as money out. Check them before confirming.',
    );
  }
  return {
    rows: rows.map(({ balancePaise: _b, guessed: _g, ...row }) => row),
    warnings,
  };
}

/**
 * When the statement prints a running balance, each row should move it by
 * its amount. Rows whose direction was a guess take it from the balance, and
 * any row that does not add up is reported so the reader can compare.
 */
function checkRunningBalance(
  rows: (ParsedRow & { balancePaise: number | null; guessed: boolean })[],
  openingPaise: number | null,
  warnings: string[],
): void {
  const withBalance = rows.filter((r) => r.balancePaise !== null);
  if (withBalance.length === 0) return;
  // The opening balance comes before the oldest row.
  const first = withBalance[0] as (typeof withBalance)[number];
  if (
    openingPaise !== null &&
    Math.abs((first.balancePaise as number) - openingPaise) === first.amountPaise
  ) {
    const change = (first.balancePaise as number) - openingPaise;
    if (first.guessed) {
      first.flow = change > 0 ? 'IN' : 'OUT';
      first.type = inferTransactionType(first.description, first.flow);
      first.guessed = false;
    }
  }
  if (withBalance.length < 2) return;
  const signed = (r: { amountPaise: number; flow: TransactionFlow }) =>
    r.flow === 'IN' ? r.amountPaise : -r.amountPaise;
  // Oldest first or newest first: whichever explains more rows.
  const fits = (newestFirst: boolean) =>
    withBalance.slice(1).filter((r, i) => {
      const prev = withBalance[i] as (typeof withBalance)[number];
      const change = newestFirst
        ? (prev.balancePaise as number) - (r.balancePaise as number)
        : (r.balancePaise as number) - (prev.balancePaise as number);
      return Math.abs(change) === (newestFirst ? prev : r).amountPaise;
    }).length;
  const newestFirst = fits(true) > fits(false);

  let mismatches = 0;
  withBalance.slice(1).forEach((r, i) => {
    const prev = withBalance[i] as (typeof withBalance)[number];
    const row = newestFirst ? prev : r;
    const change = newestFirst
      ? (prev.balancePaise as number) - (r.balancePaise as number)
      : (r.balancePaise as number) - (prev.balancePaise as number);
    if (Math.abs(change) === row.amountPaise) {
      if (row.guessed) {
        row.flow = change > 0 ? 'IN' : 'OUT';
        row.type = inferTransactionType(row.description, row.flow);
        row.guessed = false;
      } else if (change !== signed(row)) {
        mismatches += 1;
      }
    } else {
      mismatches += 1;
    }
  });
  if (mismatches > 0) {
    warnings.push(
      `${mismatches} ${mismatches === 1 ? 'row does' : 'rows do'} not add up with the running balance printed on the statement. Some rows may be missing or misread; compare with the PDF before confirming.`,
    );
  }
}
