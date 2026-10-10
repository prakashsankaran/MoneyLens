import { LuFileUp, LuTrash2 } from 'react-icons/lu';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ImportNeedsInputDetails, ImportRecord, ImportStatus } from '@moneylens/types';
import { Card } from '../../components/Card';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { ApiError } from '../../lib/api-client';
import { formatDay, formatDayKey } from '../../lib/format';
import { ColumnMappingDialog, PasswordDialog } from './UploadDialogs';
import {
  useDeleteImport,
  useImportHistory,
  useUploadStatement,
  type UploadRequest,
} from './useImports';

/** An upload the server could read once the user gives a password or columns. */
type NeedsInput = { request: UploadRequest; message: string } & ImportNeedsInputDetails;

function needsInput(err: unknown, request: UploadRequest): NeedsInput | null {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return null;
  const reason = err.details?.reason;
  if (
    reason !== 'COLUMNS_NOT_FOUND' &&
    reason !== 'PASSWORD_REQUIRED' &&
    reason !== 'PASSWORD_INCORRECT'
  ) {
    return null;
  }
  const preview = Array.isArray(err.details?.preview) ? (err.details.preview as string[][]) : [];
  return { request, message: err.message, reason, preview };
}

const STATUS_LABELS: Record<ImportStatus, { label: string; className: string }> = {
  UPLOADED: { label: 'Uploaded', className: 'bg-ink-100 text-ink-700' },
  PARSING: { label: 'Processing', className: 'bg-ink-100 text-ink-700' },
  READY_FOR_REVIEW: { label: 'Needs review', className: 'bg-warning-50 text-warning' },
  CONFIRMED: { label: 'Imported', className: 'bg-brand-50 text-brand-700' },
  FAILED: { label: 'Could not read', className: 'bg-negative-50 text-negative' },
  CANCELLED: { label: 'Cancelled', className: 'bg-ink-100 text-ink-700' },
};

export function ImportsPage() {
  const navigate = useNavigate();
  const upload = useUploadStatement();
  const history = useImportHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<NeedsInput | null>(null);
  const closeDialog = useCallback(() => setPending(null), []);

  const send = (request: UploadRequest) => {
    upload.mutate(request, {
      onSuccess: (review) => {
        setPending(null);
        void navigate(`/imports/${review.import.id}`);
      },
      onError: (err) => setPending(needsInput(err, request)),
    });
  };
  const start = (file: File | undefined) => {
    if (file) send({ file });
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
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Imports"
        description="Upload a statement. You will review every row before anything is saved."
      />

      <Card className="mt-6" title="Upload a statement" icon={LuFileUp}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-4 py-12 text-center transition-all duration-200 ${
            dragging
              ? 'border-brand-600 bg-brand-50'
              : 'border-ink-200 bg-ink-50/60 hover:border-ink-300'
          }`}
        >
          <LuFileUp className="size-8 text-ink-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Drop a statement here, or</p>
          <label className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 transition-all duration-200 active:scale-[0.98]">
            {upload.isPending ? 'Reading file…' : 'Choose file'}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                start(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <p className="mt-4 max-w-md text-xs text-ink-500">
            Google Pay statement PDFs, and CSV or Excel (.xlsx) exports from most Indian banks. If
            the columns are not recognised, you can choose them. Your file is read and then
            discarded; it is not stored, and neither is a PDF password.
          </p>
        </div>
        {upload.isError && !pending && (
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

      {pending?.reason === 'COLUMNS_NOT_FOUND' && (
        <ColumnMappingDialog
          filename={pending.request.file.name}
          preview={pending.preview ?? []}
          message={pending.request.mapping ? pending.message : undefined}
          busy={upload.isPending}
          onClose={closeDialog}
          onSubmit={(mapping) => send({ ...pending.request, mapping })}
        />
      )}
      {(pending?.reason === 'PASSWORD_REQUIRED' || pending?.reason === 'PASSWORD_INCORRECT') && (
        <PasswordDialog
          key={pending.reason + String(pending.request.password)}
          filename={pending.request.file.name}
          incorrect={pending.reason === 'PASSWORD_INCORRECT'}
          busy={upload.isPending}
          onClose={closeDialog}
          onSubmit={(password) => send({ ...pending.request, password })}
        />
      )}

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
            <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-surface shadow-card">
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
            className="block truncate text-sm font-medium hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
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
            className="rounded-full p-2 text-ink-500 hover:bg-ink-100 hover:text-negative transition-all duration-200"
            aria-label={`Delete ${record.filename}`}
          >
            <LuTrash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {confirming && (
        <div className="mt-3 rounded-xl border border-negative/30 p-3 text-sm">
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
              className="h-10 rounded-full bg-negative px-4 font-semibold text-white transition-all duration-200 hover:bg-red-800 active:scale-[0.98]"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-10 rounded-full border border-ink-200 px-5 font-semibold bg-surface transition-all duration-200 hover:bg-ink-100 active:scale-[0.98]"
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
