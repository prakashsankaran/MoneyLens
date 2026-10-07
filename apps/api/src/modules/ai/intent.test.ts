import { describe, expect, it } from 'vitest';
import type { AssistantContext } from '@moneylens/types';
import { classifyQuestion, matchCategory, mentionedMonth } from './intent';

describe('classifyQuestion', () => {
  // The example questions from the product brief.
  it.each([
    ['Why did I spend more this month?', ['change']],
    ['Where did most of my money go?', ['categories']],
    ['What are my top 5 merchants?', ['merchants']],
    ['Where can I save ₹5,000?', ['savings']],
    ['Did my food spending increase because of frequency or transaction size?', ['driver']],
    ['What recurring payments do I have?', ['recurring']],
    ['Which categories are increasing?', ['increasing']],
    ['Compare this month with the last three months.', ['compare']],
    ['Show me my biggest money leaks.', ['savings']],
  ])('%s', (question, expected) => {
    const topics = classifyQuestion(question);
    expect(topics[0]).toBe('overview');
    for (const t of expected) expect(topics).toContain(t);
  });

  it('falls back to the overview', () => {
    expect(classifyQuestion('Hello')).toEqual(['overview']);
  });
});

describe('matchCategory', () => {
  const row = (categoryId: string, name: string, slug: string) =>
    ({ categoryId, name, slug }) as AssistantContext['categoryChanges'][number];
  const ctx = {
    categoryChanges: [row('food', 'Food', 'food'), row('fd', 'Food Delivery', 'food-delivery')],
  } as AssistantContext;

  it('prefers the most specific name and understands merchant names', () => {
    expect(matchCategory('Did my food spending go up?', ctx)?.categoryId).toBe('food');
    expect(matchCategory('Why is food delivery so high?', ctx)?.categoryId).toBe('fd');
    expect(matchCategory('How much on Swiggy?', ctx)?.categoryId).toBe('fd');
    expect(matchCategory('What about rent?', ctx)).toBeNull();
  });
});

describe('mentionedMonth', () => {
  const months = ['2025-09', '2026-08', '2026-09', '2026-10'];

  it.each([
    ['What was my biggest category in September?', '2026-09'],
    ['How much did I spend in Sep 2025?', '2025-09'],
    ['Show me 2026-08', '2026-08'],
    ['Compare August with September', '2026-09'],
    ['Where did my money go in sept.', '2026-09'],
  ])('%s', (question, expected) => {
    expect(mentionedMonth(question, months)).toEqual({ month: expected, missing: [] });
  });

  it('leaves questions without a month, relative phrases and the verb "may" alone', () => {
    for (const q of [
      'Why did I spend more this month?',
      'More than last month?',
      'How may I save?',
    ]) {
      expect(mentionedMonth(q, months)).toEqual({ month: null, missing: [] });
    }
  });

  it('reports named months that have no data', () => {
    expect(mentionedMonth('What about in May?', months)).toEqual({ month: null, missing: ['May'] });
    expect(mentionedMonth('January 2026 versus October', months)).toEqual({
      month: '2026-10',
      missing: ['January 2026'],
    });
  });
});
