import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, type } from '@/lib/theme';

/** Shared frame for the sign-in and registration screens. */
export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>₹</Text>
            </View>
            <Text style={styles.brandName}>MoneyLens</Text>
          </View>
          <Text accessibilityRole="header" style={type.title}>
            {title}
          </Text>
          <Text style={[type.body, { color: colors.textMuted, marginTop: 4 }]}>{subtitle}</Text>
          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingTop: spacing.xl * 1.5, flexGrow: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.xl },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  brandName: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  form: { marginTop: spacing.lg, gap: spacing.md },
});
