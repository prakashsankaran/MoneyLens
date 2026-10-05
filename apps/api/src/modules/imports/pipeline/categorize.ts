import type { RuleMatchField } from '@prisma/client';
import type { ParsedRow } from './types';
import {
  KEYWORD_CATEGORIES,
  extractMerchantText,
  findKnownMerchant,
  merchantKey,
  toDisplayName,
} from './merchants';

export interface CategorizationContext {
  /** User corrections promoted to rules; checked first. */
  rules: { matchField: RuleMatchField; pattern: string; categoryId: string; priority: number }[];
  /** The user's merchants, indexed by alias key and normalised name. */
  merchantsByKey: Map<string, { id: string; name: string; categoryId: string | null }>;
  /** System category ids by "parent-slug/child-slug". */
  categoryIdByPath: Map<string, string>;
}

export type CategorySource = 'rule' | 'merchant' | 'known-merchant' | 'keyword' | 'type' | 'none';

export interface Categorization {
  merchantName: string;
  merchantKey: string;
  merchantId: string | null;
  categoryId: string | null;
  /** 0..1; null when uncategorised. */
  confidence: number | null;
  source: CategorySource;
}

/** Confidence by how the category was decided. */
export const CONFIDENCE: Record<Exclude<CategorySource, 'none'>, number> = {
  rule: 1,
  merchant: 0.9,
  'known-merchant': 0.85,
  type: 0.8,
  keyword: 0.6,
};

/**
 * Resolve the merchant and category for a parsed row. Order: user rules, then
 * the user's own merchant mapping, then well-known merchants, then generic
 * keywords. Deterministic and explainable via `source`.
 */
export function categorize(row: ParsedRow, ctx: CategorizationContext): Categorization {
  const text = row.counterparty?.trim()
    ? row.counterparty.trim().toUpperCase()
    : extractMerchantText(row.description);
  const key = merchantKey(text);
  const descriptionKey = merchantKey(row.description);

  const existing = ctx.merchantsByKey.get(key);
  const known = findKnownMerchant(key) ?? findKnownMerchant(descriptionKey);
  const merchantName = existing?.name ?? known?.name ?? (toDisplayName(text) || 'Unknown');
  const resolvedKey = existing ? key : known ? merchantKey(known.name) : key;

  const result = (categoryId: string | null, source: CategorySource): Categorization => ({
    merchantName,
    merchantKey: resolvedKey,
    merchantId: existing?.id ?? ctx.merchantsByKey.get(resolvedKey)?.id ?? null,
    categoryId,
    confidence: categoryId && source !== 'none' ? CONFIDENCE[source] : null,
    source: categoryId ? source : 'none',
  });

  const description = row.description.toUpperCase();
  const rules = [...ctx.rules].sort((a, b) => b.priority - a.priority);
  for (const rule of rules) {
    const pattern = rule.pattern.toUpperCase();
    const matches =
      (rule.matchField === 'MERCHANT' &&
        (resolvedKey === pattern || merchantKey(merchantName) === pattern)) ||
      (rule.matchField === 'DESCRIPTION' && description.includes(pattern)) ||
      (rule.matchField === 'UPI_ID' && row.upiId?.toUpperCase() === pattern);
    if (matches) return result(rule.categoryId, 'rule');
  }

  const merchant = existing ?? ctx.merchantsByKey.get(resolvedKey);
  if (merchant?.categoryId) return result(merchant.categoryId, 'merchant');

  if (row.type === 'SELF_TRANSFER') {
    return result(ctx.categoryIdByPath.get('transfers/self-transfer') ?? null, 'type');
  }

  if (known) {
    const id = ctx.categoryIdByPath.get(known.category);
    if (id) return result(id, 'known-merchant');
  }

  for (const kw of KEYWORD_CATEGORIES) {
    if (kw.flow && kw.flow !== row.flow) continue;
    if (kw.pattern.test(description)) {
      const id = ctx.categoryIdByPath.get(kw.category);
      if (id) return result(id, 'keyword');
    }
  }

  return result(null, 'none');
}
