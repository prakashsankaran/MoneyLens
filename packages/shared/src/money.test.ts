import { describe, expect, it } from 'vitest';
import {
  formatINR,
  formatINRCompact,
  paiseToRupeeString,
  percentOf,
  rupeesToPaise,
  toRupeeInput,
} from './money';

describe('rupeesToPaise', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['1.05', 105],
    ['87,450.00', 8_745_000],
    ['-12.34', -1234],
    [' 99.99 ', 9999],
  ])('parses %s', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it('does not suffer floating point drift', () => {
    // 0.1 + 0.2 style errors would show up here with float parsing.
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise(1.15)).toBe(115);
  });

  it.each(['', 'abc', '1.234', '1..2', '₹100'])('rejects %j', (input) => {
    expect(() => rupeesToPaise(input)).toThrow();
  });
});

describe('paiseToRupeeString', () => {
  it('round-trips with rupeesToPaise', () => {
    for (const p of [0, 5, 99, 100, 123_456, -705]) {
      expect(rupeesToPaise(paiseToRupeeString(p))).toBe(p);
    }
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(8_745_000)).toBe('₹87,450');
    expect(formatINR(1_234_567_800)).toBe('₹1,23,45,678');
  });

  it('can show paise', () => {
    expect(formatINR(12_345, { exact: true })).toBe('₹123.45');
  });

  it('formats compact values', () => {
    expect(formatINRCompact(95_000)).toBe('₹950');
    expect(formatINRCompact(1_250_000)).toBe('₹12.5k');
    expect(formatINRCompact(15_000_000)).toBe('₹1.5L');
    expect(formatINRCompact(2_000_000_000)).toBe('₹2Cr');
  });
});

describe('percentOf', () => {
  it('returns null for a zero denominator', () => {
    expect(percentOf(5, 0)).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(percentOf(1, 3)).toBe(33.3);
  });
});

describe('toRupeeInput', () => {
  it('drops zero paise and keeps real ones', () => {
    expect(toRupeeInput(1450000)).toBe('14500');
    expect(toRupeeInput(1050)).toBe('10.50');
    expect(toRupeeInput(null)).toBe('');
  });
});
