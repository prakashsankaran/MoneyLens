import { maskIdentifiersInText } from '@moneylens/shared';

// ---------------------------------------------------------------------------
// Input screening: runs before anything is stored or sent to a provider.
// ---------------------------------------------------------------------------

export type ScreenResult =
  | { action: 'allow'; text: string }
  | { action: 'refuse'; reason: 'secret' | 'illegal'; reply: string; storedText: string };

const SECRET_PATTERNS = [
  /\b(upi\s*)?(pin|mpin)\b[^.?!\n]{0,20}\b\d{4,6}\b/i,
  /\b(password|passcode|passwd|otp|cvv|cvc)\b\s*(is|was|:|=|-)\s*\S+/i,
  /\b(my|the)\s+(password|otp|cvv|upi pin|pin)\s+\S*\d\S*/i,
  // A full card number, with or without separators.
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?:[\s-]?\d{1,3})?\b/,
];

const ILLEGAL_PATTERNS = [
  /\b(evade|evading|evasion of|dodge|dodging)\b[^.?!\n]{0,30}\btax(es)?\b/i,
  /\bhide\b[^.?!\n]{0,30}\b(income|money|cash)\b[^.?!\n]{0,30}\b(tax|income tax|it department)\b/i,
  /\blaunder(ing)?\b/i,
  /\bblack money\b/i,
  /\bhawala\b/i,
  /\bbenami\b/i,
  /\b(fake|forged|false)\s+(invoice|invoices|bill|bills|receipt|receipts|salary slip|rent receipts?)\b/i,
];

export const SECRET_REPLY =
  "Please don't share PINs, passwords, OTPs, CVVs or card numbers here. MoneyLens never needs them, and I haven't saved what you typed. Ask your question again without them.";
export const ILLEGAL_REPLY =
  "I can't help with that. MoneyLens AI explains your own spending and saving. For tax questions, a registered tax professional can explain the lawful options.";

/**
 * Refuse messages that contain credentials or ask for help with illegal
 * activity, and mask identifiers (UPI IDs, long numbers) in everything else.
 * A refused message is stored as a placeholder, never verbatim.
 */
export function screenInput(text: string): ScreenResult {
  if (SECRET_PATTERNS.some((p) => p.test(text))) {
    return {
      action: 'refuse',
      reason: 'secret',
      reply: SECRET_REPLY,
      storedText:
        '[Removed: this message looked like it contained a PIN, password or card number.]',
    };
  }
  if (ILLEGAL_PATTERNS.some((p) => p.test(text))) {
    return { action: 'refuse', reason: 'illegal', reply: ILLEGAL_REPLY, storedText: text };
  }
  return { action: 'allow', text: maskIdentifiersInText(text) ?? text };
}

// ---------------------------------------------------------------------------
// Output check: every amount and percentage must come from the context.
// ---------------------------------------------------------------------------

/** An amount in rupees with how precisely it was written, or a percentage. */
export interface WrittenNumber {
  raw: string;
  kind: 'amount' | 'percent';
  value: number;
  /** Half a unit of the last digit written, so rounded figures still match. */
  tolerance: number;
}

const SCALES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  l: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  lac: 1e5,
  lacs: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
};

const AMOUNT =
  /(?:₹|\bRs\.?|\bINR)\s?(\d+(?:,\d+)*(?:\.\d+)?)(?:\s?(k|thousand|lakhs?|lacs?|l|crores?|cr)\b)?/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s?(?:%|per\s?cent\b)/gi;

function precision(digits: string, scale: number): number {
  const [int = '', dec] = digits.replace(/,/g, '').split('.');
  if (dec) return 0.5 * 10 ** -dec.length * scale;
  if (scale > 1) return 0.5 * scale;
  const zeros = Math.min(/0*$/.exec(int)?.[0].length ?? 0, 3);
  return Math.max(0.5 * 10 ** zeros, 1);
}

/** Every ₹ amount and percentage written in `text`. */
export function writtenNumbers(text: string): WrittenNumber[] {
  const out: WrittenNumber[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const digits = m[1] as string;
    const scale = SCALES[(m[2] ?? '').toLowerCase()] ?? 1;
    out.push({
      raw: m[0].trim(),
      kind: 'amount',
      value: Number(digits.replace(/,/g, '')) * scale,
      tolerance: precision(digits, scale),
    });
  }
  for (const m of text.matchAll(PERCENT)) {
    const digits = m[1] as string;
    out.push({
      raw: m[0].trim(),
      kind: 'percent',
      value: Number(digits),
      tolerance: 0.5 * 10 ** -(digits.split('.')[1]?.length ?? 0) + 0.01,
    });
  }
  return out;
}

export interface AllowedNumbers {
  /** Rupees. */
  amounts: number[];
  percents: number[];
}

/**
 * Collect every figure in a context object: fields ending in `Paise` become
 * rupee amounts, fields ending in `Pct` become percentages, and amounts and
 * percentages written inside strings (insight titles, health measures) count
 * too. Extra text, such as the user's question, adds its own figures.
 */
export function allowedNumbers(context: unknown, ...texts: string[]): AllowedNumbers {
  const amounts = new Set<number>();
  const percents = new Set<number>();
  const fromText = (s: string) => {
    for (const n of writtenNumbers(s)) (n.kind === 'amount' ? amounts : percents).add(n.value);
  };
  const walk = (value: unknown, key: string) => {
    if (typeof value === 'number') {
      if (/Paise$/.test(key)) amounts.add(Math.round(value) / 100);
      else if (/Pct$/.test(key)) percents.add(value);
    } else if (typeof value === 'string') {
      fromText(value);
    } else if (Array.isArray(value)) {
      for (const v of value) walk(v, key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(context, '');
  texts.forEach(fromText);
  return { amounts: [...amounts], percents: [...percents] };
}

export interface GroundingResult {
  ok: boolean;
  /** Figures that match nothing in the context. */
  unsupported: string[];
  /** Wording the assistant must not use. */
  violations: string[];
}

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bwast(e|ed|eful|ing)\b/i, reason: 'calls spending "waste"' },
  {
    pattern:
      /(?<!\bnot\s)(?<!\bno\s)\bguarantee(d|s)?\b[^.]{0,30}\b(returns?|profits?|gains?|growth)\b/i,
    reason: 'presents returns as guaranteed',
  },
  {
    pattern:
      /\b(share|send|tell|give|enter|provide)\b[^.]{0,30}\b(upi pin|pin|password|otp|cvv)\b/i,
    reason: 'asks for a PIN, password, OTP or CVV',
  },
];

/** Check a model answer against the figures it was allowed to use. */
export function checkGrounding(text: string, allowed: AllowedNumbers): GroundingResult {
  const unsupported: string[] = [];
  for (const n of writtenNumbers(text)) {
    const pool = n.kind === 'amount' ? allowed.amounts : allowed.percents;
    const match = pool.some((a) => Math.abs(Math.abs(a) - n.value) <= n.tolerance);
    if (!match) unsupported.push(n.raw);
  }
  const violations = FORBIDDEN.filter((f) => f.pattern.test(text)).map((f) => f.reason);
  return { ok: unsupported.length === 0 && violations.length === 0, unsupported, violations };
}
