import { LuArrowLeft, LuCircleCheck, LuPencil, LuTriangleAlert } from 'react-icons/lu';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatINR } from '@moneylens/shared';
import type {
  CategoryNode,
  ImportReview,
  ImportRow,
  MerchantOption,
  TransactionType,
} from '@moneylens/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard } from '../../components/PageHeader';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { formatDay, formatDayKey, TYPE_LABELS } from '../../lib/format';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { Amount } from '../transactions/Amount';
import { useMerchants } from '../transactions/useTransactions';
import {
  useConfirmImport,
  useDeleteImport,
  useImportReview,
  useUpdateImportRow,
} from './useImports';

type View = 'all' | 'attention' | 'excluded';
const PAGE = 100;

function needsAttention(row: ImportRow): boolean {
  return (
    row.decision === 'DUPLICATE' ||
    (row.decision === 'INCLUDE' && !row.category) ||
    row.warnings.length > 0
  );
}

export function ImportReviewPage() {
  const { id = '' } = useParams();
  const { data, isPending, isError, error, refetch } = useImportReview(id);

  if (isPending) return <FullPageSpinner />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-32 sm:px-8 lg:py-12">
      <Link
        to="/imports"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-brand-600 transition-all duration-200"
      >
        <LuArrowLeft className="size-4" aria-hidden="true" /> Imports
      </Link>
      {isError ? (
        <div className="mt-4">
          <ErrorCard message={error.message} onRetry={() => void refetch()} />
        </div>
      ) : (
        <ReviewContent review={data} />
      )}
    </div>
  );
}

