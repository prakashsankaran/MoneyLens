import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="animate-pop rounded-2xl border border-negative/20 bg-negative-50 p-4 text-sm shadow-card sm:p-5"
    >
      <p className="font-medium text-negative">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full font-semibold text-brand-700 transition-all duration-200 hover:text-brand-800 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
