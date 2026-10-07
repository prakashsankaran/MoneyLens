import type { HealthScore } from '@moneylens/types';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';

function barColour(score: number): string {
  if (score >= 75) return 'bg-positive';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-negative';
}

/**
 * The financial health score with its working: each component's score as a
 * bar with its measured value, and its weight and formula one tap away.
 */
export function HealthScoreBreakdown({ health }: { health: HealthScore }) {
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-4xl font-semibold tabular-nums">
          {health.score === null ? '–' : health.score}
          <span className="text-base font-normal text-ink-500"> / 100</span>
        </p>
        <ProvenanceBadge kind="CALCULATION" />
      </div>
      {health.score === null && (
        <p className="mt-2 text-sm text-ink-500">
          Not enough data for a score yet. The components below say what is missing.
        </p>
      )}
      <ul className="mt-5 space-y-4">
        {health.components.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{c.label}</span>
              <span
                className={`tabular-nums ${c.score === null ? 'text-xs text-ink-500' : 'font-semibold'}`}
              >
                {c.score === null ? 'Not scored' : c.score}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
              {c.score !== null && (
                <div
                  className={`h-full rounded-full ${barColour(c.score)}`}
                  style={{ width: `${Math.max(2, c.score)}%` }}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-ink-500">{c.measured ?? c.unavailableReason}</p>
            <details className="mt-0.5 text-xs text-ink-500">
              <summary className="cursor-pointer">
                How it is scored · {Math.round(c.weight * 100)}% of total
              </summary>
              <p className="mt-1">{c.formula}</p>
            </details>
          </li>
        ))}
      </ul>
      <details className="mt-4 text-xs text-ink-500">
        <summary className="cursor-pointer">About this score</summary>
        <p className="mt-1">{health.method}</p>
        <p className="mt-1">
          An educational indicator from your own transactions, not a credit score or financial
          advice.
        </p>
      </details>
    </div>
  );
}
