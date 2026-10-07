import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatINR, formatMonthKey, toRupeeInput } from '@moneylens/shared';
import type { CategoryNode, FinancialProfileData, MoneyPlanResponse } from '@moneylens/types';
import type { ScenarioAdjustmentInput } from '@moneylens/validation';
import { ProgressBar } from '@/components/charts';
import { MonthStepper } from '@/components/MonthStepper';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  ProvenanceBadge,
  Row,
  Screen,
  Segmented,
  Tag,
  TextField,
} from '@/components/ui';
import { errorMessage, fieldErrors, send } from '@/lib/api';
import { useBudgets, useCategories, useMoneyPlan, useSimulation } from '@/lib/queries';
import { colors, radii, type } from '@/lib/theme';

type Tab = 'plan' | 'budgets' | 'whatif';

export function PlanScreen() {
  const [tab, setTab] = useState<Tab>('plan');
  return (
    <Screen title="Money plan" subtitle="Educational planning, not financial advice">
      <Segmented
        label="Plan section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plan', label: 'Plan' },
          { value: 'budgets', label: 'Budgets' },
          { value: 'whatif', label: 'What if?' },
        ]}
      />
      {tab === 'plan' ? <PlanTab /> : tab === 'budgets' ? <BudgetsTab /> : <WhatIfTab />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const FIELDS: {
  key: keyof FinancialProfileData & `${string}Paise`;
  input: string;
  label: string;
}[] = [
  { key: 'monthlyIncomePaise', input: 'monthlyIncome', label: 'Monthly income (take-home)' },
  { key: 'fixedExpensesPaise', input: 'fixedExpenses', label: 'Fixed expenses (rent, fees)' },
  { key: 'emisPaise', input: 'emis', label: 'EMIs' },
  { key: 'insurancePaise', input: 'insurance', label: 'Insurance premiums (monthly)' },
  { key: 'investmentsPaise', input: 'investments', label: 'Investments and SIPs' },
  { key: 'savingsTargetPaise', input: 'savingsTarget', label: 'Monthly savings target' },
  {
    key: 'emergencyFundTargetPaise',
    input: 'emergencyFundTarget',
    label: 'Emergency fund goal (total)',
  },
  {
    key: 'emergencyFundCurrentPaise',
    input: 'emergencyFundCurrent',
    label: 'Emergency fund saved so far',
  },
];

type StatusMeta = { label: string; tone: 'good' | 'bad' | 'neutral' };
const INCOMPLETE: StatusMeta = { label: 'Needs your income', tone: 'neutral' };
const STATUS: Record<string, StatusMeta> = {
  'on-track': { label: 'On track', tone: 'good' },
  tight: { label: 'Tight', tone: 'neutral' },
  shortfall: { label: 'Shortfall', tone: 'bad' },
  incomplete: INCOMPLETE,
};

function PlanTab() {
  const plan = useMoneyPlan();
  const [editing, setEditing] = useState(false);
  if (plan.isPending) return <Loading />;
  if (plan.isError) {
    return <ErrorState message={errorMessage(plan.error)} onRetry={() => void plan.refetch()} />;
  }
  const { plan: result, profile } = plan.data;
  if (editing || !result.ready) {
    return (
      <ProfileForm profile={profile} onDone={() => setEditing(false)} canCancel={result.ready} />
    );
  }
  const status = STATUS[result.status] ?? INCOMPLETE;
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <ProvenanceBadge kind="CALCULATION" />
          <Tag label={status.label} tone={status.tone} />
        </View>
        <Text style={type.small}>Available surplus each month</Text>
        <Text
          style={[type.hero, { color: result.surplusPaise < 0 ? colors.negative : colors.text }]}
        >
          {formatINR(result.surplusPaise)}
        </Text>
        <Text style={[type.small, { marginTop: 4 }]}>
          {result.afterGoalsPaise < 0
            ? `${formatINR(-result.afterGoalsPaise)} short of your goals`
            : `${formatINR(result.afterGoalsPaise)} left after your goals`}
        </Text>
      </Card>
      <Card title="How it adds up">
        {result.breakdown.map((l) => (
          <Row
            key={l.key}
            label={l.label}
            value={formatINR(l.amountPaise)}
            strong={l.key === 'surplus'}
          />
        ))}
      </Card>
      {result.goals.length > 0 ? (
        <Card title="Your goals each month">
          {result.goals.map((g) => (
            <View key={g.key}>
              <Row label={g.label} value={formatINR(g.amountPaise)} />
              {g.note ? <Text style={type.small}>{g.note}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}
      {result.suggestions.length > 0 ? (
        <Card title="Suggestions">
          <View style={{ gap: 12 }}>
            {result.suggestions.map((s) => (
              <View key={s.text} style={{ gap: 4 }}>
                <ProvenanceBadge kind={s.kind} />
                <Text style={[type.body, { color: colors.textSoft }]}>{s.text}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <Text style={type.small}>{result.disclaimer}</Text>
      <Button label="Edit my numbers" variant="secondary" onPress={() => setEditing(true)} />
    </>
  );
}

function ProfileForm({
  profile,
  canCancel,
  onDone,
}: {
  profile: FinancialProfileData | null;
  canCancel: boolean;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const initial = Object.fromEntries(
    FIELDS.map((f) => {
      const v = profile?.[f.key];
      return [f.input, typeof v === 'number' ? toRupeeInput(v) : ''];
    }),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const save = useMutation({
    // PATCH changes only the fields sent, so upcoming expenses set on the web stay.
    mutationFn: () =>
      send<MoneyPlanResponse>(
        'PATCH',
        '/money-plan',
        Object.fromEntries(FIELDS.map((f) => [f.input, values[f.input]?.trim() ?? ''])),
      ),
    onSuccess: (data) => {
      client.setQueryData(['money-plan'], data);
      onDone();
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Card
      title="Your monthly numbers"
      subtitle="Amounts in rupees. Leave blank what doesn't apply. Spending categories come from your transactions."
    >
      <View style={{ gap: 14 }}>
        {FIELDS.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            keyboardType="decimal-pad"
            placeholder="0"
            value={values[f.input]}
            onChangeText={(v) => setValues((prev) => ({ ...prev, [f.input]: v }))}
            error={errors[f.input]}
          />
        ))}
        {save.isError && Object.keys(errors).length === 0 ? (
          <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
            {errorMessage(save.error)}
          </Text>
        ) : null}
        <Button label="Save and calculate" busy={save.isPending} onPress={() => save.mutate()} />
        {canCancel ? <Button label="Cancel" variant="ghost" onPress={onDone} /> : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

function BudgetsTab() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const budgets = useBudgets(month);
  if (budgets.isPending) return <Loading />;
  if (budgets.isError) {
    return (
      <ErrorState message={errorMessage(budgets.error)} onRetry={() => void budgets.refetch()} />
    );
  }
  const b = budgets.data;
  const usedPct = b.totalBudgetPaise > 0 ? (b.totalSpentPaise / b.totalBudgetPaise) * 100 : 0;
  return (
    <>
      {b.availableMonths.length > 0 ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <MonthStepper month={b.month} months={b.availableMonths} onChange={setMonth} />
        </View>
      ) : null}
      {b.items.length === 0 ? (
        <Card title="No budgets yet">
          <Text style={type.small}>
            Set monthly budgets per category on the MoneyLens website (Money Plan › Budgets). They
            appear here with your progress.
          </Text>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={type.small}>Spent of budget in {formatMonthKey(b.month)}</Text>
            <Text style={type.hero}>{formatINR(b.totalSpentPaise)}</Text>
            <Text style={type.small}>
              of {formatINR(b.totalBudgetPaise)} · day {b.daysElapsed} of {b.daysInMonth}
            </Text>
            <ProgressBar
              pct={usedPct}
              status={usedPct > 100 ? 'over' : usedPct >= 90 ? 'near' : 'under'}
            />
          </Card>
          {b.items.map((item) => (
            <Card key={item.id}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                <Text style={[type.body, { fontWeight: '600', flex: 1 }]}>{item.name}</Text>
                <Text style={[type.body, { fontWeight: '700' }]}>{formatINR(item.spentPaise)}</Text>
              </View>
              <ProgressBar pct={item.usedPct} status={item.status} />
              <Text style={[type.small, { marginTop: 6 }]}>
                {item.remainingPaise >= 0
                  ? `${formatINR(item.remainingPaise)} left of ${formatINR(item.amountPaise)}`
                  : `${formatINR(-item.remainingPaise)} over ${formatINR(item.amountPaise)}`}
                {item.projectedPaise !== null && item.spentPaise > 0
                  ? ` · on pace for about ${formatINR(item.projectedPaise)}`
                  : ''}
              </Text>
            </Card>
          ))}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// What if?
// ---------------------------------------------------------------------------

type Kind = ScenarioAdjustmentInput['type'];

interface Scenario {
  label: string;
  type: Kind;
  slug?: string;
  value: string;
  unit: '%' | '₹';
}

const REDUCE_FOOD: Scenario = {
  label: 'Reduce food',
  type: 'category-percent',
  slug: 'food',
  value: '20',
  unit: '%',
};
const SCENARIOS: Scenario[] = [
  REDUCE_FOOD,
  { label: 'Save more', type: 'save-more', value: '5000', unit: '₹' },
  { label: 'Reduce shopping', type: 'category-amount', slug: 'shopping', value: '3000', unit: '₹' },
  { label: 'Income change', type: 'income-change', value: '10000', unit: '₹' },
];

function categoryFor(cats: CategoryNode[], slug?: string): string {
  return cats.find((c) => c.parentId === null && c.slug === slug)?.id ?? '';
}

function WhatIfTab() {
  const categories = useCategories();
  const simulate = useSimulation();
  const [picked, setPicked] = useState(0);
  const [value, setValue] = useState(REDUCE_FOOD.value);
  const [returnPct, setReturnPct] = useState('6');
  const scenario = SCENARIOS[picked] ?? REDUCE_FOOD;
  const categoryId = categoryFor(categories.data ?? [], scenario.slug);

  const run = () => {
    const adjustment: ScenarioAdjustmentInput =
      scenario.type === 'category-percent'
        ? { type: scenario.type, categoryId, percent: value }
        : scenario.type === 'category-amount'
          ? { type: scenario.type, categoryId, amount: value }
          : { type: scenario.type, amount: value };
    simulate.mutate({ adjustments: [adjustment], annualReturnPct: returnPct });
  };
  const errors = fieldErrors(simulate.error);
  const result = simulate.data;

  return (
    <>
      <Card title="What would change?" subtitle="Pick a change, adjust it, then calculate">
        <View style={styles.grid}>
          {SCENARIOS.map((s, i) => (
            <Pressable
              key={s.label}
              accessibilityRole="button"
              accessibilityState={{ selected: i === picked }}
              onPress={() => {
                setPicked(i);
                setValue(s.value);
                simulate.reset();
              }}
              style={[styles.option, i === picked && styles.optionActive]}
            >
              <Text style={[styles.optionText, i === picked && { color: colors.primary }]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ gap: 12, marginTop: 14 }}>
          <TextField
            label={
              scenario.type === 'income-change'
                ? 'Change in monthly income (₹, minus to reduce)'
                : scenario.unit === '%'
                  ? 'Reduce by (%)'
                  : 'Amount each month (₹)'
            }
            keyboardType="numbers-and-punctuation"
            value={value}
            onChangeText={setValue}
            error={errors['adjustments.0.amount'] ?? errors['adjustments.0.percent']}
          />
          <TextField
            label="Assumed yearly return (%)"
            keyboardType="decimal-pad"
            value={returnPct}
            onChangeText={setReturnPct}
            hint="An assumption for the projection, not a promise. Returns are never guaranteed."
            error={errors.annualReturnPct}
          />
          {scenario.slug && !categoryId ? (
            <Text style={type.small}>You have no {scenario.slug} category to reduce.</Text>
          ) : null}
          {simulate.isError && Object.keys(errors).length === 0 ? (
            <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
              {errorMessage(simulate.error)}
            </Text>
          ) : null}
          <Button
            label="Calculate"
            busy={simulate.isPending}
            disabled={!!scenario.slug && !categoryId}
            onPress={run}
          />
        </View>
      </Card>
      {result ? (
        <Card>
          <ProvenanceBadge kind="CALCULATION" />
          <Text style={[type.small, { marginTop: 8 }]}>Extra money kept each month</Text>
          <Text
            style={[
              type.hero,
              { color: result.monthlyImpactPaise < 0 ? colors.negative : colors.positive },
            ]}
          >
            {formatINR(result.monthlyImpactPaise)}
          </Text>
          <Text style={type.small}>{formatINR(result.annualImpactPaise)} a year</Text>
          <View style={{ marginTop: 12 }}>
            {result.adjustments.map((a) => (
              <Text key={a.description} style={[type.small, { color: colors.textSoft }]}>
                {a.description}
                {a.note ? ` (${a.note})` : ''}
              </Text>
            ))}
          </View>
          <View style={styles.projections}>
            {result.projections.map((p) => (
              <View key={p.years} style={styles.projection}>
                <Text style={type.label}>{p.years} YEARS</Text>
                <Text style={[type.heading, { marginTop: 2 }]}>{formatINR(p.withReturnPaise)}</Text>
                <Text style={[type.small, { fontSize: 11 }]}>
                  {formatINR(p.contributedPaise)} put in
                </Text>
              </View>
            ))}
          </View>
          {result.assumptions.map((a) => (
            <Text key={a} style={[type.small, { marginTop: 4 }]}>
              • {a}
            </Text>
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.brand[50] },
  optionText: { fontSize: 14, fontWeight: '600', color: colors.textSoft },
  projections: { flexDirection: 'row', gap: 8, marginTop: 16 },
  projection: {
    flex: 1,
    backgroundColor: colors.ink[50],
    borderRadius: radii.md,
    padding: 10,
  },
});
