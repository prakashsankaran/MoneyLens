import type {
  AuthEventKind,
  AssistantAnswerStatus,
  CategoryBreakdownItem,
  Insight,
  TransactionSource,
  TransactionType,
} from '@moneylens/types';
import { formatINR } from './money';

// Presentation helpers shared by the web and mobile apps. They only format
// figures the API already calculated; they never aggregate.

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const dayTimeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

/** "5 Sept 2026" in IST. */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** "5 Sept 2026, 2:30 pm" in IST. */
export function formatDayTime(iso: string): string {
  return dayTimeFormat.format(new Date(iso));
}

/** "2026-09-05" day key → "5 Sept 2026". */
export function formatDayKey(key: string): string {
  return formatDay(`${key}T12:00:00+05:30`);
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  DEBIT: 'Payment',
  CREDIT: 'Money in',
  REFUND: 'Refund',
  CASHBACK: 'Cashback',
  TRANSFER: 'Transfer',
  SELF_TRANSFER: 'Self transfer',
  UNKNOWN: 'Unknown',
};

export const SOURCE_LABELS: Record<TransactionSource, string> = {
  GOOGLE_PAY: 'Google Pay statement',
  CSV: 'CSV import',
  XLSX: 'Excel import',
  MANUAL: 'Added manually',
  OTHER: 'Other',
};