function ReviewContent({ review }: { review: ImportReview }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const merchants = useMerchants();
  const merchantListId = useId();
  const confirm = useConfirmImport(review.import.id);
  const discard = useDeleteImport();
  const [view, setView] = useState<View>('all');
  const [limit, setLimit] = useState(PAGE);
  const { import: record, stats } = review;
  const editable = record.status === 'READY_FOR_REVIEW';

  if (record.status === 'FAILED') {
    return (
      <Card className="mt-4" title={`We couldn't read ${record.filename}`}>
        <p className="text-sm text-ink-700">{record.errorMessage}</p>
        <p className="mt-3 text-sm text-ink-500">
          Check that the file is a Google Pay statement PDF, or a CSV or Excel export with a date, a
          description and an amount column, then try again.
        </p>
        <Link
          to="/imports"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
        >
          Upload another file
        </Link>
      </Card>
    );
  }

  if (confirm.isSuccess) {
    return (
      <Card className="mt-4">
        <div className="flex items-start gap-3">
          <LuCircleCheck className="mt-0.5 size-6 text-positive" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {confirm.data.committed} transactions imported
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              They now appear in your transactions, dashboard and analytics.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
              <Link
                to="/transactions"
                className="text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
              >
                View transactions
              </Link>
              <Link
                to="/"
                className="text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
              >
                Go to dashboard
              </Link>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const rows = review.rows.filter((r) =>
    view === 'attention'
      ? needsAttention(r)
      : view === 'excluded'
        ? r.decision !== 'INCLUDE'
        : true,
  );
  const attentionCount = review.rows.filter(needsAttention).length;
  // How many rows share each merchant name, for "apply to similar".
  const merchantCounts = new Map<string, number>();
  for (const r of review.rows) {
    if (r.merchantName)
      merchantCounts.set(r.merchantName, (merchantCounts.get(r.merchantName) ?? 0) + 1);
  }

  return (
    <>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {editable ? 'Review import' : 'Import details'}
          </h1>
          <p className="mt-1 truncate text-sm text-ink-500">
            {record.filename}
            {stats.firstDate &&
              stats.lastDate &&
              ` · ${formatDayKey(stats.firstDate)} – ${formatDayKey(stats.lastDate)}`}
          </p>
        </div>
        {!editable && (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            Imported {record.confirmedAt ? formatDay(record.confirmedAt) : ''}
          </span>
        )}
      </header>

      <section aria-label="Import summary" className="mt-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Found in file" value={stats.detected} />
          <Stat label="Will be imported" value={stats.included} />
          <Stat label="Excluded" value={stats.excluded} />
          <Stat
            label="Possible duplicates"
            value={stats.possibleDuplicates}
            warn={stats.possibleDuplicates > 0}
          />
          <Stat label="Money out" value={formatINR(stats.totalDebitsPaise)} />
          <Stat label="Money in" value={formatINR(stats.totalCreditsPaise)} />
        </dl>
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-500">
          <ProvenanceBadge kind="CALCULATION" />
          Totals cover the rows that will be imported.
          {stats.uncategorized > 0 &&
            ` ${stats.uncategorized} ${stats.uncategorized === 1 ? 'row has' : 'rows have'} no category yet.`}
        </p>
      </section>

      {review.warnings.length > 0 && (
        <div
          role="note"
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-ink-900"
        >
          <p className="flex items-center gap-2 font-medium text-warning">
            <LuTriangleAlert className="size-4" aria-hidden="true" /> Notes about this file
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {review.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Rows to show" className="mt-6 flex gap-2 overflow-x-auto">
        {(
          [
            ['all', `All (${review.rows.length})`],
            ['attention', `Needs a look (${attentionCount})`],
            ['excluded', `Excluded (${stats.excluded})`],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={view === key}
            onClick={() => {
              setView(key);
              setLimit(PAGE);
            }}
            className={`h-9 shrink-0 rounded-xl border px-4 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
              view === key
                ? 'border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                : 'border-ink-200 bg-surface text-ink-700 shadow-card hover:border-ink-300 hover:bg-ink-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <MerchantDatalist id={merchantListId} merchants={merchants.data ?? []} />
      <ul className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-200/70 bg-surface shadow-card">
        {rows.slice(0, limit).map((row) => (
          <ReviewRow
            key={row.id}
            importId={record.id}
            row={row}
            categories={categories.data ?? []}
            editable={editable}
            similarCount={(row.merchantName ? (merchantCounts.get(row.merchantName) ?? 1) : 1) - 1}
            merchantListId={merchantListId}
          />
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-ink-500">Nothing to show here.</li>
        )}
      </ul>
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-3 text-sm font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
        >
          Show {Math.min(PAGE, rows.length - limit)} more
        </button>
      )}

      {editable && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-ink-100 bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-68">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-700">
              {stats.included} of {stats.detected} rows will be added to your transactions.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={discard.isPending || confirm.isPending}
                onClick={() =>
                  discard.mutate(record.id, { onSuccess: () => void navigate('/imports') })
                }
              >
                Discard
              </Button>
              <Button
                disabled={confirm.isPending || stats.included === 0}
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? 'Importing…' : `Import ${stats.included} transactions`}
              </Button>
            </div>
          </div>
          {(confirm.isError || discard.isError) && (
            <p role="alert" className="mx-auto mt-2 max-w-6xl text-sm text-negative">
              {(confirm.error ?? discard.error)?.message}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-200/70 bg-surface px-4 py-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${warn ? 'text-warning' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function MerchantDatalist({ id, merchants }: { id: string; merchants: MerchantOption[] }) {
  return (
    <datalist id={id}>
      {merchants.map((m) => (
        <option key={m.id} value={m.name} />
      ))}
    </datalist>
  );
}

const ROW_TYPES: TransactionType[] = [
  'DEBIT',
  'CREDIT',
  'REFUND',
  'CASHBACK',
  'TRANSFER',
  'SELF_TRANSFER',
];

function ReviewRow({
  importId,
  row,
  categories,
  editable,
  similarCount,
  merchantListId,
}: {
  importId: string;
  row: ImportRow;
  categories: CategoryNode[];
  editable: boolean;
  /** Other rows in this import from the same merchant. */
  similarCount: number;
  merchantListId: string;
}) {
  const update = useUpdateImportRow(importId);
  const [editing, setEditing] = useState(false);
  // After a category change, offer to use it for the merchant's other rows.
  const [offer, setOffer] = useState<{ categoryId: string | null } | null>(null);
  const included = row.decision === 'INCLUDE';
  const label = row.merchantName ?? 'Unknown';

  return (
    <li className={`px-4 py-3 ${included ? '' : 'bg-ink-100/40'}`}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[auto_minmax(0,1fr)_14rem_8rem_auto] md:items-center">
        <label className="flex min-w-0 items-center gap-3 md:contents">
          <input
            type="checkbox"
            className="size-5 md:justify-self-start"
            checked={included}
            disabled={!editable}
            onChange={(e) =>
              update.mutate({
                rowId: row.id,
                input: { decision: e.target.checked ? 'INCLUDE' : 'EXCLUDE' },
              })
            }
            aria-label={`Import ${label} on ${formatDay(row.date)}`}
          />
          <span className="min-w-0 md:col-start-2">
            <span className="flex items-baseline justify-between gap-3 md:block">
              <span
                className={`min-w-0 truncate text-sm font-medium ${included ? '' : 'text-ink-500'}`}
              >
                {label}
              </span>
              <Amount paise={row.amountPaise} flow={row.flow} className="text-sm md:hidden" />
            </span>
            <span className="block truncate text-xs text-ink-500">
              {formatDay(row.date)} · {TYPE_LABELS[row.type]}
              {row.rawDescription && ` · ${row.rawDescription}`}
            </span>
          </span>
        </label>
        <div className="flex items-center gap-2 md:contents">
          <div className="min-w-0 flex-1 md:col-start-3">
            <CategorySelect
              aria-label={`Category for ${label}`}
              categories={categories}
              emptyLabel="Uncategorised"
              className={`!h-10 ${included && !row.category ? 'border-warning' : ''}`}
              value={row.category?.id ?? ''}
              disabled={!editable}
              onChange={(e) => {
                const categoryId = e.target.value || null;
                update.mutate({ rowId: row.id, input: { categoryId } });
                setOffer(similarCount > 0 ? { categoryId } : null);
              }}
            />
          </div>
          <Amount
            paise={row.amountPaise}
            flow={row.flow}
            className="hidden text-right text-sm md:col-start-4 md:block"
          />
          {editable && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
              aria-label={`Edit ${label} on ${formatDay(row.date)}`}
              className="rounded-xl p-2 text-ink-500 hover:bg-ink-100 md:col-start-5 transition-all duration-200 hover:text-ink-900"
            >
              <LuPencil className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {offer && editable && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-700">
          Use this category for the {similarCount} other {similarCount === 1 ? 'row' : 'rows'} from{' '}
          {label}?
          <button
            type="button"
            className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
            onClick={() => {
              update.mutate({
                rowId: row.id,
                input: { categoryId: offer.categoryId, applyToSimilar: true },
              });
              setOffer(null);
            }}
          >
            Apply to all
          </button>
          <button type="button" className="font-medium" onClick={() => setOffer(null)}>
            No thanks
          </button>
        </p>
      )}
      {(row.duplicateReason || row.warnings.length > 0) && (
        <p className="mt-2 text-xs text-warning">
          {[row.duplicateReason && `Possible duplicate: ${row.duplicateReason}.`, ...row.warnings]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
      {editing && editable && (
        <RowEditor
          row={row}
          similarCount={similarCount}
          merchantListId={merchantListId}
          busy={update.isPending}
          onCancel={() => setEditing(false)}
          onSave={(input) =>
            update.mutate({ rowId: row.id, input }, { onSuccess: () => setEditing(false) })
          }
        />
      )}
      {update.isError && <p className="mt-2 text-xs text-negative">{update.error.message}</p>}
    </li>
  );
}

function RowEditor({
  row,
  similarCount,
  merchantListId,
  busy,
  onSave,
  onCancel,
}: {
  row: ImportRow;
  similarCount: number;
  merchantListId: string;
  busy: boolean;
  onSave: (input: {
    merchantName?: string;
    transactionType?: TransactionType;
    decision?: ImportRow['decision'];
    applyToSimilar?: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [merchantName, setMerchantName] = useState(row.merchantName ?? '');
  const [type, setType] = useState<TransactionType>(row.type);
  const [duplicate, setDuplicate] = useState(row.decision === 'DUPLICATE');
  const [applyToSimilar, setApplyToSimilar] = useState(false);
  const fieldId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = merchantName.trim();
    onSave({
      ...(name && name !== row.merchantName ? { merchantName: name } : {}),
      ...(type !== row.type ? { transactionType: type } : {}),
      ...(duplicate !== (row.decision === 'DUPLICATE')
        ? { decision: duplicate ? 'DUPLICATE' : 'INCLUDE' }
        : {}),
      ...(applyToSimilar ? { applyToSimilar: true } : {}),
    });
  };
  const changed =
    (merchantName.trim() && merchantName.trim() !== row.merchantName) ||
    type !== row.type ||
    duplicate !== (row.decision === 'DUPLICATE');

  return (
    <form
      onSubmit={submit}
      aria-label={`Edit ${row.merchantName ?? 'row'}`}
      className="mt-3 grid gap-3 rounded-xl border border-ink-200/70 bg-canvas p-3 text-sm sm:grid-cols-2"
    >
      <label htmlFor={`${fieldId}-merchant`} className="block">
        <span className="font-medium text-ink-700">Merchant</span>
        <input
          id={`${fieldId}-merchant`}
          list={merchantListId}
          value={merchantName}
          maxLength={80}
          onChange={(e) => setMerchantName(e.target.value)}
          className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-surface px-3 shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </label>
      <label className="block">
        <span className="font-medium text-ink-700">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-surface px-3 shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
        >
          {ROW_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          className="size-4"
          checked={duplicate}
          onChange={(e) => setDuplicate(e.target.checked)}
        />
        Duplicate of a transaction I already have (it will not be imported)
      </label>
      {similarCount > 0 && (
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="size-4"
            checked={applyToSimilar}
            onChange={(e) => setApplyToSimilar(e.target.checked)}
          />
          Also change the merchant and type of the {similarCount} other{' '}
          {similarCount === 1 ? 'row' : 'rows'} from {row.merchantName}
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" className="!h-10" disabled={!changed || busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" className="!h-10" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
