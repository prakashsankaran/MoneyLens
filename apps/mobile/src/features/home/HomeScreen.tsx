import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  foldCategories,
  formatINR,
  formatMonthKey,
  greetingFor,
  pctDelta,
  savingsRateTone,
  type Delta,
} from '@moneylens/shared';
import type { DashboardData } from '@moneylens/types';
import { useAuth } from '@/auth/AuthProvider';
import { BarList, Donut, ScoreRing, TrendColumns } from '@/components/charts';
import { HealthSummary } from '@/components/HealthSummary';
import { InsightCard } from '@/components/InsightCard';
import { MonthStepper } from '@/components/MonthStepper';
import { Button, Card, DeltaPill, Empty, ErrorState, Loading, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useDashboard } from '@/lib/queries';
import { categoryColour, COLOURED_CATEGORIES, colors, type } from '@/lib/theme';
import { MoneyBriefCard } from './MoneyBriefCard';

export function HomeScreen() {
  const { user } = useAuth();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const dashboard = useDashboard(month);
  const firstName = user?.name.split(' ')[0] ?? '';
  const greeting = `${greetingFor(new Date())}${firstName ? `, ${firstName}` : ''}`;

  if (dashboard.isPending) return <Loading label="Loading your dashboard" />;
  if (dashboard.isError) {
    return (
      <Screen title="Home">
        <ErrorState
          title="We couldn't load your dashboard"
          message={errorMessage(dashboard.error)}
          onRetry={() => void dashboard.refetch()}
        />
      </Screen>
    );
  }

  const data = dashboard.data;
  const hasData = data.availableMonths.length > 0;
  return (
    <Screen
      subtitle={greeting}
      title={hasData ? `Your money in ${formatMonthKey(data.month)}` : 'Welcome to MoneyLens'}
      refreshing={dashboard.isRefetching}
      onRefresh={() => void dashboard.refetch()}
    >
      {!hasData ? (
        <Empty
          title="No transactions yet"
          message="Import a Google Pay PDF, or a CSV or Excel statement from your bank, and your dashboard fills in."
        >
          <Button label="Import a statement" onPress={() => router.push('/imports')} />
        </Empty>
      ) : (
        <>
          <View style={{ alignSelf: 'flex-start' }}>
            <MonthStepper month={data.month} months={data.availableMonths} onChange={setMonth} />
          </View>
          <Overview data={data} />
          <Card title={`Where did my money go?`} subtitle="Spending by category, after refunds">
            <WhereMoneyWent data={data} />
          </Card>
          <Card title="Where can I potentially save?" subtitle="Ideas from your recent months">
            <SavingIdeas data={data} />
          </Card>
          <Card
            title="How has my spending changed?"
            subtitle={`Income and spending over ${data.trend.length} months`}
          >
            <TrendColumns trend={data.trend} />
          </Card>
          <Card
            title="Who did I pay the most?"
            subtitle={`Top merchants in ${formatMonthKey(data.month)}`}
          >
            {data.topMerchants.length === 0 ? (
              <Text style={type.small}>No payments to merchants this month.</Text>
            ) : (
              <BarList
                rows={data.topMerchants.slice(0, 5).map((m) => ({
                  key: m.merchantId ?? m.name,
                  label: m.name,
                  value: m.amountPaise,
                  detail: `×${m.transactionCount}`,
                }))}
              />
            )}
          </Card>
          <Card title="How healthy are my finances?" subtitle="An explainable score out of 100">
            <HealthSummary health={data.health} />
            <Button
              label="See how it is calculated"
              variant="ghost"
              onPress={() => router.push('/insights')}
            />
          </Card>
          <MoneyBriefCard month={data.month} />
        </>
      )}
    </Screen>
  );
}

