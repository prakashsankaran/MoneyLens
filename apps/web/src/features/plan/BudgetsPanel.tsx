import { useState } from 'react';
import { formatINR, formatMonthKey } from '@moneylens/shared';
import type { BudgetItem } from '@moneylens/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard } from '../../components/PageHeader';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { toRupeeInput, useBudgets, usePutBudgets } from './usePlan';

const STATUS: Record<BudgetItem['status'], { label: string; bar: string; text: string }> = {
  under: { label: 'Within budget', bar: 'bg-positive', text: 'text-positive' },
  near: { label: 'Near the limit', bar: 'bg-warning', text: 'text-warning' },
  over: { label: 'Over budget', bar: 'bg-negative', text: 'text-negative' },
};

const inputClass =
  'h-10 w-32 rounded-lg border border-ink-300 bg-surface px-3 text-right text-sm tabular-nums';

function BudgetRow({
  item,
  inProgress,
  onSave,
  onRemove,
  busy,
}: {
  item: BudgetItem;
  inProgress: boolean;
  onSave: (amount: string) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(toRupeeInput(item.amountPaise));
  const status = STATUS[item.status];

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{item.name}</p>
        <p className="text-sm tabular-nums">
          {formatINR(item.spentPaise)} <span className="text-ink-500">of</span>{' '}
          {formatINR(item.amountPaise)}
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-label={`${item.name} budget used`}
        aria-valuenow={Math.round(item.usedPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full ${status.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, item.usedPct))}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>
          <span className={`font-medium ${status.text}`}>{status.label}</span>
          <span className="text-ink-500">
            {' · '}
            {item.remainingPaise >= 0
              ? `${formatINR(item.remainingPaise)} left`
              : `${formatINR(-item.remainingPaise)} over`}
            {' · '}
            {Math.round(item.usedPct)}% used
          </span>
          {inProgress && item.projectedPaise !== null && item.spentPaise > 0 && (
            <span className="block text-ink-500">
              At this pace, about {formatINR(item.projectedPaise)} by month end.
            </span>
          )}
        </p>
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSave(amount);
              setEditing(false);
            }}
          >
            <label className="sr-only" htmlFor={`budget-${item.categoryId}`}>
              New budget for {item.name} in rupees
            </label>
            <input
              id={`budget-${item.categoryId}`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <Button type="submit" className="h-10" disabled={busy}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              onClick={() => setEditing(true)}
              aria-label={`Change ${item.name} budget`}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              disabled={busy}
              onClick={onRemove}
              aria-label={`Remove ${item.name} budget`}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Monthly category budgets with spending against them. */
export function BudgetsPanel() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const budgets = useBudgets(month);
  const categories = useCategories();
  const put = usePutBudgets();
  const [newCategory, setNewCategory] = useState('');
  const [newAmount, setNewAmount] = useState('');

  if (budgets.isPending) return <FullPageSpinner />;
  if (budgets.isError) {
    return <ErrorCard message={budgets.error.message} onRetry={() => void budgets.refetch()} />;
  }

  const data = budgets.data;
  const inProgress = data.daysElapsed < data.daysInMonth;
  const save = (categoryId: string, amount: string | null) =>
    put.mutate({ month: data.month, items: [{ categoryId, amount }] });
  const budgeted = new Set(data.items.map((i) => i.categoryId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          Month
          <select
            value={data.month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            {[...data.availableMonths].reverse().map((m) => (
              <option key={m} value={m}>
                {formatMonthKey(m)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-ink-500">
          {inProgress
            ? `Day ${data.daysElapsed} of ${data.daysInMonth}`
            : `${formatMonthKey(data.month)} is complete`}
        </p>
      </div>

      {put.isError && (
        <p role="alert" className="text-sm text-negative">
          {put.error.message}
        </p>
      )}

      {data.items.length === 0 ? (
        <Card title={`No budgets for ${formatMonthKey(data.month)}`}>
          <p className="text-sm text-ink-500">
            Add a budget below, or set the suggested budgets from the Plan tab.
          </p>
        </Card>
      ) : (
        <Card
          title={`Budgets for ${formatMonthKey(data.month)}`}
          action={<ProvenanceBadge kind="CALCULATION" />}
        >
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-500">Budgeted</dt>
              <dd className="font-semibold tabular-nums">{formatINR(data.totalBudgetPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Spent in these</dt>
              <dd className="font-semibold tabular-nums">{formatINR(data.totalSpentPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Spent elsewhere</dt>
              <dd className="font-semibold tabular-nums">
                {formatINR(data.unbudgetedSpendingPaise)}
              </dd>
            </div>
          </dl>
          <ul className="mt-2 divide-y divide-ink-100">
            {data.items.map((item) => (
              <BudgetRow
                key={`${data.month}-${item.categoryId}-${item.amountPaise}`}
                item={item}
                inProgress={inProgress}
                busy={put.isPending}
                onSave={(amount) => save(item.categoryId, amount)}
                onRemove={() => save(item.categoryId, null)}
              />
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-500">
            Spending is net of refunds and includes subcategories.
            {inProgress && ' Month-end figures assume you keep spending at the same daily pace.'}
          </p>
        </Card>
      )}

      <Card title="Add a budget">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCategory || !newAmount) return;
            put.mutate(
              { month: data.month, items: [{ categoryId: newCategory, amount: newAmount }] },
              {
                onSuccess: () => {
                  setNewCategory('');
                  setNewAmount('');
                },
              },
            );
          }}
        >
          <label className="min-w-56 flex-1 text-sm">
            <span className="mb-1 block font-medium">Category</span>
            <CategorySelect
              categories={(categories.data ?? []).map((c) => ({
                ...c,
                children: c.children.filter((ch) => !budgeted.has(ch.id)),
              }))}
              emptyLabel="Choose a category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Monthly amount (₹)</span>
            <input
              inputMode="decimal"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className={`${inputClass} h-11 w-40`}
            />
          </label>
          <Button type="submit" disabled={put.isPending || !newCategory || !newAmount}>
            Add budget
          </Button>
        </form>
        {budgeted.has(newCategory) && (
          <p className="mt-2 text-xs text-ink-500">
            This category already has a budget; adding replaces its amount.
          </p>
        )}
      </Card>
    </div>
  );
}
