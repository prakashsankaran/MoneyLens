import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MonthlySummarySent, Preferences, PreferencesUpdateResult } from '@moneylens/types';
import type { UpdatePreferencesInput } from '@moneylens/validation';
import { api, send } from '../../lib/api-client';
import { invalidateFinancialData } from '../categories/useCategories';

export function usePreferences() {
  return useQuery({ queryKey: ['preferences'], queryFn: () => api<Preferences>('/preferences') });
}

export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) =>
      send<PreferencesUpdateResult>('PATCH', '/preferences', input),
    onSuccess: (result) => {
      client.setQueryData(['preferences'], result.preferences);
      if (result.recategorised > 0) invalidateFinancialData(client);
    },
  });
}

export function useSendMonthlySummary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => send<MonthlySummarySent>('POST', '/preferences/monthly-summary/send'),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['preferences'] }),
  });
}
