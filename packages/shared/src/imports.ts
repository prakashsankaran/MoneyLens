import type { ImportRow } from '@moneylens/types';
import { formatINR } from './money';

/** Import review rows from one merchant, for categorising them together. */
export interface MerchantGroup {
  merchant: string;
  rowIds: string[];
  outPaise: number;
  inPaise: number;
  /** One statement narration, to help recognise the merchant. */
  sample: string | null;
}

/** Group review rows by merchant, biggest groups first. Shared by web and mobile. */
export function groupRowsByMerchant(rows: ImportRow[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();
  for (const row of rows) {
    const merchant = row.merchantName ?? 'Unknown';
    const group = groups.get(merchant) ?? {
      merchant,
      rowIds: [],
      outPaise: 0,
      inPaise: 0,
      sample: row.rawDescription,
    };
    group.rowIds.push(row.id);
    if (row.flow === 'IN') group.inPaise += row.amountPaise;
    else group.outPaise += row.amountPaise;
    groups.set(merchant, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.rowIds.length - a.rowIds.length || a.merchant.localeCompare(b.merchant),
  );
}

/** "3 rows · ₹1,200 out" */
export function merchantGroupSummary(g: MerchantGroup): string {
  const count = `${g.rowIds.length} ${g.rowIds.length === 1 ? 'row' : 'rows'}`;
  const money = [
    g.outPaise > 0 && `${formatINR(g.outPaise)} out`,
    g.inPaise > 0 && `${formatINR(g.inPaise)} in`,
  ].filter(Boolean);
  return [count, ...money].join(' · ');
}
