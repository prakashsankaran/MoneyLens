import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MerchantOption,
  TransactionDetail,
  TransactionList,
  TransactionUpdateResult,
} from '@moneylens/types';
import type { UpdateTransactionInput } from '@moneylens/validation';
import { api, send } from '../../lib/api-client';
import { invalidateFinancialData } from '../categories/useCategories';

export function useTransactionList(query: string) {
  return useQuery({
    queryKey: ['transactions', query],
    queryFn: () => api<TransactionList>(`/transactions${query ? `?${query}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api<TransactionDetail>(`/transactions/${id}`),
    enabled: !!id,
  });
}

export function useMerchants() {
  return useQuery({
    queryKey: ['merchants'],
    queryFn: () => api<MerchantOption[]>('/merchants'),
    staleTime: 60_000,
  });
}

export function useUpdateTransaction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTransactionInput) =>
      send<TransactionUpdateResult>('PATCH', `/transactions/${id}`, input),
    onSuccess: (result) => {
      client.setQueryData(['transaction', id], result.transaction);
      invalidateFinancialData(client);
    },
  });
}

export function useDeleteTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send('DELETE', `/transactions/${id}`),
    onSuccess: () => invalidateFinancialData(client),
  });
}
