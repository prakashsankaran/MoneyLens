/**
 * The on-device stand-in for Prisma's Decimal. Every Decimal column in the
 * schema is Decimal(14,2) rupees, so the value is held as integer paise and
 * rounded half away from zero on the way in, as Postgres does.
 */
export class MemDecimal {
  readonly paise: number;

  constructor(value: MemDecimalInput) {
    this.paise = toPaise(value);
    Object.freeze(this);
  }

  static isDecimal(value: unknown): value is MemDecimal {
    return value instanceof MemDecimal;
  }

  /** Fixed-point text; `toFixed(2)` is what the API uses. */
  toFixed(digits = 2): string {
    const sign = this.paise < 0 ? '-' : '';
    const abs = Math.abs(this.paise);
    if (digits >= 2) {
      const frac = String(abs % 100)
        .padStart(2, '0')
        .padEnd(digits, '0');
      return `${sign}${Math.floor(abs / 100)}.${frac}`;
    }
    // Round half away from zero to fewer places.
    const scale = digits === 1 ? 10 : 1;
    const units = Math.round(abs / (100 / scale));
    const text = digits === 1 ? `${Math.floor(units / 10)}.${units % 10}` : String(units);
    return `${units === 0 ? '' : sign}${text}`;
  }

  /** Like decimal.js: no trailing zeros ("12.5", "100"). */
  toString(): string {
    return this.toFixed(2).replace(/\.?0+$/, '') || '0';
  }

  toNumber(): number {
    return this.paise / 100;
  }

  valueOf(): string {
    return this.toString();
  }

  toJSON(): string {
    return this.toString();
  }

  get [Symbol.toStringTag]() {
    return 'Decimal';
  }
}

export type MemDecimalInput = MemDecimal | string | number | { toFixed(digits: number): string };

const DECIMAL_TEXT = /^([+-])?(\d*)(?:\.(\d*))?$/;

function toPaise(value: MemDecimalInput): number {
  if (value instanceof MemDecimal) return value.paise;
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Invalid decimal: ${value}`);
    text = value.toFixed(6);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else if (value && typeof value.toFixed === 'function') {
    text = value.toFixed(6);
  } else {
    throw new TypeError(`Invalid decimal: ${String(value)}`);
  }
  const match = DECIMAL_TEXT.exec(text);
  if (!match || (!match[2] && !match[3])) throw new TypeError(`Invalid decimal: ${text}`);
  const negative = match[1] === '-';
  const whole = Number(match[2] || '0');
  const fraction = (match[3] ?? '').padEnd(3, '0');
  let paise = whole * 100 + Number(fraction.slice(0, 2));
  // Round half away from zero on the third decimal place.
  if (Number(fraction[2]) >= 5) paise += 1;
  return negative && paise !== 0 ? -paise : paise;
}
