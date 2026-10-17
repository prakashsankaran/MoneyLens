import { Check, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, radii, spacing, type } from '@/lib/theme';

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * A recovery key, shown the one time it exists in readable form. `onDone`
 * is offered once the owner says they have saved it.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  doneLabel = 'Continue',
  onDone,
}: {
  recoveryKey: string;
  doneLabel?: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const share = () =>
    void Share.share({ message: `MoneyLens recovery key: ${recoveryKey}` }).catch(() => undefined);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.keyBox}>
        <Text style={styles.keyLabel}>YOUR RECOVERY KEY</Text>
        <Text selectable style={styles.key} accessibilityLabel={`Recovery key ${recoveryKey}`}>
          {/* Split after the third group, so the key never wraps mid-group. */}
          {`${recoveryKey.slice(0, 15)}\n${recoveryKey.slice(15)}`}
        </Text>
      </View>
      <Text style={type.body}>
        If you ever forget your password, this key lets you set a new one. It is shown only now, so
        save it in a password manager or notes, or write it down.
      </Text>
      <Button
        label="Share or save"
        variant="secondary"
        icon={<Share2 size={18} color={colors.text} />}
        onPress={share}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: saved }}
        accessibilityLabel="I have saved my recovery key"
        onPress={() => setSaved((v) => !v)}
        style={styles.check}
      >
        <View style={[styles.box, saved && styles.boxOn]}>
          {saved ? <Check size={14} color="#ffffff" /> : null}
        </View>
        <Text style={type.body}>I have saved my recovery key</Text>
      </Pressable>
      <Button label={doneLabel} disabled={!saved} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  keyBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brand[100],
    backgroundColor: colors.brand[50],
    padding: spacing.md,
    alignItems: 'center',
    gap: 8,
  },
  keyLabel: { ...type.small, fontWeight: '700', letterSpacing: 0.8, color: colors.primary },
  key: {
    fontFamily: mono,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.text,
    textAlign: 'center',
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
