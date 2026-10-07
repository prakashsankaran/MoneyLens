import { Link } from 'react-router';
import type { HealthScore } from '@moneylens/types';
import { ScoreRing } from '../../../components/charts/ScoreRing';
import { TONE_LABEL, TONE_TEXT, toneForScore } from '../../../components/charts/score-tone';
import { ScoreBar } from '../../insights/HealthScoreCard';

/** The health score as a ring with its components as bars; the full working is on Insights. */
export function HealthScoreSummary({ health }: { health: HealthScore }) {
  const scored = health.components.filter((c) => c.weight > 0);
  const tone = toneForScore(health.score);
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="flex flex-col items-center">
        <ScoreRing value={health.score} tone={tone} size={136} thickness={12}>
          <span className="text-4xl font-bold tracking-tight">
            {health.score === null ? '–' : health.score}
          </span>
          <span className="text-xs text-ink-500">out of 100</span>
        </ScoreRing>
        <p className={`mt-2 text-sm font-semibold ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</p>
      </div>
      <div className="w-full min-w-0 flex-1">
        <ul className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {scored.map((c) => (
            <li key={c.key}>
              <div className="flex justify-between gap-3">
                <span className="text-ink-700">{c.label}</span>
                <span className="font-semibold tabular-nums">
                  {c.score === null ? 'Not scored' : c.score}
                </span>
              </div>
              <ScoreBar score={c.score} />
            </li>
          ))}
        </ul>
        <Link
          to="/insights"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
        >
          {health.score === null ? 'What is missing?' : 'How it is calculated'}
        </Link>
      </div>
    </div>
  );
}
