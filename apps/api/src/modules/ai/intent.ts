import { formatMonthKey } from '@moneylens/shared';
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

const MONTH_PATTERNS = [
  'jan(?:uary)?',
  'feb(?:ruary)?',
  'mar(?:ch)?',
  'apr(?:il)?',
  'may',
  'june?',
  'july?',
  'aug(?:ust)?',
  'sep(?:t(?:ember)?)?',
  'oct(?:ober)?',
  'nov(?:ember)?',
  'dec(?:ember)?',
];

export interface MentionedMonth {
  /** The month to answer about: the latest one named that has data. */
  month: string | null;
  /** Months the question named that have no data, as shown to the user. */
  missing: string[];
}

/**
 * The month a question names, such as "September", "Sep 2026" or "2026-09".
 * A name without a year means the most recent month of that name with data.
 * Relative phrases ("last month") are left alone: they compare against the
 * month being explained, they don't change it.
 */
export function mentionedMonth(question: string, availableMonths: string[]): MentionedMonth {
  const available = new Set(availableMonths);
  const found = new Set<string>();
  const missing = new Set<string>();
  const add = (monthNumber: number, year: number | null) => {
    const mm = String(monthNumber).padStart(2, '0');
    const key = year
      ? `${year}-${mm}`
      : [...availableMonths].reverse().find((m) => m.endsWith(`-${mm}`));
    if (key && available.has(key)) found.add(key);
    else missing.add(key ? formatMonthKey(key) : formatMonthKey(`2000-${mm}`).replace(' 2000', ''));
  };

  for (const match of question.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g)) {
    add(Number(match[2]), Number(match[1]));
  }
  MONTH_PATTERNS.forEach((pattern, i) => {
    const re = new RegExp(
      `\\b(in|for|of|during|about)?\\s*\\b(${pattern})\\b\\.?,?(?:\\s+(20\\d{2}))?`,
      'gi',
    );
    for (const match of question.matchAll(re)) {
      const year = match[3] ? Number(match[3]) : null;
      // "may" is usually a verb: count it only as "in May" or "May 2026".
      if (pattern === 'may' && !year && !match[1]) continue;
      add(i + 1, year);
    }
  });

  return { month: [...found].sort().at(-1) ?? null, missing: [...missing] };
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
