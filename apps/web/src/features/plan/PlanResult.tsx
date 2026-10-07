import { formatINR, formatMonthKey, monthKeyOf } from '@moneylens/shared';
import type { MoneyPlanResult, PlanLine, PlanLineSource } from '@moneylens/types';
import { Button } from '../../components/Button';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { usePutBudgets } from './usePlan';

const SOURCE: Record<PlanLineSource, string> = {
  ENTERED: 'You entered',
  OBSERVED: 'From your transactions',
  CALCULATED: 'Calculated',
};

const STATUS: Record<MoneyPlanResult['status'], { title: string; className: string }> = {
  'on-track': { title: 'Your goals fit within your income', className: 'border-positive/30' },
  tight: { title: 'Your goals fit, with little room to spare', className: 'border-warning/40' },
  shortfall: {
    title: 'Your goals need more than the plan leaves',
    className: 'border-negative/30',
  },
  incomplete: { title: 'Enter your monthly income to see the plan', className: 'border-ink-100' },
};

function Lines({ lines, sign }: { lines: PlanLine[]; sign: (l: PlanLine, i: number) => string }) {
  return (
    <tbody className="divide-y divide-ink-100 align-top">
      {lines.map((l, i) => (
        <tr key={l.key} className={l.key === 'surplus' ? 'font-semibold' : undefined}>
          <td className="py-2 pr-3">
            <p>{l.label}</p>
            <p className="text-xs font-normal text-ink-500">
              {SOURCE[l.source]}
              {l.note ? `. ${l.note}` : ''}
            </p>
          </td>
          <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">
            {sign(l, i)}
            {formatINR(Math.abs(l.amountPaise))}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

/** The calculated plan: where income goes, the goals, and educational suggestions. */
export function PlanResult({ plan }: { plan: MoneyPlanResult }) {
  const put = usePutBudgets();
  const month = monthKeyOf(new Date());
  const status = STATUS[plan.status];

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border-2 p-4 ${status.className}`}>
        <p className="font-semibold">{status.title}</p>
        {plan.ready && (
          <p className="mt-1 text-sm text-ink-700">
            {plan.afterGoalsPaise >= 0
              ? `About ${formatINR(plan.afterGoalsPaise)} a month is left after your goals.`
              : `About ${formatINR(-plan.afterGoalsPaise)} a month short.`}
          </p>
        )}
      </div>

      {plan.ready && (
        <>
          <section aria-label="Where your income goes">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Where your income goes</h3>
              <ProvenanceBadge kind="CALCULATION" />
            </div>
            <table className="mt-2 w-full text-sm">
              <Lines
                lines={plan.breakdown}
                sign={(l, i) =>
                  i === 0 ? '' : l.key === 'surplus' ? (l.amountPaise < 0 ? '−' : '= ') : '− '
                }
              />
            </table>
          </section>

          {plan.goals.length > 0 && (
            <section aria-label="Your goals each month">
              <h3 className="text-sm font-semibold">Your goals each month</h3>
              <table className="mt-2 w-full text-sm">
                <Lines lines={plan.goals} sign={() => ''} />
                <tbody>
                  <tr className="font-semibold">
                    <td className="py-2">Left after goals</td>
                    <td
                      className={`py-2 text-right tabular-nums ${plan.afterGoalsPaise < 0 ? 'text-negative' : ''}`}
                    >
                      {plan.afterGoalsPaise < 0 ? '−' : ''}
                      {formatINR(Math.abs(plan.afterGoalsPaise))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {plan.suggestions.length > 0 && (
        <section aria-label="Suggestions">
          <h3 className="text-sm font-semibold">Suggestions</h3>
          <ul className="mt-2 space-y-2">
            {plan.suggestions.map((s) => (
              <li key={s.text} className="flex flex-wrap items-start gap-2 text-sm">
                <ProvenanceBadge kind={s.kind} />
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.suggestedBudgets.length > 0 && (
        <section aria-label="Suggested budgets">
          <h3 className="text-sm font-semibold">Suggested monthly budgets</h3>
          <p className="mt-1 text-xs text-ink-500">
            Essentials at your average; lifestyle categories reduced only when your goals need it.
          </p>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th scope="col" className="pb-2 font-medium">
                  Category
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Average
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Suggested
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {plan.suggestedBudgets.map((b) => (
                <tr key={b.categoryId}>
                  <td className="py-2">
                    {b.name}
                    <span className="block text-xs text-ink-500">{b.reason}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-700">
                    {formatINR(b.averagePaise)}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatINR(b.suggestedPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={put.isPending}
              onClick={() =>
                put.mutate({
                  month,
                  items: plan.suggestedBudgets.map((b) => ({
                    categoryId: b.categoryId,
                    amount: String(b.suggestedPaise / 100),
                  })),
                })
              }
            >
              Use these as budgets for {formatMonthKey(month)}
            </Button>
            {put.isSuccess && (
              <span role="status" className="text-sm text-positive">
                Budgets set. See the Budgets tab.
              </span>
            )}
            {put.isError && (
              <span role="alert" className="text-sm text-negative">
                {put.error.message}
              </span>
            )}
          </div>
        </section>
      )}

      <p className="rounded-xl bg-ink-100/60 p-3 text-xs text-ink-700">{plan.disclaimer}</p>
    </div>
  );
}
