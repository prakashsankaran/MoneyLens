import {
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantStatus,
  BudgetsResponse,
  CategoryNode,
  ChatResponse,
  DashboardData,
  ImportConfirmResult,
  ImportRecord,
  ImportReview,
  ImportRowUpdateResult,
  InsightsResponse,
  MoneyBrief,
  MoneyPlanResponse,
  RecurringSummary,
  SimulationResult,
  TransactionDetail,
  TransactionList,
  TransactionUpdateResult,
} from '@moneylens/types';
import type {
  ChatInput,
  SimulationInput,
  UpdateImportRowInput,
  UpdateTransactionInput,
} from '@moneylens/validation';
import { api, ApiError, qs, send } from './api';

// Data hooks. Every figure comes from the API, which runs the analytics;
// the app only displays it. Query keys match the web app.

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (bad input, not found, signed out) will not fix themselves.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}

/** Every query that shows category names or totals. */
export function invalidateFinancialData(client: QueryClient) {
  for (const key of [
    'categories',
    'transactions',
    'transaction',
    'dashboard',
    'analytics',
    'imports',
    'insights',
    'recurring',
    'money-plan',
    'budgets',
    'ai',
  ]) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

export function useDashboard(month: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', month ?? 'latest'],
    queryFn: () => api<DashboardData>(`/dashboard${qs({ month })}`),
    placeholderData: keepPreviousData,
  });
}

export function useMoneyBrief(month: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'brief', month],
    queryFn: () => api<MoneyBrief>(`/ai/brief${qs({ month })}`),
    enabled: month !== undefined,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export interface TransactionFilters {
  q?: string;
  flow?: 'IN' | 'OUT';
  recurring?: 'true';
  categoryId?: string;
}

/** Pages of transactions, newest first, loaded as the list scrolls. */
export function useTransactionPages(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ['transactions', 'pages', filters],
    queryFn: ({ pageParam }) =>
      api<TransactionList>(
        `/transactions${qs({ ...filters, page: pageParam, pageSize: 30, sort: 'date_desc' })}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api<TransactionDetail>(`/transactions/${id}`),
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

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryNode[]>('/categories'),
    staleTime: 5 * 60_000,
  });
}

export function useInsights(month?: string) {
  return useQuery({
    queryKey: ['insights', month ?? 'latest'],
    queryFn: () => api<InsightsResponse>(`/insights${qs({ month })}`),
    placeholderData: keepPreviousData,
  });
}

export function useRecurring() {
  return useQuery({
    queryKey: ['recurring'],
    queryFn: () => api<RecurringSummary>('/recurring'),
  });
}

export function useMoneyPlan() {
  return useQuery({
    queryKey: ['money-plan'],
    queryFn: () => api<MoneyPlanResponse>('/money-plan'),
  });
}

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: ['budgets', month ?? 'current'],
    queryFn: () => api<BudgetsResponse>(`/budgets${qs({ month })}`),
    placeholderData: keepPreviousData,
  });
}

export function useSimulation() {
  return useMutation({
    mutationFn: (input: SimulationInput) =>
      send<SimulationResult>('POST', '/money-plan/simulate', input),
  });
}

export function useImportHistory() {
  return useQuery({ queryKey: ['imports'], queryFn: () => api<ImportRecord[]>('/imports') });
}

export function useImportReview(id: string) {
  return useQuery({
    queryKey: ['imports', id],
    queryFn: () => api<ImportReview>(`/imports/${id}`),
  });
}

export function useUpdateImportRow(importId: string) {
  const client = useQueryClient();
  const key = ['imports', importId];
  return useMutation({
    mutationFn: ({ rowId, input }: { rowId: string; input: UpdateImportRowInput }) =>
      send<ImportRowUpdateResult>('PATCH', `/imports/${importId}/rows/${rowId}`, input),
    onSuccess: ({ row, stats, similarUpdated }) => {
      client.setQueryData<ImportReview>(key, (prev) =>
        prev ? { ...prev, stats, rows: prev.rows.map((r) => (r.id === row.id ? row : r)) } : prev,
      );
      if (similarUpdated > 0) void client.invalidateQueries({ queryKey: key, exact: true });
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

export function useAssistantStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => api<AssistantStatus>('/ai/status'),
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['ai', 'conversations'],
    queryFn: () => api<AssistantConversationSummary[]>('/ai/conversations'),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ['ai', 'conversation', id],
    queryFn: () => api<AssistantConversation>(`/ai/conversations/${id}`),
    enabled: id !== null,
  });
}

export function useChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ChatInput) => send<ChatResponse>('POST', '/ai/chat', input),
    onSuccess: (data) => {
      client.setQueryData<AssistantConversation>(
        ['ai', 'conversation', data.conversation.id],
        (prev) => ({
          ...data.conversation,
          messages: [...(prev?.messages ?? []), data.question, data.reply],
        }),
      );
      void client.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      void client.invalidateQueries({ queryKey: ['ai', 'status'] });
    },
  });
}

export function useDeleteAllTransactions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      send<{ deleted: { transactions: number } }>('DELETE', '/transactions', { confirm: 'DELETE' }),
    onSuccess: () => invalidateFinancialData(client),
  });
}
