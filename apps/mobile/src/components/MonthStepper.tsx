import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMonthKey } from '@moneylens/shared';
import { colors, radii } from '@/lib/theme';

/** Step through the months that have data: older on the left, newer on the right. */
export function MonthStepper({
  month,
  months,
  onChange,
}: {
  month: string;
  /** Oldest first, as the API returns them. */
  months: string[];
  onChange: (month: string) => void;
}) {
  const index = months.indexOf(month);
  const older = index > 0 ? months[index - 1] : undefined;
  const newer = index >= 0 && index < months.length - 1 ? months[index + 1] : undefined;
  return (
    <View style={styles.wrap}>
      <StepButton
        label={older ? `Show ${formatMonthKey(older)}` : 'No earlier month'}
        disabled={!older}
        onPress={() => older && onChange(older)}
      >
        <ChevronLeft size={20} color={older ? colors.text : colors.ink[300]} />
      </StepButton>
      <Text style={styles.label} accessibilityLiveRegion="polite">
        {formatMonthKey(month, { short: true })} {month.slice(0, 4)}
      </Text>
      <StepButton
        label={newer ? `Show ${formatMonthKey(newer)}` : 'No later month'}
        disabled={!newer}
        onPress={() => newer && onChange(newer)}
      >
        <ChevronRight size={20} color={newer ? colors.text : colors.ink[300]} />
      </StepButton>
    </View>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={styles.step}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  step: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, minWidth: 64, textAlign: 'center' },
});
