import type { TransactionFlow } from '@moneylens/types';
import { formatINR } from '@moneylens/shared';
import { parseStatementAmount } from './amounts';
import { parseStatementDate } from './dates';
import { extractUpiId, inferTransactionType, normalizeReference } from './normalize';
import { extractPdfLines, type PdfLine } from './pdf-text';
import {
  StatementParseError,
  type ParseResult,
  type ParsedRow,
  type TransactionParser,
  type UploadedFile,
} from './types';

/**
 * Google Pay (India) transaction statement, the PDF downloaded from the app.
 *
 * Layout assumed (built from public descriptions of the statement, not from a
 * real user's file):
 *
 *   Date & time      Transaction details                      Amount
 *   01 Sep, 2026     Paid to Swiggy                           ₹450
 *   12:30 PM         UPI Transaction ID: 424698765432
 *                    Paid by HDFC Bank 1234
 *
 * Each page repeats the column headings; the account holder's name, contact
 * details and page numbers sit above and below the table and are ignored. A
 * summary near the top states the total sent and received, which is used to
 * check the parse.
 */

const DATE_START = /^(\d{1,2}) ([A-Za-z]{3,9}),? (\d{4})$/;
const TIME_ONLY = /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?$/;
const AMOUNT = /^(?:₹|Rs\.?|INR)\s?-?[\d,]+(?:\.\d{1,2})?$/;
const UPI_TXN_ID = /^UPI\s+Transaction\s+ID\s*:?\s*([A-Za-z0-9]+)/i;
/** "Paid by HDFC Bank 1234" / "Paid to HDFC Bank 1234": the user's own account. */
const BANK_LINE = /^(Paid by|Paid to|Credited to|Debited from)\s+(.+?\b(?:Bank|bank|BANK)\b.*)$/;
const ACTION =
  /^(Paid to|Sent to|Received from|Refund from|Self transfer to|Self transfer from|Cashback from|Reward from)\s+(.+)$/i;
const EXACT = { exact: true };
const PAGE_FOOTER = /^(Page\s+\d+(\s+of\s+\d+)?|\d+\s*\/\s*\d+)$/i;

const HEADER_DATE = /^Date\s*(&|and)\s*time$/i;
const HEADER_DETAILS = /^Transaction details$/i;
const HEADER_AMOUNT = /^Amount$/i;

/** Columns found from the heading row: the x where each starts. */
interface Columns {
  detailsX: number;
  amountX: number;
}

