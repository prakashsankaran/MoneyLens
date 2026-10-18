import type { Prisma } from '@prisma/client';
import { dayKeyOf, PAYMENT_METHOD_LABELS, SOURCE_LABELS, TYPE_LABELS } from '@moneylens/shared';

type Row = Prisma.TransactionGetPayload<{
  include: { category: { select: { name: true } }; subcategory: { select: { name: true } } };
}>;

/**
 * Column headings. "Dr/Cr" (not "Type") keeps the file readable by
 * MoneyLens's own CSV import, which takes "Type" as the debit/credit column.
 */
const HEADINGS = [
  'Date',
  'Time',
  'Merchant',
  'Description',
  'Category',
  'Subcategory',
  'Kind',
  'Dr/Cr',
  'Amount',
  'Payment method',
  'UPI ID',
  'Reference',
  'Notes',
  'Source',
];

/**
 * Quote a cell, and defuse text a spreadsheet would run as a formula
 * (CSV injection): a leading = + - @ or control character gets an apostrophe.
 */
function cell(value: string | null | undefined): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** HH:MM in India Standard Time. */
function istTime(date: Date): string {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(11, 16);
}

/** Transactions as CSV text, with a byte-order mark so Excel reads ₹ and names correctly. */
export function transactionsCsv(rows: Row[]): string {
  const lines = [HEADINGS.join(',')];
  for (const t of rows) {
    lines.push(
      [
        dayKeyOf(t.transactionDate),
        istTime(t.transactionDate),
        t.merchantName,
        // Hand-added payments have no statement text; the merchant stands in,
        // so importing the file again recognises them.
        t.description ?? t.merchantName,
        t.category?.name,
        t.subcategory?.name,
        TYPE_LABELS[t.transactionType],
        t.flow === 'OUT' ? 'Dr' : 'Cr',
        t.amount.toFixed(2),
        t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : '',
        t.upiId,
        t.transactionReference,
        t.notes,
        SOURCE_LABELS[t.source],
      ]
        .map(cell)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
