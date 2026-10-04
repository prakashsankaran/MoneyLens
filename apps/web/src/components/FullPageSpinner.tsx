export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <span className="size-6 animate-spin rounded-full border-2 border-ink-300 border-t-brand-700" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
