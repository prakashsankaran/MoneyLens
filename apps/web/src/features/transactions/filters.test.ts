import { describe, expect, it } from 'vitest';
import { activeFilterCount, apiQueryFrom, withFilter } from './filters';

describe('transaction filters', () => {
  it('passes known, non-empty params to the API with a page size', () => {
    const params = new URLSearchParams('q=swiggy&from=2026-09-01&evil=1&flow=&page=2');
    expect(apiQueryFrom(params)).toBe('q=swiggy&from=2026-09-01&page=2&pageSize=25');
  });

  it('resets paging when a filter changes, but not when paging', () => {
    const params = new URLSearchParams('page=3&q=a');
    expect(withFilter(params, 'flow', 'OUT').toString()).toBe('q=a&flow=OUT');
    expect(withFilter(params, 'page', '4').get('page')).toBe('4');
    expect(withFilter(params, 'q', '').toString()).toBe('');
  });

  it('counts active filters, ignoring search, sort and paging', () => {
    expect(
      activeFilterCount(new URLSearchParams('q=a&sort=amount_desc&page=2&flow=IN&from=2026-01-01')),
    ).toBe(2);
  });
});
