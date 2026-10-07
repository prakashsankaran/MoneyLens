import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { confidenceLabel, displayTitle, formatINR, metricText } from '@moneylens/shared';
import type { Insight, Observation } from '@moneylens/types';
import { colors, radii, type } from '@/lib/theme';
import { ProvenanceBadge, Tag } from './ui';

/**
 * One finding, led by its number. Saving ideas lead with the estimated
 * monthly saving; the reasoning and suggestion open on "Why?".
 */
export function InsightCard({ item }: { item: Insight | Observation }) {
  const [open, setOpen] = useState(false);
  const insight = 'group' in item ? item : null;
  const { title, savingIdea } = displayTitle(item.title);
  const saving = insight?.potentialMonthlySavingPaise;
  const figure = metricText(item.metric);
  const accent = savingIdea
    ? colors.positive
    : item.severity === 'high'
      ? colors.negative
      : '#f59e0b';
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.tags}>
        {savingIdea ? <Tag label="Saving idea" tone="good" /> : null}
        <ProvenanceBadge kind={item.kind} />
      </View>
      {saving !== undefined ? (
        <Text style={styles.figure}>
          <Text style={[styles.big, { color: colors.positive }]}>{formatINR(saving)}</Text>
          <Text style={[type.small, { color: colors.positive }]}> a month</Text>
        </Text>
      ) : figure ? (
        <Text style={styles.figure}>
          <Text style={styles.big}>{figure}</Text>
          <Text style={type.small}> {item.metric.label}</Text>
        </Text>
      ) : null}
      <Text style={[type.body, { fontWeight: '600', marginTop: 4 }]}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={{ marginTop: 8, alignSelf: 'flex-start' }}
      >
        <Text style={styles.link}>{open ? 'Hide details' : 'Why?'}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={[type.small, { color: colors.textSoft }]}>{item.explanation}</Text>
          {insight?.assumption ? <Text style={type.small}>{insight.assumption}</Text> : null}
          {insight?.recommendation ? (
            <View style={{ gap: 4 }}>
              <ProvenanceBadge kind="RECOMMENDATION" />
              <Text style={[type.small, { color: colors.textSoft }]}>{insight.recommendation}</Text>
            </View>
          ) : null}
          <Text style={type.small}>
            {item.supportingTransactionIds.length} supporting transactions
            {insight ? ` · Confidence ${confidenceLabel(insight.confidence)}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: 14,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  figure: { marginTop: 2 },
  big: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
