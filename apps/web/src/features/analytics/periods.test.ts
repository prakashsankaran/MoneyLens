import { describe, expect, it } from 'vitest';
import { formatRange, presetRange, rangeLength } from './periods';

describe('period presets', () => {
  it('ends the last N months with the latest month of data', () => {
    expect(presetRange('3m', '2026-10')).toEqual({
      from: '2026-08-01',
      to: '2026-10-31',
      compare: 'previous',
    });
    expect(presetRange('12m', '2026-10')).toMatchObject({ from: '2025-11-01', to: '2026-10-31' });
  });

  it('runs this year from 1 January to today, against last year', () => {
    expect(presetRange('year', '2026-09', new Date('2026-10-13T10:00:00+05:30'))).toEqual({
      from: '2026-01-01',
      to: '2026-10-13',
      compare: 'lastYear',
    });
  });

  it('describes ranges the way a person would', () => {
    expect(formatRange('2026-08-01', '2026-10-31')).toBe('Aug – Oct 2026');
    expect(formatRange('2025-11-01', '2026-10-31')).toBe('Nov 2025 – Oct 2026');
    expect(formatRange('2026-09-01', '2026-09-30')).toBe('September 2026');
    expect(formatRange('2026-01-01', '2026-10-13')).toMatch(/^1 Jan – 13 Oct 2026$/);
    expect(rangeLength('2026-08-01', '2026-10-31')).toBe('3 months');
    expect(rangeLength('2026-01-01', '2026-10-13')).toBe('286 days');
  });
});
