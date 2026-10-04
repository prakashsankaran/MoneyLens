import { rupeesToPaise } from '@moneylens/shared';
import type { TransactionFlow } from '@moneylens/types';

export interface ParsedAmount {
  /** Positive integer paise. */
  paise: number;
  /** Direction implied by the text itself (sign, brackets, Dr/Cr suffix), if any. */
  flow: TransactionFlow | null;
}

/**
 * Parse amounts as they appear in Indian statements: "1,23,456.78",
 * "₹ 450", "INR 99.5", "-250.00", "(250.00)", "1,200.00 Dr", "500 CR".
 * Returns null for blank, zero or unreadable values.
 */
export function parseStatementAmount(raw: string | undefined): ParsedAmount | null {
  if (raw === undefined) return null;
  let text = raw.trim();
  if (!text || text === '-') return null;

  let flow: TransactionFlow | null = null;
  const suffix = /\s*\b(dr|cr|debit|credit)\.?$/i.exec(text);
  if (suffix) {
    flow = /^(dr|debit)$/i.test(suffix[1] as string) ? 'OUT' : 'IN';
    text = text.slice(0, suffix.index).trim();
  }

  text = text.replace(/^(₹|rs\.?|inr)\s*/i, '').replace(/\s/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  text = text.replace(/^(₹|rs\.?|inr)/i, '').replace(/,/g, '');

  let paise: number;
  try {
    paise = rupeesToPaise(text);
  } catch {
    // Some exports carry more than two decimals; round half-up to paise.
    if (!/^\d+\.\d{3,}$/.test(text)) return null;
    paise = Math.round(Number(text) * 100);
  }
  if (paise === 0) return null;
  if (negative && !flow) flow = 'OUT';
  return { paise, flow };
}
