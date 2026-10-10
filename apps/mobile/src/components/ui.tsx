import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DeltaTone, Delta } from '@moneylens/shared';
import type { ProvenanceKind } from '@moneylens/types';
import { colors, radii, shadow, spacing, type } from '@/lib/theme';

/** A scrolling page with the safe-area inset, a title and pull-to-refresh. */
export function Screen({
  title,
  subtitle,
  action,
  children,
  refreshing,
  onRefresh,
  edges = ['top'],
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {(title || action) && (
          <View style={styles.header}>
            <View style={styles.flex}>
              {subtitle ? <Text style={type.small}>{subtitle}</Text> : null}
              {title ? (
                <Text accessibilityRole="header" style={type.title}>
                  {title}
                </Text>
              ) : null}
            </View>
            {action}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      {(title || action) && (
        <View style={styles.cardHeader}>
          <View style={styles.flex}>
            {title ? (
              <Text accessibilityRole="header" style={type.heading}>
                {title}
              </Text>
            ) : null}
            {subtitle ? <Text style={[type.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        pressed && !inactive && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} /> : icon}
      <Text style={[styles.buttonText, { color: buttonText[variant] }]}>{label}</Text>
    </Pressable>
  );
}

const buttonStyles: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.negative },
  ghost: { backgroundColor: 'transparent' },
};
const buttonText: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: colors.text,
  danger: colors.negative,
  ghost: colors.primary,
};

export function TextField({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.small, { color: colors.textSoft, fontWeight: '500' }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.ink[300]}
        {...props}
        style={[styles.input, error ? { borderColor: colors.negative } : null, style]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={type.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centre} accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card title={title}>
      <Text style={type.small}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: 12 }} />
      ) : null}
    </Card>
  );
}

export function Empty({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <Card title={title}>
      <Text style={type.small}>{message}</Text>
      {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </Card>
  );
}

const DELTA_COLOURS: Record<DeltaTone, { bg: string; fg: string }> = {
  good: { bg: '#dcfce7', fg: colors.positive },
  bad: { bg: '#fee4e2', fg: colors.negative },
  neutral: { bg: colors.ink[100], fg: colors.ink[500] },
};

export function DeltaPill({ delta }: { delta: Delta }) {
  const c = DELTA_COLOURS[delta.tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{delta.text}</Text>
    </View>
  );
}

const PROVENANCE: Record<ProvenanceKind, { label: string; bg: string; fg: string }> = {
  FACT: { label: 'Fact', bg: colors.ink[100], fg: colors.ink[700] },
  CALCULATION: { label: 'Calculated', bg: colors.ink[100], fg: colors.ink[700] },
  OBSERVATION: { label: 'Observation', bg: colors.brand[50], fg: colors.brand[700] },
  AI_INTERPRETATION: { label: 'AI interpretation', bg: '#fffbeb', fg: colors.warning },
  RECOMMENDATION: { label: 'Suggestion', bg: '#f0f9ff', fg: '#075985' },
};

/** Says how a statement was produced, so AI text is never mistaken for fact. */
export function ProvenanceBadge({ kind }: { kind: ProvenanceKind }) {
  const meta = PROVENANCE[kind];
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Text style={[styles.pillText, styles.upper, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: DeltaTone }) {
  const c = DELTA_COLOURS[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentText, selected && { color: colors.text, fontWeight: '600' }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A label and value on one line, value right-aligned. */
export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[type.body, { color: colors.textSoft, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, strong && { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: 4 },
  flex: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  button: {
    minHeight: 48,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
  upper: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.ink[100],
    borderRadius: radii.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  segmentSelected: { backgroundColor: colors.surface, ...shadow },
  segmentText: { fontSize: 14, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
});
