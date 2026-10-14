import { useId } from 'react';
import { brandMark } from '@moneylens/ui';

/** The MoneyLens mark, shaded from emerald to teal with the brand colour tokens. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox={brandMark.viewBox} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="20" y1="90" x2="90" y2="15">
          <stop offset="0" style={{ stopColor: 'var(--color-brand-500)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-brand-600)' }} />
        </linearGradient>
      </defs>
      <path d={brandMark.bars.d} fill={`url(#${id})`} />
      <path
        d={brandMark.line.d}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={brandMark.line.strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d={brandMark.arrowHead.d}
        fill={`url(#${id})`}
        stroke={`url(#${id})`}
        strokeWidth={2}
        strokeLinejoin="round"
      />
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
