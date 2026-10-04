import { describe, expect, it } from 'vitest';
import { monthKeyOf } from '@moneylens/shared';
import { DEMO_MERCHANTS, generateDemoTransactions } from './demo-data';
import { SYSTEM_CATEGORIES } from '../../src/modules/categories/system-categories';

describe('generateDemoTransactions', () => {
  const txs = generateDemoTransactions({ endMonth: '2026-09' });

  it('is deterministic', () => {
    expect(generateDemoTransactions({ endMonth: '2026-09' })).toEqual(txs);
  });

  it('covers exactly six months ending at the requested month', () => {
    const months = [...new Set(txs.map((t) => monthKeyOf(t.date)))].sort();
    expect(months).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('produces positive integer amounts sorted by date', () => {
    expect(txs.every((t) => Number.isInteger(t.amountPaise) && t.amountPaise > 0)).toBe(true);
    for (let i = 1; i < txs.length; i++) {
      expect(txs[i]!.date.getTime()).toBeGreaterThanOrEqual(txs[i - 1]!.date.getTime());
    }
  });

  it('uses only known merchants whose categories exist', () => {
    const slugs = new Set(
      SYSTEM_CATEGORIES.flatMap((c) => c.children.map((child) => `${c.slug}/${child.slug}`)),
    );
    expect(DEMO_MERCHANTS.every((m) => slugs.has(m.category))).toBe(true);
    const keys = new Set(DEMO_MERCHANTS.map((m) => m.key));
    expect(txs.every((t) => keys.has(t.merchantKey))).toBe(true);
  });

  it('includes the merchants the product brief asks for', () => {
    const names = DEMO_MERCHANTS.map((m) => m.name.toLowerCase()).join(' ');
    for (const n of [
      'swiggy',
      'zomato',
      'amazon',
      'flipkart',
      'uber',
      'ola',
      'reliance',
      'dmart',
      'airtel',
      'jio',
      'netflix',
      'spotify',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('tells a food-delivery growth story', () => {
    const deliveryByMonth = new Map<string, number>();
    for (const t of txs) {
      if (t.merchantKey !== 'swiggy' && t.merchantKey !== 'zomato') continue;
      const key = monthKeyOf(t.date);
      deliveryByMonth.set(key, (deliveryByMonth.get(key) ?? 0) + t.amountPaise);
    }
    const values = [...deliveryByMonth.entries()].sort().map(([, v]) => v);
    expect(values.at(-1)!).toBeGreaterThan(values[0]! * 2);
  });
});
