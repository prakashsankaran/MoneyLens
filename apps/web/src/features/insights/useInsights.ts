import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ComparisonsResponse,
  HealthScore,
  InsightsResponse,
  MonthlyReport,
  RecurringSummary,
  TransactionList,
} from '@moneylens/types';
import { api, send } from '../../lib/api-client';
import { invalidateFinancialData } from '../categories/useCategories';

const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : '';
};

export function useInsights(month?: string) {
  return useQuery({
    queryKey: ['insights', month ?? 'latest'],
    queryFn: () => api<InsightsResponse>(`/insights${qs({ month })}`),
    placeholderData: keepPreviousData,
  });
}

export function useHealthScore(month: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'health', month],
    queryFn: () => api<HealthScore>(`/analytics/health${qs({ month })}`),
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

export function useComparisons(month: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'comparisons', month],
    queryFn: () => api<ComparisonsResponse>(`/analytics/comparisons${qs({ month })}`),
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

export function useMonthlyReport(month?: string, compare?: string) {
  return useQuery({
    queryKey: ['report', month ?? 'latest', compare ?? 'previous'],
    queryFn: () => api<MonthlyReport>(`/reports/monthly${qs({ month, compare })}`),
    placeholderData: keepPreviousData,
  });
}

export function useRecurring() {
  return useQuery({
    queryKey: ['recurring'],
    queryFn: () => api<RecurringSummary>('/recurring'),
  });
}

export function useDismissRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dismissed }: { id: string; dismissed: boolean }) =>
      send<RecurringSummary>('PATCH', `/recurring/${id}`, { dismissed }),
    onSuccess: (summary) => {
      client.setQueryData(['recurring'], summary);
      invalidateFinancialData(client);
    },
  });
}

/** The transactions behind an insight, fetched when the user asks to see them. */
export function useTransactionsByIds(ids: string[], enabled: boolean) {
  const shown = ids.slice(0, 100);
  return useQuery({
    queryKey: ['transactions', 'ids', shown.join(',')],
    queryFn: () =>
      api<TransactionList>(`/transactions?ids=${shown.join(',')}&pageSize=100&sort=date_desc`),
    enabled: enabled && shown.length > 0,
  });
}
