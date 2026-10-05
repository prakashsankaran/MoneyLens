import type { AssistantContext, AssistantTopic } from '@moneylens/types';

const RULES: { topic: AssistantTopic; pattern: RegExp }[] = [
  {
    topic: 'driver',
    pattern:
      /\b(frequency|how often|more often|less often|transaction size|order size|payment size|bigger|smaller|per (order|payment|transaction)|number of (orders|payments|transactions))\b/i,
  },
  {
    topic: 'change',
    pattern:
      /\b(why|what changed|went up|gone up|go up|higher|more this month|less this month|lower)\b/i,
  },
  {
    topic: 'merchants',
    pattern:
      /\b(merchants?|who did i pay|paid the most|top \d+ (merchants|shops|places)|shops?)\b/i,
  },
  {
    topic: 'increasing',
    pattern: /\b(increas\w*|rising|rise|growing|going up|creeping)\b/i,
  },
  {
    topic: 'categories',
    pattern:
      /\b(categor\w*|where did (most of )?my money go|breakdown|spent on|spend on|biggest expenses?)\b/i,
  },
  {
    topic: 'savings',
    pattern: /\b(save|saving|savings opportunit\w*|cut|reduce|leaks?|leakage|waste\w*|trim)\b/i,
  },
  {
    topic: 'recurring',
    pattern:
      /\b(recurring|subscriptions?|repeat\w*|regular payments?|autopay|every month|monthly payments?)\b/i,
  },
  {
    topic: 'compare',
    pattern:
      /\b(compare|comparison|versus|vs\.?|last (three|3|six|6) months|average|usual|normally)\b/i,
  },
  { topic: 'health', pattern: /\b(health\w*|score|how am i doing|doing well)\b/i },
  {
    topic: 'plan',
    pattern: /\b(plan|budgets?|surplus|afford|goals?|emergency fund|left over)\b/i,
  },
];

/**
 * Keyword routing: picks which calculated figures a question needs. A
 * question can match several topics; the overview is always included so the
 * assistant knows the month's totals.
 */
export function classifyQuestion(question: string): AssistantTopic[] {
  const topics = RULES.filter((r) => r.pattern.test(question)).map((r) => r.topic);
  // "Which categories are increasing?" is about increases, not the breakdown.
  if (topics.includes('increasing') && topics.includes('categories')) {
    topics.splice(topics.indexOf('categories'), 1);
  }
  // "Did food increase because of frequency or size?" is about the driver.
  if (topics.includes('driver') && topics.includes('increasing')) {
    topics.splice(topics.indexOf('increasing'), 1);
  }
  return ['overview', ...new Set(topics)];
}

const SYNONYMS: Record<string, string[]> = {
  'food-delivery': ['delivery', 'swiggy', 'zomato', 'ordering in', 'take-away', 'takeaway'],
  restaurants: ['eating out', 'dining', 'restaurant'],
  groceries: ['grocery', 'groceries', 'dmart', 'bigbasket', 'blinkit', 'zepto'],
  'online-shopping': ['amazon', 'flipkart', 'myntra', 'online shopping'],
  cab: ['uber', 'ola', 'cabs', 'taxi', 'rides'],
  ott: ['netflix', 'spotify', 'prime', 'hotstar', 'streaming'],
  bills: ['utilities', 'utility'],
  transport: ['travel', 'commute'],
};

/**
 * The category a question is about, if it names one: the longest category
 * name found in the question wins, so "food delivery" beats "food".
 */
export function matchCategory(
  question: string,
  ctx: AssistantContext,
): AssistantContext['categoryChanges'][number] | null {
  const q = question.toLowerCase();
  let best: { row: AssistantContext['categoryChanges'][number]; length: number } | null = null;
  for (const row of ctx.categoryChanges) {
    if (!row.categoryId) continue;
    const names = [row.name.toLowerCase(), ...(SYNONYMS[row.slug] ?? [])];
    for (const name of names) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(q) && (!best || name.length > best.length)) best = { row, length: name.length };
    }
  }
  return best?.row ?? null;
}
