import { router } from 'expo-router';
import { ChevronRight, Repeat, Search, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDay, formatINR } from '@moneylens/shared';
import type { TransactionItem } from '@moneylens/types';
import { Amount } from '@/components/Amount';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ErrorState, Loading, Segmented } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCategories, useTransactionPages, type TransactionFilters } from '@/lib/queries';
import { colors, radii, type } from '@/lib/theme';

type Direction = 'all' | 'OUT' | 'IN';

export function TransactionsScreen() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<Direction>('all');
  const [recurring, setRecurring] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const categories = useCategories();

  // Search once typing pauses rather than on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo<TransactionFilters>(
    () => ({
      ...(q ? { q } : {}),
      ...(direction !== 'all' ? { flow: direction } : {}),
      ...(recurring ? { recurring: 'true' as const } : {}),
      ...(categoryId ? { categoryId } : {}),
    }),
    [q, direction, recurring, categoryId],
  );
  const pages = useTransactionPages(filters);
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const first = pages.data?.pages[0];
  const categoryName = useMemo(() => {
    for (const c of categories.data ?? []) {
      if (c.id === categoryId) return c.name;
      const child = c.children.find((k) => k.id === categoryId);
      if (child) return child.name;
    }
    return null;
  }, [categories.data, categoryId]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={styles.top}>
        <Text accessibilityRole="header" style={type.title}>
          Transactions
        </Text>
        <View style={styles.search}>
          <Search size={18} color={colors.ink[500]} />
          <TextInput
            accessibilityLabel="Search transactions"
            placeholder="Search merchant or description"
            placeholderTextColor={colors.ink[300]}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'all', label: 'All' },
            { value: 'OUT', label: 'Money out' },
            { value: 'IN', label: 'Money in' },
          ]}
        />
        <View style={styles.chips}>
          <Chip
            label={categoryName ?? 'Any category'}
            active={!!categoryId}
            icon={
              <SlidersHorizontal size={14} color={categoryId ? colors.primary : colors.textSoft} />
            }
            onPress={() => setPicking(true)}
          />
          <Chip
            label="Recurring"
            active={recurring}
            icon={<Repeat size={14} color={recurring ? colors.primary : colors.textSoft} />}
            onPress={() => setRecurring((v) => !v)}
          />
        </View>
        {first ? (
          <Text style={type.small} accessibilityLiveRegion="polite">
            {first.total} transactions · {formatINR(first.summary.spendingPaise)} spent ·{' '}
            {formatINR(first.summary.incomePaise)} in
          </Text>
        ) : null}
      </View>

      {pages.isPending ? (
        <Loading />
      ) : pages.isError ? (
        <View style={{ padding: 16 }}>
          <ErrorState message={errorMessage(pages.error)} onRetry={() => void pages.refetch()} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TransactionRow item={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
          }}
          refreshing={pages.isRefetching && !pages.isFetchingNextPage}
          onRefresh={() => void pages.refetch()}
          ListEmptyComponent={
            <Text style={[type.small, { textAlign: 'center', marginTop: 32 }]}>
              No transactions match these filters.
            </Text>
          }
          ListFooterComponent={
            pages.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} /> : null
          }
        />
      )}

      <CategoryPicker
        visible={picking}
        title="Filter by category"
        selectedId={categoryId}
        noneLabel="Any category"
        onSelect={(id) => {
          setCategoryId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon}
      <Text numberOfLines={1} style={[styles.chipText, active && { color: colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TransactionRow({ item }: { item: TransactionItem }) {
  const name = item.merchantName ?? item.description ?? 'Unknown';
  const category = item.subcategory?.name ?? item.category?.name ?? 'Uncategorised';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the transaction"
      onPress={() => router.push(`/transaction/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.ink[100] }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={type.small}>
          {formatDay(item.date)} · {category}
          {item.isRecurring ? ' · Recurring' : ''}
        </Text>
      </View>
      <Amount paise={item.amountPaise} flow={item.flow} />
      <ChevronRight size={18} color={colors.ink[300]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { padding: 16, gap: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minHeight: 44, fontSize: 16, color: colors.text },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 220,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.brand[50] },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.textSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
