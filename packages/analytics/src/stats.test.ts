import { describe, expect, it } from 'vitest';
import { mean, median, sum } from './stats';

describe('stats', () => {
  it('handles empty input', () => {
    expect(sum([])).toBe(0);
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
  });

  it('computes median for odd and even lengths', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3); // (2 + 3) / 2 = 2.5 -> rounds to 3
    expect(median([10, 20])).toBe(15);
  });

  it('does not mutate its input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('rounds the mean to whole paise', () => {
    expect(mean([1, 2])).toBe(2);
    expect(mean([100, 200, 400])).toBe(233);
  });
});
