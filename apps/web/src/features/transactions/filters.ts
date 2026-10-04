/** URL search params the transactions page understands, passed straight to the API. */
export const FILTER_KEYS = [
  'q',
  'from',
  'to',
  'categoryId',
  'merchantId',
  'minAmount',
  'maxAmount',
  'type',
  'flow',
  'source',
  'status',
  'sort',
  'page',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const PAGE_SIZE = 25;

/** Build the API query string from the page URL, dropping unknown and empty keys. */
export function apiQueryFrom(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) out.set(key, value);
  }
  out.set('pageSize', String(PAGE_SIZE));
  return out.toString();
}

/** Return new params with `key` set (or removed when empty). Any change except paging resets to page 1. */
export function withFilter(
  params: URLSearchParams,
  key: FilterKey,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  if (key !== 'page') next.delete('page');
  return next;
}

/** Number of active filters other than search, sort and paging. */
export function activeFilterCount(params: URLSearchParams): number {
  return FILTER_KEYS.filter((k) => !['q', 'sort', 'page'].includes(k) && params.get(k)).length;
}
