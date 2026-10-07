import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { formatDayTime, SOURCE_LABELS, TYPE_LABELS } from '@moneylens/shared';
import { Amount } from '@/components/Amount';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Button, Card, ErrorState, Loading, Row, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useTransaction, useUpdateTransaction } from '@/lib/queries';
import { colors, type } from '@/lib/theme';

export function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useTransaction(id);
  const update = useUpdateTransaction(id);
  const [picking, setPicking] = useState(false);
  const [applyToMerchant, setApplyToMerchant] = useState(true);
  const [notes, setNotes] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (tx.isPending) return <Loading />;
  if (tx.isError) {
    return (
      <Screen edges={[]}>
        <ErrorState message={errorMessage(tx.error)} onRetry={() => void tx.refetch()} />
      </Screen>
    );
  }
  const t = tx.data;
  const name = t.merchantName ?? t.description ?? 'Unknown';
  const categoryId = t.subcategory?.id ?? t.category?.id ?? null;
  const categoryLabel = t.subcategory
    ? `${t.category?.name ?? ''} › ${t.subcategory.name}`
    : (t.category?.name ?? 'Uncategorised');

  const changeCategory = (id: string | null) => {
    setPicking(false);
    setMessage(null);
    update.mutate(
      { categoryId: id, ...(t.merchantId && id ? { applyToMerchant } : {}) },
      {
        onSuccess: (r) =>
          setMessage(
            r.alsoUpdated > 0
              ? `Category saved. ${r.alsoUpdated} other ${name} transactions were updated too.`
              : 'Category saved.',
          ),
      },
    );
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: name }} />
      <Card>
        <Amount paise={t.amountPaise} flow={t.flow} style={{ fontSize: 34, letterSpacing: -0.5 }} />
        <Text style={[type.heading, { marginTop: 4 }]}>{name}</Text>
        <Text style={type.small}>{formatDayTime(t.date)}</Text>
      </Card>

      <Card title="Category" subtitle="Corrections teach MoneyLens for future imports">
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Choose a different category"
          onPress={() => setPicking(true)}
          style={{
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 14,
            justifyContent: 'center',
          }}
        >
          <Text style={type.body}>{categoryLabel}</Text>
        </Pressable>
        {t.merchantId ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <Text style={[type.small, { flex: 1, color: colors.textSoft }]}>
              Also use this category for {name}&apos;s other and future transactions
            </Text>
            <Switch
              accessibilityLabel="Apply to the merchant's other transactions"
              value={applyToMerchant}
              onValueChange={setApplyToMerchant}
              trackColor={{ true: colors.brand[500], false: colors.ink[300] }}
              thumbColor="#ffffff"
            />
          </View>
        ) : null}
        {update.isPending ? <Text style={[type.small, { marginTop: 8 }]}>Saving…</Text> : null}
        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[type.small, { marginTop: 8, color: colors.positive }]}
          >
            {message}
          </Text>
        ) : null}
        {update.isError ? (
          <Text
            accessibilityRole="alert"
            style={[type.small, { marginTop: 8, color: colors.negative }]}
          >
            {errorMessage(update.error)}
          </Text>
        ) : null}
      </Card>

      <Card title="Details">
        <Row label="Type" value={TYPE_LABELS[t.type]} />
        {t.paymentMethod ? <Row label="Payment method" value={t.paymentMethod} /> : null}
        {t.upiIdMasked ? <Row label="UPI ID" value={t.upiIdMasked} /> : null}
        {t.referenceMasked ? <Row label="Reference" value={t.referenceMasked} /> : null}
        <Row label="Source" value={SOURCE_LABELS[t.source]} />
        {t.sourceFile ? <Row label="Statement" value={t.sourceFile.filename} /> : null}
        {t.description && t.description !== name ? (
          <Text style={[type.small, { marginTop: 8 }]}>{t.description}</Text>
        ) : null}
      </Card>

      <Card title="Notes">
        <TextField
          label="Your note"
          multiline
          maxLength={500}
          value={notes ?? t.notes ?? ''}
          onChangeText={setNotes}
          style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }}
        />
        <Button
          label="Save note"
          variant="secondary"
          style={{ marginTop: 12 }}
          disabled={notes === null || notes === (t.notes ?? '')}
          busy={update.isPending}
          onPress={() =>
            update.mutate(
              { notes: notes?.trim() ? notes.trim() : null },
              { onSuccess: () => setNotes(null) },
            )
          }
        />
      </Card>

      <CategoryPicker
        visible={picking}
        title="Choose a category"
        selectedId={categoryId}
        noneLabel="Uncategorised"
        onSelect={changeCategory}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
