import { LuFileUp, LuSlidersHorizontal } from 'react-icons/lu';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatINR } from '@moneylens/shared';
import type { TransactionItem } from '@moneylens/types';
import { Card } from '../../components/Card';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { formatDay, TYPE_LABELS } from '../../lib/format';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { Amount } from './Amount';
import { activeFilterCount, apiQueryFrom, PAGE_SIZE, withFilter, type FilterKey } from './filters';
import { TransactionDetailDialog } from './TransactionDetailDialog';
import { useMerchants, useTransactionList } from './useTransactions';

const inputClass = 'h-11 w-full rounded-lg border border-ink-300 bg-surface px-3 text-sm';

function categoryText(t: TransactionItem): string {
  if (t.subcategory) return t.subcategory.name;
  return t.category?.name ?? 'Uncategorised';
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(() => activeFilterCount(params) > 2);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const set = (key: FilterKey, value: string) => setParams(withFilter(params, key, value));

  // Debounce typing into the URL (and the API).
  const q = params.get('q') ?? '';
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => setParams((p) => withFilter(p, 'q', search.trim())), 300);
    return () => clearTimeout(timer);
  }, [search, q, setParams]);

  const query = apiQueryFrom(params);
  const { data, isPending, isError, error, refetch, isFetching } = useTransactionList(query);
  const categories = useCategories();
  const merchants = useMerchants();

  const page = Number(params.get('page') ?? '1');
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = activeFilterCount(params) > 0 || !!q;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
      <PageHeader
        title="Transactions"
        description="Everything you have imported. Select a transaction to correct it."
        actions={
          <Link
            to="/imports"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 transition-all duration-200 hover:shadow-md active:scale-[0.98]"
          >
            <LuFileUp className="size-4" aria-hidden="true" />
            Import statement
          </Link>
        }
      />

      <section aria-label="Filters" className="mt-6 space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr_1.5fr_auto]">
          <label className="col-span-2 lg:col-span-1">
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant, description or notes"
              className={inputClass}
            />
          </label>
          <label>
            <span className="sr-only">From date</span>
            <input
              type="date"
              aria-label="From date"
              value={params.get('from') ?? ''}
              onChange={(e) => set('from', e.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className="sr-only">To date</span>
            <input
              type="date"
              aria-label="To date"
              value={params.get('to') ?? ''}
              onChange={(e) => set('to', e.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <CategorySelect
              aria-label="Category"
              categories={categories.data ?? []}
              emptyLabel="All categories"
              extra={[{ value: 'uncategorized', label: 'Uncategorised' }]}
              value={params.get('categoryId') ?? ''}
              onChange={(e) => set('categoryId', e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink-200 bg-surface px-4 text-sm font-medium hover:bg-ink-50 shadow-card transition-all duration-200 hover:border-ink-300 active:scale-[0.98]"
          >
            <LuSlidersHorizontal className="size-4" aria-hidden="true" />
            More filters
          </button>
        </div>

        {showMore && (
          <div className="grid gap-3 rounded-2xl border border-ink-200/70 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4 shadow-card">
            <SelectFilter
              label="Direction"
              value={params.get('flow') ?? ''}
              onChange={(v) => set('flow', v)}
              options={[
                ['', 'Money in and out'],
                ['OUT', 'Money out'],
                ['IN', 'Money in'],
              ]}
            />
            <SelectFilter
              label="Type"
              value={params.get('type') ?? ''}
              onChange={(v) => set('type', v)}
              options={[
                ['', 'All types'],
                ...Object.entries(TYPE_LABELS).map(([k, v]) => [k, v] as [string, string]),
              ]}
            />
            <SelectFilter
              label="Merchant"
              value={params.get('merchantId') ?? ''}
              onChange={(v) => set('merchantId', v)}
              options={[
                ['', 'All merchants'],
                ...(merchants.data ?? []).map((m) => [m.id, m.name] as [string, string]),
              ]}
            />
            <SelectFilter
              label="Sort"
              value={params.get('sort') ?? 'date_desc'}
              onChange={(v) => set('sort', v === 'date_desc' ? '' : v)}
              options={[
                ['date_desc', 'Newest first'],
                ['date_asc', 'Oldest first'],
                ['amount_desc', 'Largest amount'],
                ['amount_asc', 'Smallest amount'],
              ]}
            />
            <AmountFilter
              label="Minimum amount (₹)"
              value={params.get('minAmount') ?? ''}
              onCommit={(v) => set('minAmount', v)}
            />
            <AmountFilter
              label="Maximum amount (₹)"
              value={params.get('maxAmount') ?? ''}
              onCommit={(v) => set('maxAmount', v)}
            />
            <SelectFilter
              label="Show"
              value={params.get('status') ?? ''}
              onChange={(v) => set('status', v)}
              options={[
                ['', 'Included transactions'],
                ['EXCLUDED', 'Excluded transactions'],
              ]}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setParams(new URLSearchParams());
                }}
                className="h-11 text-sm font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6">
        {isError ? (
          <ErrorCard message={error.message} onRetry={() => void refetch()} />
        ) : isPending ? (
          <p role="status" className="py-10 text-center text-sm text-ink-500">
            Loading transactions…
          </p>
        ) : data.total === 0 ? (
          <Card title={filtered ? 'No transactions match these filters' : 'No transactions yet'}>
            <p className="text-sm text-ink-500">
              {filtered ? (
                'Try a wider date range or clear some filters.'
              ) : (
                <>
                  Import a bank or UPI statement to get started.{' '}
                  <Link
                    to="/imports"
                    className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
                  >
                    Go to Imports
                  </Link>
                </>
              )}
            </p>
          </Card>
        ) : (
          <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-700">
              <span>
                <span className="font-medium">{data.total.toLocaleString('en-IN')}</span>{' '}
                {data.total === 1 ? 'transaction' : 'transactions'}
              </span>
              <span>
                Spent <span className="font-medium">{formatINR(data.summary.spendingPaise)}</span>
              </span>
              <span>
                Received <span className="font-medium">{formatINR(data.summary.incomePaise)}</span>
              </span>
              <ProvenanceBadge kind="CALCULATION" />
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-ink-200/70 bg-surface md:block shadow-card">
              <table className="w-full text-sm">
                <thead className="bg-ink-100/60 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Merchant
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.items.map((t) => (
                    <tr key={t.id} className="hover:bg-ink-100/40">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                        {formatDay(t.date)}
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId(t.id)}
                          className="block max-w-full truncate text-left font-medium hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
                        >
                          {t.merchantName ?? t.description ?? 'Unknown'}
                        </button>
                        <span className="text-xs text-ink-500">
                          {TYPE_LABELS[t.type]}
                          {t.notes ? ` · ${t.notes}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-700">
                        <span className={t.category ? '' : 'text-warning'}>{categoryText(t)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Amount paise={t.amountPaise} flow={t.flow} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200/70 bg-surface md:hidden shadow-card">
              {data.items.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {t.merchantName ?? t.description ?? 'Unknown'}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {formatDay(t.date)} · {categoryText(t)}
                      </span>
                    </span>
                    <Amount paise={t.amountPaise} flow={t.flow} className="shrink-0 text-sm" />
                  </button>
                </li>
              ))}
            </ul>

            {pages > 1 && (
              <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => set('page', String(page - 1))}
                  className="h-11 rounded-xl border border-ink-200 bg-surface px-4 text-sm font-medium disabled:opacity-40 shadow-card transition-all duration-200 hover:border-ink-300 hover:bg-ink-50 active:scale-[0.98]"
                >
                  Previous
                </button>
                <span className="text-sm text-ink-700">
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => set('page', String(page + 1))}
                  className="h-11 rounded-xl border border-ink-200 bg-surface px-4 text-sm font-medium disabled:opacity-40 shadow-card transition-all duration-200 hover:border-ink-300 hover:bg-ink-50 active:scale-[0.98]"
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        )}
      </div>

      {selectedId && (
        <TransactionDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} mt-1.5`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Commits on blur or Enter so each keystroke does not refetch. */
function AmountFilter({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const clean = draft.replace(/[,₹\s]/g, '');
    if (clean === value) return;
    if (clean === '' || /^\d{1,12}(\.\d{1,2})?$/.test(clean)) onCommit(clean);
  };
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink-700">{label}</span>
      <input
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className={`${inputClass} mt-1.5`}
      />
    </label>
  );
}
