import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  CategoryAnalytics,
  MerchantAnalytics,
  MonthlyAnalytics,
  TrendAnalytics,
} from '@moneylens/types';
import { api } from '../../lib/api-client';

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
};

export function useMonthlyAnalytics(month?: string) {
  return useQuery({
    queryKey: ['analytics', 'monthly', month ?? 'latest'],
    queryFn: () => api<MonthlyAnalytics>(`/analytics/monthly${qs({ month })}`),
    placeholderData: keepPreviousData,
  });
}

export function useCategoryAnalytics(month: string | undefined, parentId?: string) {
  return useQuery({
    queryKey: ['analytics', 'categories', month, parentId ?? null],
    queryFn: () => api<CategoryAnalytics>(`/analytics/categories${qs({ month, parentId })}`),
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

export function useMerchantAnalytics(month: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'merchants', month],
    queryFn: () => api<MerchantAnalytics>(`/analytics/merchants${qs({ month, limit: 15 })}`),
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

export function useTrendAnalytics(end: string | undefined, months = 12) {
  return useQuery({
    queryKey: ['analytics', 'trends', end, months],
    queryFn: () => api<TrendAnalytics>(`/analytics/trends${qs({ end, months })}`),
    enabled: !!end,
    placeholderData: keepPreviousData,
  });
}
