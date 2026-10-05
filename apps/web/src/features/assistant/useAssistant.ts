import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantStatus,
  ChatResponse,
  MoneyBrief,
} from '@moneylens/types';
import type { ChatInput } from '@moneylens/validation';
import { api, send } from '../../lib/api-client';

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

export function useDeleteConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ deleted: true }>('DELETE', `/ai/conversations/${id}`),
    onSuccess: (_d, id) => {
      client.removeQueries({ queryKey: ['ai', 'conversation', id] });
      void client.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
  });
}

export function useMoneyBrief(month: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'brief', month],
    queryFn: () => api<MoneyBrief>(`/ai/brief${month ? `?month=${month}` : ''}`),
    enabled: month !== undefined,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
