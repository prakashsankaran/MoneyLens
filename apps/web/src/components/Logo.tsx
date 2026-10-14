import { brandMark } from '@moneylens/ui';

/** The MoneyLens mark (brand kit), drawn in the brand colour tokens. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-600">
        <path d={brandMark.line.d} strokeWidth={brandMark.line.strokeWidth} />
        <path d={brandMark.arrow.d} strokeWidth={brandMark.arrow.strokeWidth} />
      </g>
      {brandMark.bars.map((bar) => (
        <path
          key={bar.d}
          d={bar.d}
          className={bar.tone === 'accent' ? 'fill-brand-500' : 'fill-brand-600'}
        />
      ))}
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark />
      <span className="text-lg font-bold tracking-tight text-ink-900">
        Money<span className="text-brand-600">Lens</span>
      </span>
    </div>
  );
}
