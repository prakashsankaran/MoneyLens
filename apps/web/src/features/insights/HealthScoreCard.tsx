import type { HealthScore } from '@moneylens/types';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';

/**
 * The financial health score with its full working: each component's
 * measured value, score, weight and formula, and why any component is missing.
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
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs text-ink-500">
          <tr>
            <th scope="col" className="pb-2 font-medium">
              Component
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Weight
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Score
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 align-top">
          {health.components.map((c) => (
            <tr key={c.key}>
              <td className="py-2 pr-3">
                <p className="font-medium">{c.label}</p>
                <p className="text-xs text-ink-700">{c.measured ?? c.unavailableReason}</p>
                <details className="mt-1 text-xs text-ink-500">
                  <summary className="cursor-pointer">How it is scored</summary>
                  <p className="mt-1">{c.formula}</p>
                </details>
              </td>
              <td className="py-2 text-right tabular-nums text-ink-700">
                {Math.round(c.weight * 100)}%
              </td>
              <td className="py-2 text-right font-medium tabular-nums">
                {c.score === null ? 'Not scored' : c.score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-500">{health.method}</p>
      <p className="mt-1 text-xs text-ink-500">
        An educational indicator from your own transactions, not a credit score or financial advice.
      </p>
    </div>
  );
}
