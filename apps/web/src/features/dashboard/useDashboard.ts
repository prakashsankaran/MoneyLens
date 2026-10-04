import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardData } from '@moneylens/types';
import { api } from '../../lib/api-client';

export function useDashboard(month: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', month ?? 'latest'],
    queryFn: () => api<DashboardData>(`/dashboard${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  });
}
