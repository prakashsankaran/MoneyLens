import { useState } from 'react';
import { Card } from '../../components/Card';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { formatDayTime } from '../../lib/format';
import { BudgetsPanel } from './BudgetsPanel';
import { PlanForm } from './PlanForm';
import { PlanResult } from './PlanResult';
import { SimulatorPanel } from './SimulatorPanel';
import { useMoneyPlan } from './usePlan';

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'what-if', label: 'What if?' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function PlanTab() {
  const plan = useMoneyPlan();
  if (plan.isPending) return <FullPageSpinner />;
  if (plan.isError) {
    return <ErrorCard message={plan.error.message} onRetry={() => void plan.refetch()} />;
  }
  const { profile, plan: result, savedAt } = plan.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card
        title="Your figures"
        description={
          savedAt
            ? `Last saved ${formatDayTime(savedAt)}. Amounts are monthly unless stated.`
            : 'Amounts are monthly unless stated. Leave a field empty to use your transactions.'
        }
      >
        <PlanForm profile={profile} baseline={result.baseline} />
      </Card>
      <Card title="Your money plan">
        <PlanResult plan={result} />
      </Card>
    </div>
  );
}

export function MoneyPlanPage() {
  const [tab, setTab] = useState<Tab>('plan');
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader
        title="Money Plan"
        description="An educational planning tool built from your figures and your transactions."
      />
      <div
        role="tablist"
        aria-label="Money Plan sections"
        className="mt-6 flex gap-1 border-b border-ink-100"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === 'plan' && <PlanTab />}
        {tab === 'budgets' && <BudgetsPanel />}
        {tab === 'what-if' && <SimulatorPanel />}
      </div>
    </div>
  );
}
