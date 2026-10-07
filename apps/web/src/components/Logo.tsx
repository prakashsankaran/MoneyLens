export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-brand-600" />
        <circle cx="14" cy="14" r="7" fill="none" stroke="#fff" strokeWidth="3" />
        <path d="M19 19l6 6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">MoneyLens</span>
    </div>
  );
}
