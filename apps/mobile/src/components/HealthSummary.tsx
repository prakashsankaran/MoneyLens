import { StyleSheet, Text, View } from 'react-native';
import { TONE_LABEL, toneForScore } from '@moneylens/shared';
import type { HealthScore } from '@moneylens/types';
import { colors, toneColour, type } from '@/lib/theme';
import { ScoreRing } from './charts';

/** The explainable health score: the ring, then each component with its working. */
export function HealthSummary({
  health,
  detailed = false,
}: {
  health: HealthScore;
  detailed?: boolean;
}) {
  const tone = toneForScore(health.score);
  const components = health.components.filter((c) => detailed || c.weight > 0);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: 'center' }}>
        <ScoreRing value={health.score} tone={tone} size={132} thickness={12}>
          <Text style={{ fontSize: 34, fontWeight: '700', color: colors.text }}>
            {health.score === null ? '–' : health.score}
          </Text>
          <Text style={type.small}>out of 100</Text>
        </ScoreRing>
        <Text style={[styles.tone, { color: toneColour[tone] }]}>{TONE_LABEL[tone]}</Text>
      </View>
      {components.map((c) => {
        const ctone = toneForScore(c.score);
        return (
          <View key={c.key}>
            <View style={styles.row}>
              <Text style={[type.body, { flex: 1, color: colors.textSoft }]}>{c.label}</Text>
              <Text style={[type.body, { fontWeight: '600' }]}>
                {c.score === null ? 'Not scored' : c.score}
              </Text>
            </View>
            <View style={styles.track}>
              {c.score !== null ? (
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.max(c.score, 2)}%`,
                      backgroundColor: ctone === 'fair' ? '#f59e0b' : toneColour[ctone],
                    },
                  ]}
                />
              ) : null}
            </View>
            {detailed ? (
              <Text style={[type.small, { marginTop: 4 }]}>
                {c.score === null ? c.unavailableReason : `${c.measured ?? ''} · ${c.formula}`}
              </Text>
            ) : null}
          </View>
        );
      })}
      {detailed ? <Text style={type.small}>{health.method}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tone: { marginTop: 8, fontWeight: '600', fontSize: 15 },
  row: { flexDirection: 'row', gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.ink[100], marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
});
