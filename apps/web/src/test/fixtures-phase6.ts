import type { AssistantStatus, ChatResponse } from '@moneylens/types';

export const statusFixture: AssistantStatus = {
  configured: true,
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  dailyMessageLimit: 50,
  messagesToday: 3,
  availableMonths: ['2026-07', '2026-08', '2026-09'],
};

export const chatFixture: ChatResponse = {
  conversation: {
    id: 'c1',
    title: 'Where did most of my money go?',
    createdAt: '2026-10-05T09:00:00.000Z',
    updatedAt: '2026-10-05T09:00:01.000Z',
  },
  question: {
    id: 'm1',
    role: 'user',
    content: 'Where did most of my money go?',
    createdAt: '2026-10-05T09:00:00.000Z',
    answer: null,
  },
  reply: {
    id: 'm2',
    role: 'assistant',
    content: 'Housing took the most, at ₹32,000.',
    createdAt: '2026-10-05T09:00:01.000Z',
    answer: {
      status: 'answered',
      month: '2026-09',
      topics: ['overview', 'categories'],
      facts: [{ kind: 'CALCULATION', text: 'Housing: ₹32,000, 31% of spending, 1 payment.' }],
      interpretation: 'Housing took the most, at ₹32,000.',
      dataLimitations: [
        'There are only 2 earlier months of data, so averages and trends are less reliable.',
      ],
      provider: 'anthropic/claude-sonnet-5-5',
      regenerated: false,
    },
  },
};