/** Time-of-day greeting in India Standard Time. */
export function greetingFor(date: Date): string {
  const istHour = (date.getUTCHours() + 5 + Math.floor((date.getUTCMinutes() + 30) / 60)) % 24;
  if (istHour < 5) return 'Good evening';
  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "High (85%)": how strongly the data supports the finding. */
export function confidenceLabel(confidence: number): string {
  const pct = Math.round(confidence * 100);
  const word = confidence >= 0.8 ? 'High' : confidence >= 0.6 ? 'Medium' : 'Low';
  return `${word} (${pct}%)`;
}

export function metricText(metric: Insight['metric']): string {
  if (metric.valuePaise !== undefined) return formatINR(metric.valuePaise);
  if (metric.value === undefined) return '';
  const value = Number(metric.value.toFixed(2));
  return metric.unit === '%' ? `${value}%` : `${value}${metric.unit ?? ''}`;
}

const SAVING_PREFIX = 'Potential saving opportunity: ';

/** Moves the long "Potential saving opportunity:" prefix out of the headline into a tag. */
export function displayTitle(title: string): { title: string; savingIdea: boolean } {
  if (!title.startsWith(SAVING_PREFIX)) return { title, savingIdea: false };
  const rest = title.slice(SAVING_PREFIX.length);
  return { title: rest.charAt(0).toUpperCase() + rest.slice(1), savingIdea: true };
}

export type ScoreTone = 'good' | 'fair' | 'poor' | 'none';

/** Health-style bands: 75+ good, 50+ fair, below that needs work. */
export function toneForScore(score: number | null): ScoreTone {
  if (score === null) return 'none';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

export const TONE_LABEL: Record<ScoreTone, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Needs work',
  none: 'Not enough data',
};

export type DeltaTone = 'good' | 'bad' | 'neutral';
export interface Delta {
  text: string;
  tone: DeltaTone;
}

/** "▲ 12% vs Aug", coloured by whether the move is good news. */
export function pctDelta(
  pct: number | null,
  previous: string,
  upIsGood: boolean,
): Delta | undefined {
  if (pct === null) return undefined;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: `No change vs ${previous}`, tone: 'neutral' };
  const up = rounded > 0;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(rounded)}% vs ${previous}`,
    tone: up === upIsGood ? 'good' : 'bad',
  };
}

/** Savings-rate bands: keeping a fifth of income is healthy, below zero is overspending. */
export function savingsRateTone(rate: number | null): ScoreTone {
  if (rate === null) return 'none';
  if (rate >= 20) return 'good';
  if (rate >= 0) return 'fair';
  return 'poor';
}

/**
 * Keep the first `keep` categories of a ranked list and fold the rest into
 * one "Everything else (n)" row, so a chart never needs more colours than a
 * reader can tell apart. The folded row's figures are sums of API figures.
 */
export function foldCategories(
  categories: CategoryBreakdownItem[],
  keep: number,
): CategoryBreakdownItem[] {
  const shown = categories.slice(0, keep);
  const rest = categories.slice(keep);
  if (rest.length === 0) return shown;
  return [
    ...shown,
    {
      categoryId: '__rest__',
      name: `Everything else (${rest.length})`,
      slug: 'rest',
      color: null,
      amountPaise: rest.reduce((a, c) => a + c.amountPaise, 0),
      sharePct: Math.round(rest.reduce((a, c) => a + c.sharePct, 0) * 10) / 10,
      transactionCount: rest.reduce((a, c) => a + c.transactionCount, 0),
    },
  ];
}

/** The example questions from the product brief, offered by MoneyLens AI. */
export const EXAMPLE_QUESTIONS = [
  'Why did I spend more this month?',
  'Where did most of my money go?',
  'What are my top 5 merchants?',
  'Where can I save ₹5,000?',
  'Did my food spending increase because of frequency or transaction size?',
  'What recurring payments do I have?',
  'Which categories are increasing?',
  'Compare this month with the last three months.',
  'Show me my biggest money leaks.',
];

/** Why an answer has no AI text, for the statuses that need saying. */
export const ANSWER_STATUS_NOTE: Partial<Record<AssistantAnswerStatus, string>> = {
  'not-configured':
    'MoneyLens AI is not set up on this server, so only the calculated figures are shown.',
  fallback: 'The written answer used figures that are not in your data, so it was not shown.',
  unavailable: 'MoneyLens AI could not be reached. The calculated figures are below.',
};

export type TextBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

/**
 * Model text as paragraphs and simple "- " or "1." lists, with markdown bold
 * markers removed, so apps can render it as plain text and never as HTML.
 */
export function textBlocks(text: string): TextBlock[] {
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length > 1 && lines.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l))) {
      return {
        kind: 'list',
        items: lines.map((l) => l.replace(/^\s*([-*•]|\d+\.)\s/, '').replace(/\*\*/g, '')),
      };
    }
    return { kind: 'paragraph', text: block.replace(/\*\*/g, '') };
  });
}

/** Plain-language names for sign-in activity. */
export const AUTH_EVENT_LABEL: Record<AuthEventKind, string> = {
  REGISTERED: 'Account created',
  LOGIN_SUCCEEDED: 'Signed in',
  LOGIN_FAILED: 'Wrong password entered',
  LOGIN_BLOCKED: 'Sign-in paused after too many wrong passwords',
  SESSION_REUSE_DETECTED: 'Old sign-in reused, so that device was signed out',
  LOGGED_OUT: 'Signed out',
  PASSWORD_CHANGED: 'Password changed, other devices signed out',
  SIGNED_OUT_EVERYWHERE: 'Signed out on every device',
};

/** Events the account owner may want to look into. */
export const AUTH_EVENT_WARNING: ReadonlySet<AuthEventKind> = new Set([
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'SESSION_REUSE_DETECTED',
]);

/**
 * A short description of the device from its user agent, such as
 * "Chrome on Mac" or "MoneyLens app on Android". Good enough to recognise
 * your own devices; not a security signal on its own.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;
  const os = /iPhone|iPad|iOS/i.test(ua)
    ? 'iPhone'
    : /Android/i.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/i.test(ua)
        ? 'Mac'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null;
  // React Native's fetch identifies itself with okhttp (Android) or CFNetwork/Darwin (iOS).
  if (/okhttp|CFNetwork|Darwin|Expo/i.test(ua) && !/Mozilla/i.test(ua)) {
    return `MoneyLens app${os ? ` on ${os}` : /okhttp/i.test(ua) ? ' on Android' : ' on iPhone'}`;
  }
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}
