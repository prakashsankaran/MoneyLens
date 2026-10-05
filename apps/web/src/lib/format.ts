import type { TransactionSource, TransactionType } from '@moneylens/types';

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const dayTimeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

/** "5 Sept 2026" in IST. */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** "5 Sept 2026, 2:30 pm" in IST. */
export function formatDayTime(iso: string): string {
  return dayTimeFormat.format(new Date(iso));
}

/** "2026-09-05" day key → "5 Sept 2026". */
export function formatDayKey(key: string): string {
  return formatDay(`${key}T12:00:00+05:30`);
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  DEBIT: 'Payment',
  CREDIT: 'Money in',
  REFUND: 'Refund',
  CASHBACK: 'Cashback',
  TRANSFER: 'Transfer',
  SELF_TRANSFER: 'Self transfer',
  UNKNOWN: 'Unknown',
};

export const SOURCE_LABELS: Record<TransactionSource, string> = {
  GOOGLE_PAY: 'Google Pay statement',
  CSV: 'CSV import',
  XLSX: 'Excel import',
  MANUAL: 'Added manually',
  OTHER: 'Other',
};
