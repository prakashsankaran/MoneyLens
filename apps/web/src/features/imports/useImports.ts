import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ImportConfirmResult,
  ImportRecord,
  ImportReview,
  ImportRowUpdateResult,
} from '@moneylens/types';
import type { UpdateImportRowInput } from '@moneylens/validation';
import { api, send } from '../../lib/api-client';
import { invalidateFinancialData } from '../categories/useCategories';

export function useImportHistory() {
  return useQuery({ queryKey: ['imports'], queryFn: () => api<ImportRecord[]>('/imports') });
}

export function useImportReview(id: string) {
  return useQuery({
    queryKey: ['imports', id],
    queryFn: () => api<ImportReview>(`/imports/${id}`),
  });
}

export function useUploadStatement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api<ImportReview>('/imports', { method: 'POST', body });
    },
    onSuccess: (review) => {
      client.setQueryData(['imports', review.import.id], review);
      void client.invalidateQueries({ queryKey: ['imports'], exact: true });
    },
  });
}

export function useUpdateImportRow(importId: string) {
  const client = useQueryClient();
  const key = ['imports', importId];
  return useMutation({
    mutationFn: ({ rowId, input }: { rowId: string; input: UpdateImportRowInput }) =>
      send<ImportRowUpdateResult>('PATCH', `/imports/${importId}/rows/${rowId}`, input),
    // Checkbox and category changes show immediately; the server's row and
    // recalculated totals replace them when the request returns.
    onMutate: async ({ rowId, input }) => {
      const previous = client.getQueryData<ImportReview>(key);
      client.setQueryData<ImportReview>(key, (prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id !== rowId
                  ? r
                  : {
                      ...r,
                      ...(input.decision ? { decision: input.decision } : {}),
                      ...(input.categoryId !== undefined
                        ? {
                            category: input.categoryId
                              ? { id: input.categoryId, name: '', slug: '' }
                              : null,
                          }
                        : {}),
                    },
              ),
            }
          : prev,
      );
      await client.cancelQueries({ queryKey: key, exact: true });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: ({ row, stats }) => {
      client.setQueryData<ImportReview>(key, (prev) =>
        prev ? { ...prev, stats, rows: prev.rows.map((r) => (r.id === row.id ? row : r)) } : prev,
      );
    },
  });
}

export function useConfirmImport(importId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => send<ImportConfirmResult>('POST', `/imports/${importId}/confirm`),
    onSuccess: () => invalidateFinancialData(client),
  });
}

export function useDeleteImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ transactions: number }>('DELETE', `/imports/${id}`),
    onSuccess: () => invalidateFinancialData(client),
  });
}
