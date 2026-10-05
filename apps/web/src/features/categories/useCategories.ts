import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryNode } from '@moneylens/types';
import { api, send } from '../../lib/api-client';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryNode[]>('/categories'),
    staleTime: 5 * 60_000,
  });
}

/** Every query that shows category names or totals. */
export function invalidateFinancialData(client: ReturnType<typeof useQueryClient>) {
  for (const key of [
    'categories',
    'transactions',
    'transaction',
    'dashboard',
    'analytics',
    'imports',
    'merchants',
    'insights',
    'recurring',
    'report',
    'money-plan',
    'budgets',
  ]) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

export function useCategoryMutations() {
  const client = useQueryClient();
  const onSuccess = () => invalidateFinancialData(client);
  return {
    create: useMutation({
      mutationFn: (input: { name: string; parentId: string | null }) =>
        send<CategoryNode>('POST', '/categories', input),
      onSuccess,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        send('PATCH', `/categories/${id}`, { name }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => send<{ uncategorized: number }>('DELETE', `/categories/${id}`),
      onSuccess,
    }),
  };
}
