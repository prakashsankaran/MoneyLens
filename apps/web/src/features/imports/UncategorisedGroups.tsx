import { useState } from 'react';
import { formatINR } from '@moneylens/shared';
import type { CategoryNode, ImportRow } from '@moneylens/types';
import { Button } from '../../components/Button';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategorizeImportRows } from './useImports';

interface Group {
  merchant: string;
  rowIds: string[];
  outPaise: number;
  inPaise: number;
  sample: string | null;
}

/** Uncategorised rows grouped by merchant, biggest groups first. */
export function groupByMerchant(rows: ImportRow[]): Group[] {
  const groups = new Map<string, Group>();
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

function groupSummary(g: Group): string {
  const count = `${g.rowIds.length} ${g.rowIds.length === 1 ? 'row' : 'rows'}`;
  const money = [
    g.outPaise > 0 && `${formatINR(g.outPaise)} out`,
    g.inPaise > 0 && `${formatINR(g.inPaise)} in`,
  ].filter(Boolean);
  return [count, ...money].join(' · ');
}

/**
 * Categorise uncategorised rows a merchant at a time: pick a category per
 * merchant, or tick several merchants and give them one category together.
 */
export function UncategorisedGroups({
  importId,
  rows,
  categories,
}: {
  importId: string;
  rows: ImportRow[];
  categories: CategoryNode[];
}) {
  const categorize = useCategorizeImportRows(importId);
  const groups = groupByMerchant(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');

  // Groups that were categorised drop out of the list, and out of the selection.
  const chosen = groups.filter((g) => selected.has(g.merchant));
  const chosenRows = chosen.flatMap((g) => g.rowIds);
  const allSelected = groups.length > 0 && chosen.length === groups.length;

  const toggle = (merchant: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(merchant);
      else next.delete(merchant);
      return next;
    });

  const apply = (rowIds: string[], categoryId: string, onDone?: () => void) =>
    categorize.mutate({ rowIds, categoryId }, { onSuccess: onDone });

  if (groups.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-ink-200 bg-surface px-4 py-6 text-center text-sm text-ink-500 shadow-card">
        Every row you are importing has a category.
      </p>
    );
  }

  return (
    <section aria-label="Uncategorised rows by merchant" className="mt-4">
      <p className="text-sm text-ink-500">
        {rows.length} {rows.length === 1 ? 'row' : 'rows'} from {groups.length}{' '}
        {groups.length === 1 ? 'merchant' : 'merchants'} have no category. Categories you pick here
        are remembered, so the next statement fills them in.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200 bg-surface px-4 py-3 shadow-card">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            className="size-5"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(groups.map((g) => g.merchant)) : new Set())
            }
          />
          Select all
        </label>
        <span className="text-sm text-ink-500">
          {chosen.length > 0
            ? `${chosen.length} selected · ${chosenRows.length} ${chosenRows.length === 1 ? 'row' : 'rows'}`
            : 'Tick merchants to categorise them together'}
        </span>
        <div className="flex min-w-[min(100%,20rem)] flex-1 items-center gap-2 sm:justify-end">
          <CategorySelect
            aria-label="Category for selected merchants"
            categories={categories}
            emptyLabel="Choose a category"
            className="!h-10 sm:max-w-64"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
          />
          <Button
            className="!h-10 shrink-0"
            disabled={!bulkCategory || chosenRows.length === 0 || categorize.isPending}
            onClick={() =>
              apply(chosenRows, bulkCategory, () => {
                setSelected(new Set());
                setBulkCategory('');
              })
            }
          >
            Apply
          </Button>
        </div>
      </div>
      {categorize.isError && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {categorize.error.message}
        </p>
      )}

      <ul className="mt-3 divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-surface shadow-card">
        {groups.map((g) => (
          <li key={g.merchant} className="px-4 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center">
              <label className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={selected.has(g.merchant)}
                  onChange={(e) => toggle(g.merchant, e.target.checked)}
                  aria-label={`Select ${g.merchant}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{g.merchant}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {groupSummary(g)}
                    {g.sample && ` · ${g.sample}`}
                  </span>
                </span>
              </label>
              <CategorySelect
                aria-label={`Category for all ${g.merchant} rows`}
                categories={categories}
                emptyLabel="Uncategorised"
                className="!h-10 border-warning"
                value=""
                disabled={categorize.isPending}
                onChange={(e) => {
                  if (e.target.value) apply(g.rowIds, e.target.value);
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
