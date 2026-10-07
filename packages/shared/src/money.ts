/**
 * Money helpers. All arithmetic in MoneyLens is done on integer paise
 * (1 rupee = 100 paise) to avoid floating point drift.
 */

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a decimal rupee string (e.g. "1234.5", "-87.05") into integer paise
 * without going through floating point. Throws on malformed input.
 */
export function rupeesToPaise(value: string | number): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim().replace(/,/g, '');
  const match = DECIMAL_RE.exec(text);
  if (!match) throw new Error(`Invalid amount: "${String(value)}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) throw new Error(`Amount out of range: "${String(value)}"`);
  return sign ? -paise : paise;
}

/** Convert paise to a fixed 2-decimal rupee string, e.g. 12345 -> "123.45". */
export function paiseToRupeeString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Paise as a rupee string for a form input: 1450000 → "14500", 1050 → "10.50". */
export function toRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format paise as Indian rupees with lakh/crore grouping, e.g. 8745000 -> "₹87,450".
 * Rounds to whole rupees unless `exact` is set.
 */
export function formatINR(paise: number, opts: { exact?: boolean } = {}): string {
  return opts.exact ? inrExact.format(paise / 100) : inrWhole.format(Math.round(paise / 100));
}

/** Compact form for chart axes: ₹1.2L, ₹3.4Cr, ₹950. */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

/** Percentage with 1 decimal place; returns null when the denominator is 0. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