/** Spending as the big number with its change, the savings rate as a ring, then income and saved. */
function Overview({ data }: { data: DashboardData }) {
  const { totals, comparison } = data;
  const prev = comparison ? formatMonthKey(comparison.previousMonth, { short: true }) : '';
  const spendingDelta = comparison
    ? pctDelta(comparison.spendingChangePct, prev, false)
    : undefined;
  const incomeDelta = comparison ? pctDelta(comparison.incomeChangePct, prev, true) : undefined;
  const savedDelta: Delta | undefined =
    comparison && comparison.savedChangePaise !== 0
      ? {
          text: `${comparison.savedChangePaise > 0 ? '▲' : '▼'} ${formatINR(Math.abs(comparison.savedChangePaise))} vs ${prev}`,
          tone: comparison.savedChangePaise > 0 ? 'good' : 'bad',
        }
      : undefined;
  const rate = totals.savingsRatePct;
  const overspent = totals.savedPaise < 0;
  const rateText = rate === null ? '—' : rate < -999 ? '< −999%' : `${Math.round(rate)}%`;

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <View style={styles.heroRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.small, { fontWeight: '500' }]}>Spending</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={[type.hero, { marginTop: 2 }]}>
              {formatINR(totals.spendingPaise)}
            </Text>
            <Text style={[type.small, { marginTop: 4 }]}>
              {totals.refundsPaise > 0
                ? `After ${formatINR(totals.refundsPaise)} in refunds`
                : `${totals.spendTransactionCount} payments`}
            </Text>
            {spendingDelta ? (
              <View style={{ marginTop: 10 }}>
                <DeltaPill delta={spendingDelta} />
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: 'center' }}>
            <ScoreRing
              value={rate === null ? null : Math.max(0, rate)}
              tone={savingsRateTone(rate)}
              size={96}
              thickness={9}
            >
              <Text
                style={{
                  fontSize: rateText.length > 4 ? 15 : 22,
                  fontWeight: '700',
                  color: overspent ? colors.negative : colors.text,
                }}
              >
                {rateText}
              </Text>
              <Text style={[type.small, { fontSize: 11 }]}>
                {rate === null ? 'No income' : 'kept'}
              </Text>
            </ScoreRing>
            <Text style={[type.small, { fontSize: 11, marginTop: 4 }]}>Savings rate</Text>
          </View>
        </View>
      </Card>
      <View style={styles.tiles}>
        <Tile label="Income" value={formatINR(totals.incomePaise)} delta={incomeDelta} />
        <Tile
          label={overspent ? 'Overspent' : 'Saved'}
          value={formatINR(Math.abs(totals.savedPaise))}
          colour={overspent ? colors.negative : colors.positive}
          delta={savedDelta}
        />
      </View>
      <Text style={type.small}>
        Calculated from your confirmed transactions. Transfers between your own accounts are not
        counted.
      </Text>
    </View>
  );
}

function Tile({
  label,
  value,
  colour = colors.text,
  delta,
}: {
  label: string;
  value: string;
  colour?: string;
  delta: Delta | undefined;
}) {
  return (
    <Card style={{ flex: 1 }}>
      <Text style={[type.small, { fontWeight: '500' }]}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.tileValue, { color: colour }]}>
        {value}
      </Text>
      {delta ? (
        <View style={{ marginTop: 8 }}>
          <DeltaPill delta={delta} />
        </View>
      ) : null}
    </Card>
  );
}

function WhereMoneyWent({ data }: { data: DashboardData }) {
  if (data.categories.length === 0) {
    return <Text style={type.small}>No spending recorded for this month.</Text>;
  }
  const rows = foldCategories(data.categories, COLOURED_CATEGORIES);
  return (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: 'center' }}>
        <Donut
          slices={rows.map((r, i) => ({
            key: r.categoryId ?? r.slug,
            label: r.name,
            value: r.amountPaise,
            color: categoryColour(i),
          }))}
          label={`Spending by category: ${rows.map((r) => `${r.name} ${Math.round(r.sharePct)}%`).join(', ')}`}
        >
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.donutTotal}>
            {formatINR(data.totals.spendingPaise)}
          </Text>
          <Text style={type.small}>spent</Text>
        </Donut>
      </View>
      <BarList
        rows={rows.map((r, i) => ({
          key: r.categoryId ?? r.slug,
          label: r.name,
          value: r.amountPaise,
          detail: `${Math.round(r.sharePct)}%`,
          color: categoryColour(i),
        }))}
      />
    </View>
  );
}

function SavingIdeas({ data }: { data: DashboardData }) {
  const ideas = data.savingOpportunities.slice(0, 3);
  const observations = data.observations.slice(0, Math.max(0, 4 - ideas.length));
  if (ideas.length === 0 && observations.length === 0) {
    return (
      <Text style={type.small}>
        {data.historyMonths < 2
          ? 'Comparisons need at least two earlier months of transactions. Nothing to flag yet.'
          : 'Nothing stands out this month compared with your recent months.'}
      </Text>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {ideas.map((i) => (
        <InsightCard key={i.id} item={i} />
      ))}
      {observations.map((o) => (
        <InsightCard key={o.id} item={o} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tiles: { flexDirection: 'row', gap: 12 },
  tileValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginTop: 2 },
  donutTotal: { fontSize: 20, fontWeight: '700', color: colors.text, maxWidth: 120 },
});
