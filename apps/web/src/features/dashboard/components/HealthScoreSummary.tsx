import { Link } from 'react-router';
import type { HealthScore } from '@moneylens/types';
import { ProvenanceBadge } from '../../../components/ProvenanceBadge';

/** The health score and its components at a glance; the full working is on Insights. */
export function HealthScoreSummary({ health }: { health: HealthScore }) {
  const scored = health.components.filter((c) => c.weight > 0);
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="shrink-0">
        <p className="text-4xl font-semibold tabular-nums">
          {health.score === null ? '–' : health.score}
          <span className="text-base font-normal text-ink-500"> / 100</span>
        </p>
        <div className="mt-1">
          <ProvenanceBadge kind="CALCULATION" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {scored.map((c) => (
            <li key={c.key} className="flex justify-between gap-3">
              <span className="text-ink-700">{c.label}</span>
              <span className="font-medium tabular-nums">
                {c.score === null ? 'Not scored' : c.score}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-500">
          {health.score === null
            ? 'More months of data are needed for a score. '
            : 'A weighted average of the components above, calculated from your transactions. '}
          <Link
            to="/insights"
            className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
          >
            See how it is calculated
          </Link>
        </p>
      </div>
    </div>
  );
}
