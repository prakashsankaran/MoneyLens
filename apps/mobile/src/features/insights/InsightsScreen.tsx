import { useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDayKey, formatINR, formatMonthKey } from '@moneylens/shared';
import { INSIGHT_GROUPS, type InsightGroup } from '@moneylens/types';
import { HealthSummary } from '@/components/HealthSummary';
import { InsightCard } from '@/components/InsightCard';
import { MonthStepper } from '@/components/MonthStepper';
import {
  Card,
  Empty,
  ErrorState,
  Loading,
  ProvenanceBadge,
  Screen,
  Segmented,
  Tag,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useDashboard, useInsights, useRecurring } from '@/lib/queries';
import { colors, type } from '@/lib/theme';

type View_ = 'insights' | 'recurring' | 'health';

const GROUP_LABELS: Record<InsightGroup, string> = {
  spending: 'Spending',
  saving: 'Saving',
  behaviour: 'Behaviour',
  recurring: 'Recurring',
  anomalies: 'Anomalies',
  planning: 'Planning',
};

export function InsightsScreen() {
  const [view, setView] = useState<View_>('insights');
  const [month, setMonth] = useState<string | undefined>(undefined);
  return (
    <Screen title="Insights">
      <Segmented
        label="Section"
        value={view}
        onChange={setView}
        options={[
          { value: 'insights', label: 'Patterns' },
          { value: 'recurring', label: 'Recurring' },
          { value: 'health', label: 'Health' },
        ]}
      />
      {view === 'insights' ? (
        <Patterns month={month} onMonth={setMonth} />
      ) : view === 'recurring' ? (
        <Recurring />
      ) : (
        <Health month={month} />
      )}
    </Screen>
  );
}

function Patterns({ month, onMonth }: { month?: string; onMonth: (m: string) => void }) {
  const insights = useInsights(month);
  const [group, setGroup] = useState<InsightGroup | 'all'>('all');
  if (insights.isPending) return <Loading />;
  if (insights.isError) {
    return (
      <ErrorState message={errorMessage(insights.error)} onRetry={() => void insights.refetch()} />
    );
  }
  const data = insights.data;
  if (data.availableMonths.length === 0) {
    return (
      <Empty
        title="No insights yet"
        message="Insights appear once you have imported transactions."
      />
    );
  }
  const counts = new Map<InsightGroup, number>();
  for (const i of data.insights) counts.set(i.group, (counts.get(i.group) ?? 0) + 1);
  const shown = group === 'all' ? data.insights : data.insights.filter((i) => i.group === group);
  return (
    <>
      <View style={{ alignSelf: 'flex-start' }}>
        <MonthStepper month={data.month} months={data.availableMonths} onChange={onMonth} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {(['all', ...INSIGHT_GROUPS] as const).map((g) => {
          const n = g === 'all' ? data.insights.length : (counts.get(g) ?? 0);
          const active = g === group;
          return (
            <Pressable
              key={g}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setGroup(g)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>
                {g === 'all' ? 'All' : GROUP_LABELS[g]} {n}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {shown.length === 0 ? (
        <Text style={type.small}>Nothing in this group for {formatMonthKey(data.month)}.</Text>
      ) : (
        shown.map((i) => <InsightCard key={i.id} item={i} />)
      )}
      {data.skipped.length > 0 ? (
        <Card title="Checks that need more data">
          {data.skipped.map((s) => (
            <Text key={s.rule} style={[type.small, { marginBottom: 4 }]}>
              • {s.reason}
            </Text>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function Recurring() {
  const recurring = useRecurring();
  if (recurring.isPending) return <Loading />;
  if (recurring.isError) {
    return (
      <ErrorState
        message={errorMessage(recurring.error)}
        onRetry={() => void recurring.refetch()}
      />
    );
  }
  const { items, monthlyOutgoingPaise, annualOutgoingPaise } = recurring.data;
  const active = items.filter((i) => !i.dismissed && i.active && i.flow === 'OUT');
  return (
    <>
      <Card>
        <ProvenanceBadge kind="CALCULATION" />
        <Text style={[type.hero, { marginTop: 8 }]}>{formatINR(monthlyOutgoingPaise)}</Text>
        <Text style={type.small}>
          a month on {active.length} recurring payments · {formatINR(annualOutgoingPaise)} a year
        </Text>
      </Card>
      {items.length === 0 ? (
        <Text style={type.small}>No recurring payments detected yet.</Text>
      ) : (
        items
          .filter((i) => !i.dismissed)
          .map((i) => (
            <Card key={i.id}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '600' }]}>{i.label}</Text>
                  {i.flow === 'IN' ? <Tag label="Money in" tone="good" /> : null}
                  <Text style={type.small}>
                    {i.frequency.toLowerCase()} · {i.occurrences}{' '}
                    {i.flow === 'IN' ? 'credits' : 'payments'}
                    {i.subscriptionLike ? ' · subscription-like' : ''}
                  </Text>
                  <Text style={type.small}>
                    {i.active
                      ? `Next expected ${formatDayKey(i.nextExpectedDate)}`
                      : 'Looks stopped'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      type.body,
                      { fontWeight: '700' },
                      i.flow === 'IN' ? { color: colors.positive } : null,
                    ]}
                  >
                    {i.amountVaries ? 'about ' : ''}
                    {formatINR(i.typicalAmountPaise)}
                  </Text>
                  <Text style={type.small}>{formatINR(i.monthlyEquivalentPaise)}/month</Text>
                </View>
              </View>
            </Card>
          ))
      )}
    </>
  );
}

function Health({ month }: { month?: string }) {
  const dashboard = useDashboard(month);
  if (dashboard.isPending) return <Loading />;
  if (dashboard.isError) {
    return (
      <ErrorState
        message={errorMessage(dashboard.error)}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }
  return (
    <Card
      title="Financial health score"
      subtitle={`${formatMonthKey(dashboard.data.month)} · each part shows its working`}
    >
      <HealthSummary health={dashboard.data.health} detailed />
    </Card>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSoft },
});
