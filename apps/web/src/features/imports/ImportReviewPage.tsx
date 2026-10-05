import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatINR } from '@moneylens/shared';
import type { CategoryNode, ImportReview, ImportRow } from '@moneylens/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard } from '../../components/PageHeader';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { formatDay, formatDayKey, TYPE_LABELS } from '../../lib/format';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { Amount } from '../transactions/Amount';
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
    <div className="mx-auto max-w-6xl px-4 py-6 pb-32 sm:px-6 lg:py-10">
      <Link
        to="/imports"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-brand-700"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Imports
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
          Check that the file is a CSV export with a date, a description and an amount column, then
          try again.
        </p>
        <Link
          to="/imports"
          className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline"
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
          <CheckCircle2 className="mt-0.5 size-6 text-positive" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold">
              {confirm.data.committed} transactions imported
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              They now appear in your transactions, dashboard and analytics.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
              <Link to="/transactions" className="text-brand-700 hover:underline">
                View transactions
              </Link>
              <Link to="/" className="text-brand-700 hover:underline">
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

  return (
    <>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
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
            <AlertTriangle className="size-4" aria-hidden="true" /> Notes about this file
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
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ${
              view === key ? 'bg-ink-900 text-white' : 'bg-surface text-ink-700 hover:bg-ink-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-surface">
        {rows.slice(0, limit).map((row) => (
          <ReviewRow
            key={row.id}
            importId={record.id}
            row={row}
            categories={categories.data ?? []}
            editable={editable}
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
          className="mt-3 text-sm font-medium text-brand-700 hover:underline"
        >
          Show {Math.min(PAGE, rows.length - limit)} more
        </button>
      )}

      {editable && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-ink-100 bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
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
    <div className="rounded-xl border border-ink-100 bg-surface px-4 py-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${warn ? 'text-warning' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function ReviewRow({
  importId,
  row,
  categories,
  editable,
}: {
  importId: string;
  row: ImportRow;
  categories: CategoryNode[];
  editable: boolean;
}) {
  const update = useUpdateImportRow(importId);
  const included = row.decision === 'INCLUDE';
  const label = row.merchantName ?? 'Unknown';

  return (
    <li className={`px-4 py-3 ${included ? '' : 'bg-ink-100/40'}`}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[auto_minmax(0,1fr)_14rem_8rem] md:items-center">
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
        <div className="md:col-start-3">
          <CategorySelect
            aria-label={`Category for ${label}`}
            categories={categories}
            emptyLabel="Uncategorised"
            className={`!h-10 ${included && !row.category ? 'border-warning' : ''}`}
            value={row.category?.id ?? ''}
            disabled={!editable}
            onChange={(e) =>
              update.mutate({ rowId: row.id, input: { categoryId: e.target.value || null } })
            }
          />
        </div>
        <Amount
          paise={row.amountPaise}
          flow={row.flow}
          className="hidden text-right text-sm md:col-start-4 md:block"
        />
      </div>
      {(row.duplicateReason || row.warnings.length > 0) && (
        <p className="mt-2 text-xs text-warning">
          {[row.duplicateReason && `Possible duplicate: ${row.duplicateReason}.`, ...row.warnings]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
      {update.isError && <p className="mt-2 text-xs text-negative">{update.error.message}</p>}
    </li>
  );
}
