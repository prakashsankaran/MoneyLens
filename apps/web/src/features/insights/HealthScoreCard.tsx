import type { HealthScore } from '@moneylens/types';
import { ScoreRing } from '../../components/charts/ScoreRing';
import { TONE_LABEL, TONE_TEXT, toneForScore } from '../../components/charts/score-tone';

import { ProvenanceBadge } from '../../components/ProvenanceBadge';

function barColour(score: number): string {
  if (score >= 75) return 'bg-positive';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-negative';
}

/** A component score as a short bar, coloured by the same bands as the ring. */
export function ScoreBar({ score }: { score: number | null }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
      {score !== null && (
        <div
          className={`h-full rounded-full ${barColour(score)}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      )}
    </div>
  );
}

/**
 * The financial health score with its working: each component's score as a
 * bar with its measured value, and its weight and formula one tap away.
 */
export function HealthScoreBreakdown({ health }: { health: HealthScore }) {
  const tone = toneForScore(health.score);
  return (
    <div>
      <div className="flex items-center gap-5">
        <ScoreRing value={health.score} tone={tone} size={120} thickness={11}>
          <span className="text-4xl font-bold tracking-tight">
            {health.score === null ? '–' : health.score}
          </span>
          <span className="text-xs text-ink-500">out of 100</span>
        </ScoreRing>
        <div>
          <p className={`text-lg font-semibold ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</p>
          <div className="mt-1">
            <ProvenanceBadge kind="CALCULATION" />
          </div>
        </div>
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
            <ScoreBar score={c.score} />
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
