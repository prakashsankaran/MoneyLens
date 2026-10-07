import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDay, formatDayKey, formatINR, TYPE_LABELS } from '@moneylens/shared';
import type { ImportReview, ImportRow, ImportRowDecision } from '@moneylens/types';
import { Amount } from '@/components/Amount';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Button, Card, ErrorState, Loading, Segmented, Tag } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useConfirmImport, useImportReview, useUpdateImportRow } from '@/lib/queries';
import { colors, radii, type } from '@/lib/theme';

type Filter = 'all' | 'attention' | 'excluded';

/** Rows the user should look at: possible duplicates, no category, or parser warnings. */
const needsAttention = (r: ImportRow) =>
  r.decision === 'DUPLICATE' ||
  r.duplicateReason !== null ||
  r.category === null ||
  r.warnings.length > 0;

export function ImportReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const review = useImportReview(id);
  const update = useUpdateImportRow(id);
  const confirm = useConfirmImport(id);
  const [filter, setFilter] = useState<Filter>('all');
  const [categoryFor, setCategoryFor] = useState<ImportRow | null>(null);

  if (review.isPending) return <Loading label="Loading the review" />;
  if (review.isError) {
    return (
      <View style={{ padding: 16 }}>
        <ErrorState message={errorMessage(review.error)} onRetry={() => void review.refetch()} />
      </View>
    );
  }

  const data = review.data;
  const editable = data.import.status === 'READY_FOR_REVIEW';
  const rows = data.rows.filter((r) =>
    filter === 'all' ? true : filter === 'excluded' ? r.decision !== 'INCLUDE' : needsAttention(r),
  );

  const setDecision = (row: ImportRow, decision: ImportRowDecision) =>
    update.mutate({ rowId: row.id, input: { decision } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: editable ? 120 : 32 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <Summary data={data} />
            {data.warnings.length > 0 ? (
              <Card title="Notes from reading the file">
                {data.warnings.map((w) => (
                  <Text key={w} style={[type.small, { marginBottom: 4 }]}>
                    • {w}
                  </Text>
                ))}
              </Card>
            ) : null}
            {!editable ? (
              <Card>
                <Text style={type.body}>
                  {data.import.status === 'CONFIRMED'
                    ? `This import is done: ${data.import.committedCount} transactions were saved.`
                    : (data.import.errorMessage ?? 'This import can no longer be changed.')}
                </Text>
              </Card>
            ) : null}
            <Segmented
              label="Show rows"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${data.rows.length}` },
                { value: 'attention', label: 'Check' },
                { value: 'excluded', label: 'Left out' },
              ]}
            />
          </View>
        }
        renderItem={({ item }) => (
          <RowCard
            row={item}
            editable={editable}
            onDecision={(d) => setDecision(item, d)}
            onCategory={() => setCategoryFor(item)}
          />
        )}
        ListEmptyComponent={<Text style={type.small}>No rows here.</Text>}
      />

      {editable ? (
        <View style={styles.footer}>
          {confirm.isError ? (
            <Text
              accessibilityRole="alert"
              style={[type.small, { color: colors.negative, marginBottom: 8 }]}
            >
              {errorMessage(confirm.error)}
            </Text>
          ) : null}
          <Button
            label={`Import ${data.stats.included} transactions`}
            busy={confirm.isPending}
            disabled={data.stats.included === 0}
            onPress={() =>
              confirm.mutate(undefined, {
                onSuccess: () => router.replace('/'),
              })
            }
          />
        </View>
      ) : null}

      <CategoryPicker
        visible={categoryFor !== null}
        title="Choose a category"
        selectedId={categoryFor?.category?.id ?? null}
        noneLabel="Uncategorised"
        onClose={() => setCategoryFor(null)}
        onSelect={(categoryId) => {
          if (categoryFor) {
            update.mutate({
              rowId: categoryFor.id,
              input: { categoryId, ...(categoryFor.merchantName ? { applyToSimilar: true } : {}) },
            });
          }
          setCategoryFor(null);
        }}
      />
    </View>
  );
}

function Summary({ data }: { data: ImportReview }) {
  const s = data.stats;
  return (
    <Card>
      <Text style={type.small} numberOfLines={1}>
        {data.import.filename}
      </Text>
      <Text style={[type.hero, { marginTop: 4 }]}>{s.detected}</Text>
      <Text style={type.small}>
        transactions found
        {s.firstDate && s.lastDate
          ? ` · ${formatDayKey(s.firstDate)} to ${formatDayKey(s.lastDate)}`
          : ''}
      </Text>
      <View style={styles.stats}>
        <Stat label="Money out" value={formatINR(s.totalDebitsPaise)} />
        <Stat label="Money in" value={formatINR(s.totalCreditsPaise)} />
        <Stat
          label="Possible duplicates"
          value={String(s.possibleDuplicates)}
          colour={s.possibleDuplicates ? colors.warning : undefined}
        />
        <Stat
          label="Uncategorised"
          value={String(s.uncategorized)}
          colour={s.uncategorized ? colors.warning : undefined}
        />
      </View>
      <Text style={[type.small, { marginTop: 8 }]}>
        {s.included} will be imported · {s.excluded} left out. Totals cover the rows being imported.
      </Text>
    </Card>
  );
}

function Stat({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.heading, colour ? { color: colour } : null]}>{value}</Text>
      <Text style={[type.small, { fontSize: 12 }]}>{label}</Text>
    </View>
  );
}

function RowCard({
  row,
  editable,
  onDecision,
  onCategory,
}: {
  row: ImportRow;
  editable: boolean;
  onDecision: (d: ImportRowDecision) => void;
  onCategory: () => void;
}) {
  const included = row.decision === 'INCLUDE';
  return (
    <View style={[styles.row, !included && { opacity: 0.6 }]}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
            {row.merchantName ?? row.rawDescription ?? 'Unknown'}
          </Text>
          <Text style={type.small}>
            {formatDay(row.date)} · {TYPE_LABELS[row.type]}
          </Text>
        </View>
        <Amount paise={row.amountPaise} flow={row.flow} />
      </View>
      <View style={styles.tags}>
        {row.decision === 'DUPLICATE' ? <Tag label="Marked duplicate" tone="bad" /> : null}
        {row.decision === 'EXCLUDE' ? <Tag label="Left out" /> : null}
        {row.duplicateReason && row.decision !== 'DUPLICATE' ? (
          <Tag label="Possible duplicate" tone="bad" />
        ) : null}
      </View>
      {row.duplicateReason ? <Text style={type.small}>{row.duplicateReason}</Text> : null}
      {row.warnings.map((w) => (
        <Text key={w} style={[type.small, { color: colors.warning }]}>
          {w}
        </Text>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Change the category"
        disabled={!editable}
        onPress={onCategory}
        style={styles.category}
      >
        <Text style={[type.small, { color: row.category ? colors.textSoft : colors.warning }]}>
          {row.category?.name || 'Uncategorised'}
        </Text>
        {editable ? (
          <Text style={[type.small, { color: colors.primary, fontWeight: '600' }]}>Change</Text>
        ) : null}
      </Pressable>
      {editable ? (
        <View style={styles.actions}>
          <Button
            label={included ? 'Leave out' : 'Include'}
            variant="secondary"
            style={styles.action}
            onPress={() => onDecision(included ? 'EXCLUDE' : 'INCLUDE')}
          />
          {row.decision !== 'DUPLICATE' ? (
            <Button
              label="Duplicate"
              variant="secondary"
              style={styles.action}
              onPress={() => onDecision('DUPLICATE')}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 10 },
  stat: { width: '50%' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  category: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    minHeight: 36,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 40 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
