import { formatINR } from '@moneylens/shared';
import type { MerchantSummaryItem } from '@moneylens/types';

export function TopMerchants({ merchants }: { merchants: MerchantSummaryItem[] }) {
  if (merchants.length === 0) {
    return <p className="text-sm text-ink-500">No merchant payments this month.</p>;
  }
  return (
    <ol className="divide-y divide-ink-100">
      {merchants.map((m, i) => (
        <li
          key={m.merchantId ?? m.name}
          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="text-xs text-ink-500">
                {m.transactionCount} {m.transactionCount === 1 ? 'payment' : 'payments'}
              </p>
            </div>
          </div>
          <p className="text-sm font-medium tabular-nums">{formatINR(m.amountPaise)}</p>
        </li>
      ))}
    </ol>
  );
}
