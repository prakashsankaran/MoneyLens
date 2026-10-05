import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BudgetsResponse, MoneyPlanResponse, SimulationResult } from '@moneylens/types';
import type { MoneyPlanInput, PutBudgetsInput, SimulationInput } from '@moneylens/validation';
import { api, send } from '../../lib/api-client';

export function useMoneyPlan() {
  return useQuery({
    queryKey: ['money-plan'],
    queryFn: () => api<MoneyPlanResponse>('/money-plan'),
  });
}

export function useSaveMoneyPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MoneyPlanInput) => send<MoneyPlanResponse>('POST', '/money-plan', input),
    onSuccess: (data) => client.setQueryData(['money-plan'], data),
  });
}

export function useSimulation() {
  return useMutation({
    mutationFn: (input: SimulationInput) =>
      send<SimulationResult>('POST', '/money-plan/simulate', input),
  });
}

export function useBudgets(month?: string) {
  return useQuery({
    queryKey: ['budgets', month ?? 'current'],
    queryFn: () => api<BudgetsResponse>(`/budgets${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function usePutBudgets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ month, items }: { month: string } & PutBudgetsInput) =>
      send<BudgetsResponse>('PUT', `/budgets/${month}`, { items }),
    onSuccess: (data) => {
      client.setQueryData(['budgets', data.month], data);
      // Budgets feed the health score, insights and the default month view.
      for (const key of ['budgets', 'insights', 'analytics', 'dashboard', 'report']) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** Paise as a rupee string for an input: 1450000 → "14500", 1050 → "10.50". */
export function toRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
