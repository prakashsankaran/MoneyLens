import type { ReactNode } from 'react';

import type { ScoreTone } from './score-tone';

const STROKE: Record<ScoreTone, string> = {
  good: 'var(--color-positive)',
  fair: '#f59e0b',
  poor: 'var(--color-negative)',
  none: 'var(--color-ink-300)',
};

/**
 * A progress ring for a 0–100 value, with whatever the caller puts in the
 * middle. Decorative: the value is always written out in the centre.
 */
export function ScoreRing({
  value,
  tone,
  size = 120,
  thickness = 10,
  children,
}: {
  /** 0..100; null draws an empty track. */
  value: number | null;
  tone: ScoreTone;
  size?: number;
  thickness?: number;
  children: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = value === null ? 0 : Math.min(100, Math.max(0, value)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink-100)"
          strokeWidth={thickness}
        />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={STROKE[tone]}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${filled * circumference} ${circumference}`}
            className="transition-[stroke-dasharray] duration-700"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