function joinText(items: { text: string }[]): string {
  return items
    .map((i) => i.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the heading row. pdf.js may return each heading as one run or word by
 * word, so the words are re-joined into phrases first.
 */
function findColumns(line: PdfLine): Columns | null {
  const phrases: { x: number; text: string }[] = [];
  for (const item of line.items) {
    const last = phrases.at(-1);
    const candidate = last ? `${last.text} ${item.text}` : '';
    // Join a word to the previous phrase while it still spells a heading.
    if (
      last &&
      ['date & time', 'date and time', 'transaction details'].some((h) =>
        h.startsWith(candidate.toLowerCase()),
      )
    ) {
      last.text = candidate;
    } else {
      phrases.push({ x: item.x, text: item.text });
    }
  }
  const date = phrases.find((p) => HEADER_DATE.test(p.text));
  const details = phrases.find((p) => HEADER_DETAILS.test(p.text));
  const amount = phrases.find((p) => HEADER_AMOUNT.test(p.text));
  if (!date || !details || !amount || !(date.x < details.x && details.x < amount.x)) return null;
  return { detailsX: details.x, amountX: amount.x };
}

/** Split one line into the date, details and amount columns. */
function splitColumns(line: PdfLine, cols: Columns) {
  const left = line.items.filter((i) => i.x < cols.detailsX - 4);
  const rest = line.items.filter((i) => i.x >= cols.detailsX - 4);
  // Amounts are right-aligned under "Amount", so they can start a little left
  // of the heading; anything that does not read as an amount stays in details.
  const amountZone = rest.filter((i) => i.x >= cols.amountX - 80);
  const amountText = joinText(amountZone);
  const isAmount = amountZone.length > 0 && AMOUNT.test(amountText.replace(/\s+/g, ''));
  return {
    date: joinText(left),
    details: joinText(isAmount ? rest.filter((i) => i.x < cols.amountX - 80) : rest),
    amount: isAmount ? amountText.replace(/\s+/g, '') : '',
  };
}

interface Block {
  line: number;
  dateText: string;
  timeText: string;
  details: string[];
  amount: string;
}

const SUMMARY_AMOUNT = /^(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d{1,2})?$/;

/**
 * The "Sent" and "Received" totals above the table. The amount is either
 * beside its label or on a following line in the same column.
 */
function readSummary(lines: PdfLine[]): { sentPaise: number; receivedPaise: number } | null {
  const find = (label: RegExp): number | null => {
    for (const [i, line] of lines.entries()) {
      const at = line.items.findIndex((item) => label.test(item.text));
      if (at < 0) continue;
      const labelItem = line.items[at] as PdfLine['items'][number];
      const inline = /^\S+\s*:?\s*(.+)$/.exec(labelItem.text)?.[1];
      const next = line.items[at + 1];
      const below = lines
        .slice(i + 1, i + 4)
        .flatMap((l) => l.items)
        .find((item) => Math.abs(item.x - labelItem.x) < 30 && SUMMARY_AMOUNT.test(item.text));
      const text = [inline, next?.text, below?.text].find(
        (t): t is string => !!t && SUMMARY_AMOUNT.test(t.trim()),
      );
      const amount = text ? parseStatementAmount(text) : null;
      if (amount) return amount.paise;
    }
    return null;
  };
  const sentPaise = find(/^Sent\b/i);
  const receivedPaise = find(/^Received\b(?!\s+from)/i);
  return sentPaise !== null && receivedPaise !== null ? { sentPaise, receivedPaise } : null;
}

/**
 * Read transactions from the statement's text lines. Pure: the PDF reading is
 * separate, so this can be tested with hand-built lines.
 */
export function parseGooglePayLines(lines: PdfLine[]): { rows: ParsedRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const blocks: Block[] = [];
  let cols: Columns | null = null;
  let page = 0;
  let current: Block | null = null;
  let closed = false;
  const beforeTable: PdfLine[] = [];
  let seenTable = false;

  for (const line of lines) {
    if (line.page !== page) {
      // Each page starts above its own heading row.
      page = line.page;
      cols = null;
      current = null;
    }
    if (!cols) {
      cols = findColumns(line);
      if (cols) seenTable = true;
      else if (!seenTable) beforeTable.push(line);
      continue;
    }
    if (findColumns(line)) continue;

    const { date, details, amount } = splitColumns(line, cols);
    if (DATE_START.test(date)) {
      current = { line: blocks.length + 1, dateText: date, timeText: '', details: [], amount };
      blocks.push(current);
      closed = false;
      if (details) current.details.push(details);
      continue;
    }
    if (!current || closed) continue;
    if (PAGE_FOOTER.test(joinText(line.items))) continue;
    if (TIME_ONLY.test(date)) current.timeText = date;
    else if (date) {
      // Text in the date column that is not a time: the table has ended.
      closed = true;
      continue;
    }
    if (amount && !current.amount) current.amount = amount;
    if (details) {
      current.details.push(details);
      // The account line is the last line of a transaction. The first line is
      // the payee, which may itself be a bank ("Paid to HDFC Bank Credit Card").
      if (current.details.length > 1 && BANK_LINE.test(details)) closed = true;
    }
  }

  if (!seenTable) {
    throw new StatementParseError(
      'This PDF does not look like a Google Pay statement. MoneyLens reads Google Pay statement PDFs; for a bank statement, download it as CSV or Excel.',
    );
  }

  const rows: ParsedRow[] = [];
  for (const block of blocks) {
    const rowWarnings: string[] = [];
    const date = parseStatementDate(`${block.dateText} ${block.timeText}`.trim(), 'DMY');
    const parsedAmount = parseStatementAmount(block.amount);
    if (!date || !parsedAmount) {
      warnings.push(
        `Transaction ${block.line} skipped: ${!date ? `unreadable date "${block.dateText}"` : 'no amount'}.`,
      );
      continue;
    }

    const refIndex = block.details.findIndex((d) => UPI_TXN_ID.test(d));
    const bankIndex = block.details.findIndex((d, i) => i > 0 && BANK_LINE.test(d));
    const endOfName = [refIndex, bankIndex].filter((i) => i >= 0);
    const nameLines = block.details.slice(0, endOfName.length ? Math.min(...endOfName) : undefined);
    const actionText = nameLines.join(' ').replace(/\s+/g, ' ').trim();
    const reference =
      refIndex >= 0
        ? normalizeReference(UPI_TXN_ID.exec(block.details[refIndex] as string)?.[1])
        : null;
    const bank = bankIndex >= 0 ? BANK_LINE.exec(block.details[bankIndex] as string) : null;

    const action = ACTION.exec(actionText);
    const verb = action?.[1]?.toLowerCase() ?? '';
    let flow: TransactionFlow | null = null;
    if (verb.startsWith('paid to') || verb.startsWith('sent to')) flow = 'OUT';
    else if (verb === 'self transfer to') flow = 'OUT';
    else if (verb) flow = 'IN';
    // The account line agrees in a normal statement; it decides when the wording is new.
    const bankFlow: TransactionFlow | null = bank
      ? /^(Paid by|Debited from)/i.test(bank[1] as string)
        ? 'OUT'
        : 'IN'
      : null;
    if (!flow) {
      flow = bankFlow ?? 'OUT';
      rowWarnings.push(
        bankFlow
          ? 'Unfamiliar wording; direction taken from the account line.'
          : 'Unfamiliar wording; treated as money out.',
      );
    }
    if (parsedAmount.flow === 'OUT' && flow === 'IN') {
      rowWarnings.push('The amount is negative but the wording says money in; check this row.');
    }

    const counterparty = action?.[2]?.trim() || null;
    const description = actionText || '(no description)';
    rows.push({
      rowIndex: block.line,
      date,
      amountPaise: parsedAmount.paise,
      flow,
      type: inferTransactionType(description, flow),
      description,
      upiId: extractUpiId(description),
      reference,
      counterparty,
      warnings: rowWarnings,
    });
  }

  if (blocks.length === 0) {
    throw new StatementParseError('No transactions were found in this Google Pay statement.');
  }

  const summary = readSummary(beforeTable);
  if (summary) {
    // CALCULATION: totals of the rows read, compared with the statement's own summary.
    const sent = rows.filter((r) => r.flow === 'OUT').reduce((s, r) => s + r.amountPaise, 0);
    const received = rows.filter((r) => r.flow === 'IN').reduce((s, r) => s + r.amountPaise, 0);
    if (sent !== summary.sentPaise || received !== summary.receivedPaise) {
      warnings.push(
        `The statement summary says ${formatINR(summary.sentPaise, EXACT)} sent and ${formatINR(summary.receivedPaise, EXACT)} received, but the rows read add up to ${formatINR(sent, EXACT)} sent and ${formatINR(received, EXACT)} received. Some rows may be missing; compare with the PDF before confirming.`,
      );
    }
  } else {
    warnings.push('The statement summary was not found, so the totals could not be cross-checked.');
  }

  return { rows, warnings };
}

export class GooglePayPdfParser implements TransactionParser {
  readonly name = 'google-pay-pdf@1';
  readonly source = 'GOOGLE_PAY' as const;

  canParse(file: UploadedFile): number {
    const ext = file.filename.toLowerCase().split('.').pop();
    if (ext === 'pdf') return 0.8;
    return file.mimeType === 'application/pdf' ? 0.7 : 0;
  }

  async parse(file: UploadedFile): Promise<ParseResult> {
    const lines = await extractPdfLines(file.buffer, file.password);
    const { rows, warnings } = parseGooglePayLines(lines);
    return { parserName: this.name, source: this.source, rows, warnings };
  }
}
