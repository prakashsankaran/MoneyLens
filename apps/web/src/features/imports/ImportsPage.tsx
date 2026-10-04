import { FileUp, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ImportRecord, ImportStatus } from '@moneylens/types';
import { Card } from '../../components/Card';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { ApiError } from '../../lib/api-client';
import { formatDay, formatDayKey } from '../../lib/format';
import { useDeleteImport, useImportHistory, useUploadStatement } from './useImports';

const STATUS_LABELS: Record<ImportStatus, { label: string; className: string }> = {
  UPLOADED: { label: 'Uploaded', className: 'bg-ink-100 text-ink-700' },
  PARSING: { label: 'Processing', className: 'bg-ink-100 text-ink-700' },
  READY_FOR_REVIEW: { label: 'Needs review', className: 'bg-amber-50 text-warning' },
  CONFIRMED: { label: 'Imported', className: 'bg-brand-50 text-brand-700' },
  FAILED: { label: 'Could not read', className: 'bg-red-50 text-negative' },
  CANCELLED: { label: 'Cancelled', className: 'bg-ink-100 text-ink-700' },
};

export function ImportsPage() {
  const navigate = useNavigate();
  const upload = useUploadStatement();
  const history = useImportHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const start = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: (review) => void navigate(`/imports/${review.import.id}`),
    });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    start(e.dataTransfer.files[0]);
  };

  const duplicateId =
    upload.error instanceof ApiError && upload.error.code === 'CONFLICT'
      ? (upload.error.details?.importId as string | undefined)
      : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader
        title="Imports"
        description="Upload a statement. You will review every row before anything is saved."
      />

      <Card className="mt-6" title="Upload a statement">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
            dragging ? 'border-brand-600 bg-brand-50' : 'border-ink-300'
          }`}
        >
          <FileUp className="size-8 text-ink-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Drop a CSV file here, or</p>
          <label className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-600 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600">
            {upload.isPending ? 'Reading file…' : 'Choose file'}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                start(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <p className="mt-4 max-w-md text-xs text-ink-500">
            CSV exports from most Indian banks work: a date, a description, and either one amount
            column or separate withdrawal and deposit columns. Google Pay PDF and Excel statements
            are coming next. Your file is read and then discarded; it is not stored.
          </p>
        </div>
        {upload.isError && (
          <div role="alert" className="mt-4 text-sm text-negative">
            {upload.error.message}{' '}
            {duplicateId && (
              <Link to={`/imports/${duplicateId}`} className="font-medium underline">
                Open it
              </Link>
            )}
          </div>
        )}
      </Card>

      <section className="mt-8" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-base font-semibold">
          Import history
        </h2>
        <div className="mt-3">
          {history.isError ? (
            <ErrorCard message={history.error.message} onRetry={() => void history.refetch()} />
          ) : history.isPending ? (
            <p role="status" className="text-sm text-ink-500">
              Loading…
            </p>
          ) : history.data.length === 0 ? (
            <p className="text-sm text-ink-500">No statements imported yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-surface">
              {history.data.map((record) => (
                <HistoryRow key={record.id} record={record} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryRow({ record }: { record: ImportRecord }) {
  const remove = useDeleteImport();
  const [confirming, setConfirming] = useState(false);
  const status = STATUS_LABELS[record.status];
  const range =
    record.statementStart && record.statementEnd
      ? `${formatDayKey(record.statementStart)} – ${formatDayKey(record.statementEnd)}`
      : null;

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/imports/${record.id}`}
            className="block truncate text-sm font-medium hover:text-brand-700 hover:underline"
          >
            {record.filename}
          </Link>
          <p className="mt-0.5 text-xs text-ink-500">
            Uploaded {formatDay(record.createdAt)}
            {range && ` · ${range}`}
            {record.status === 'CONFIRMED'
              ? ` · ${record.committedCount} added`
              : record.detectedCount > 0
                ? ` · ${record.detectedCount} found`
                : ''}
          </p>
          {record.errorMessage && (
            <p className="mt-1 text-xs text-negative">{record.errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-negative"
            aria-label={`Delete ${record.filename}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {confirming && (
        <div className="mt-3 rounded-lg border border-negative/30 p-3 text-sm">
          <p>
            {record.status === 'CONFIRMED'
              ? `Delete this import and the ${record.committedCount} transactions it added?`
              : 'Discard this import?'}{' '}
            This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(record.id)}
              className="h-10 rounded-lg bg-negative px-4 font-medium text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-10 rounded-lg border border-ink-300 px-4 font-medium"
            >
              Cancel
            </button>
          </div>
          {remove.isError && <p className="mt-2 text-negative">{remove.error.message}</p>}
        </div>
      )}
    </li>
  );
}
