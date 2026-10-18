import { LuSparkles } from 'react-icons/lu';
import { useState } from 'react';
import { groupRowsByMerchant, merchantGroupSummary } from '@moneylens/shared';
import type { CategoryNode, ImportRow } from '@moneylens/types';
import { Button } from '../../components/Button';
import { useAssistantStatus } from '../assistant/useAssistant';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategorizeImportRows, useSuggestCategories } from './useImports';

/** Category names by id, subcategories as "Parent: Child". */
function categoryNames(categories: CategoryNode[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of categories) {
    names.set(c.id, c.name);
    for (const child of c.children) names.set(child.id, `${c.name}: ${child.name}`);
  }
  return names;
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
  const suggest = useSuggestCategories(importId);
  const aiStatus = useAssistantStatus();
  const groups = groupRowsByMerchant(rows);
  const names = categoryNames(categories);
  // MoneyLens AI's guesses, by merchant, for groups that are still uncategorised.
  const suggested = new Map(
    (suggest.data?.suggestions ?? [])
      .filter((s) => names.has(s.categoryId))
      .map((s) => [s.merchant, s.categoryId]),
  );
  const openSuggestions = groups.filter((g) => suggested.has(g.merchant));
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

  // One request per suggested category, one after another.
  const applyAllSuggestions = async () => {
    const byCategory = new Map<string, string[]>();
    for (const g of openSuggestions) {
      const id = suggested.get(g.merchant);
      if (id) byCategory.set(id, [...(byCategory.get(id) ?? []), ...g.rowIds]);
    }
    for (const [categoryId, rowIds] of byCategory) {
      await categorize.mutateAsync({ rowIds, categoryId }).catch(() => undefined);
    }
  };

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

      {aiStatus.data?.configured && (
        <div className="mt-3 rounded-2xl border border-brand-600/20 bg-brand-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              className="!h-10"
              disabled={suggest.isPending || categorize.isPending}
              onClick={() => suggest.mutate()}
            >
              <LuSparkles className="size-4" aria-hidden="true" />
              {suggest.isPending
                ? 'Asking MoneyLens AI…'
                : suggest.data
                  ? 'Ask again'
                  : 'Suggest categories with MoneyLens AI'}
            </Button>
            {openSuggestions.length > 0 && (
              <Button
                className="!h-10"
                disabled={categorize.isPending}
                onClick={() => void applyAllSuggestions()}
              >
                Use all {openSuggestions.length}{' '}
                {openSuggestions.length === 1 ? 'suggestion' : 'suggestions'}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            {suggest.data?.message ??
              (suggest.isError
                ? suggest.error.message
                : suggest.data
                  ? 'Check the suggestions below, then use the ones you agree with.'
                  : 'Only merchant names and one masked statement line are sent, never amounts or account numbers. Nothing changes until you use a suggestion.')}
          </p>
        </div>
      )}

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
        {groups.map((g) => {
          const suggestion = suggested.get(g.merchant);
          const suggestionName = suggestion ? names.get(suggestion) : undefined;
          return (
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
                      {merchantGroupSummary(g)}
                      {g.sample && ` · ${g.sample}`}
                    </span>
                  </span>
                </label>
                {suggestion && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-ink-700 md:col-start-1">
                    <LuSparkles className="size-3.5 text-brand-600" aria-hidden="true" />
                    <span>
                      MoneyLens AI suggests <span className="font-semibold">{suggestionName}</span>
                    </span>
                    <button
                      type="button"
                      className="rounded-full border border-brand-600/40 px-3 py-1 font-semibold text-brand-700 transition-all duration-200 hover:bg-brand-50 disabled:opacity-50"
                      disabled={categorize.isPending}
                      onClick={() => apply(g.rowIds, suggestion)}
                      aria-label={`Use ${suggestionName} for ${g.merchant}`}
                    >
                      Use it
                    </button>
                  </p>
                )}
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
          );
        })}
      </ul>
    </section>
  );
}
