import { Check, X } from 'lucide-react-native';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryNode } from '@moneylens/types';
import { useCategories } from '@/lib/queries';
import { colors, type } from '@/lib/theme';
import { ErrorState, Loading } from './ui';
import { errorMessage } from '@/lib/api';

interface Option {
  id: string | null;
  label: string;
  child: boolean;
}

function flatten(nodes: CategoryNode[]): Option[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: n.name, child: false },
    ...n.children.map((c) => ({ id: c.id, label: c.name, child: true })),
  ]);
}

/** A full-screen list of categories and their subcategories. */
export function CategoryPicker({
  visible,
  title,
  selectedId,
  noneLabel,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  selectedId: string | null;
  /** Shown as the first option, selecting null (e.g. "All categories"). */
  noneLabel: string;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const categories = useCategories();
  const options: Option[] = [
    { id: null, label: noneLabel, child: false },
    ...flatten(categories.data ?? []),
  ];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[type.heading, { flex: 1 }]}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={10}
          >
            <X color={colors.text} size={24} />
          </Pressable>
        </View>
        {categories.isPending ? (
          <Loading />
        ) : categories.isError ? (
          <View style={{ padding: 16 }}>
            <ErrorState
              message={errorMessage(categories.error)}
              onRetry={() => void categories.refetch()}
            />
          </View>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(o) => o.id ?? 'none'}
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item.id)}
                  style={({ pressed }) => [
                    styles.option,
                    item.child && { paddingLeft: 36 },
                    pressed && { backgroundColor: colors.ink[100] },
                  ]}
                >
                  <Text style={[type.body, { flex: 1 }, !item.child && { fontWeight: '600' }]}>
                    {item.label}
                  </Text>
                  {selected ? <Check color={colors.primary} size={20} /> : null}
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
