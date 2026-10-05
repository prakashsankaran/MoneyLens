import { formatINR } from '@moneylens/shared';
import type { TransactionFlow } from '@moneylens/types';

/** Signed amount: money out in ink with a minus sign, money in green with a plus. */
export function Amount({
  paise,
  flow,
  className = '',
}: {
  paise: number;
  flow: TransactionFlow;
  className?: string;
}) {
  const sign = flow === 'OUT' ? '−' : '+';
  return (
    <span
      className={`whitespace-nowrap tabular-nums font-medium ${flow === 'IN' ? 'text-positive' : 'text-ink-900'} ${className}`}
    >
      <span className="sr-only">{flow === 'OUT' ? 'Paid ' : 'Received '}</span>
      <span aria-hidden="true">{sign}</span>
      {formatINR(paise, { exact: true })}
    </span>
  );
}
