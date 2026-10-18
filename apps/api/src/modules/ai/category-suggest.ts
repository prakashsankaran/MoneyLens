import { maskIdentifiersInText } from '@moneylens/shared';

/** One merchant from an import, as the model sees it: no amounts, no account numbers. */
export interface SuggestItem {
  merchant: string;
  flow: 'IN' | 'OUT';
  /** One statement narration, with UPI IDs and long numbers masked. */
  sample: string | null;
}

/** A category the model may choose, by a readable key such as "food/groceries". */
export interface SuggestCategory {
  key: string;
  label: string;
  id: string;
}

/** The most merchants sent in one request; the biggest groups come first. */
export const MAX_SUGGEST_ITEMS = 60;

export const SUGGEST_SYSTEM_PROMPT = `You sort payments from Indian bank, UPI and wallet statements into spending categories.
You get a numbered list of merchants (with the direction of the money and one statement line) and a list of category keys.
Reply with one JSON object and nothing else, mapping each merchant's number to the best category key, for example {"1": "food/groceries", "2": null}.
Use null when you are not reasonably sure, and for payments to or from a person rather than a business.
Only use keys from the list.`;

/** The user turn: categories, then merchants. */
export function suggestPrompt(items: SuggestItem[], categories: SuggestCategory[]): string {
  const cats = categories.map((c) => `${c.key}: ${c.label}`).join('\n');
  const merchants = items
    .map((item, i) => {
      const direction = item.flow === 'IN' ? 'money in' : 'money out';
      const sample = maskIdentifiersInText(item.sample)?.slice(0, 120);
      return `${i + 1}. ${JSON.stringify(item.merchant.slice(0, 80))} (${direction})${
        sample ? ` - ${JSON.stringify(sample)}` : ''
      }`;
    })
    .join('\n');
  return `Category keys:\n${cats}\n\nMerchants:\n${merchants}`;
}

/**
 * Read the model's JSON, keeping only answers that name a listed merchant and
 * a listed category. Anything else (prose, unknown keys) is dropped.
 */
export function parseSuggestions(
  text: string,
  items: SuggestItem[],
  categories: SuggestCategory[],
): { merchant: string; categoryId: string }[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const byKey = new Map(categories.map((c) => [c.key.toLowerCase(), c.id]));
  const out: { merchant: string; categoryId: string }[] = [];
  for (const [number, value] of Object.entries(json as Record<string, unknown>)) {
    const item = items[Number(number) - 1];
    if (!item || typeof value !== 'string') continue;
    const categoryId = byKey.get(value.trim().toLowerCase());
    if (categoryId) out.push({ merchant: item.merchant, categoryId });
  }
  return out;
}
