import { router, type Href } from 'expo-router';
import { ChevronRight, FileUp, LogOut, Settings, Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Card, Screen } from '@/components/ui';
import { colors, type } from '@/lib/theme';

export function MoreScreen() {
  const { user, logout } = useAuth();
  return (
    <Screen title="More">
      <Card>
        <Text style={type.heading}>{user?.name}</Text>
        <Text style={type.small}>{user?.email}</Text>
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Item
          href="/imports"
          icon={<FileUp size={20} color={colors.primary} />}
          title="Import a statement"
          detail="Google Pay PDF, bank CSV or Excel, and your import history"
        />
        <Item
          href="/assistant"
          icon={<Sparkles size={20} color={colors.primary} />}
          title="MoneyLens AI"
          detail="Ask why your spending changed or where you could save"
        />
        <Item
          href="/settings"
          icon={<Settings size={20} color={colors.primary} />}
          title="Settings and privacy"
          detail="Delete your data or your account"
          last
        />
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => void logout()}
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
      >
        <LogOut size={18} color={colors.negative} />
        <Text style={{ color: colors.negative, fontWeight: '600', fontSize: 16 }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

function Item({
  href,
  icon,
  title,
  detail,
  last,
}: {
  href: Href;
  icon: ReactNode;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.item, !last && styles.divider, pressed && { opacity: 0.6 }]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>{title}</Text>
        <Text style={type.small}>{detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.ink[300]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
  },
});
