import { rankColour } from '../../../components/charts/chart-theme';
import { formatINR } from '@moneylens/shared';
import type { MerchantSummaryItem } from '@moneylens/types';

/** Top merchants as ranked bars, longest first. */
export function TopMerchants({ merchants }: { merchants: MerchantSummaryItem[] }) {
  if (merchants.length === 0) {
    return <p className="text-sm text-ink-500">No merchant payments this month.</p>;
  }
  const max = Math.max(...merchants.map((m) => m.amountPaise));
  return (
    <ol className="space-y-3.5">
      {merchants.map((m) => (
        <li key={m.merchantId ?? m.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{m.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatINR(m.amountPaise)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2.5 flex-1 rounded-full bg-ink-100" aria-hidden="true">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max((m.amountPaise / max) * 100, 2)}%`,
                  background: rankColour(m.amountPaise / max),
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs whitespace-nowrap text-ink-500">
              {m.transactionCount} {m.transactionCount === 1 ? 'payment' : 'payments'}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
