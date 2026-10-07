import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { formatINR, formatMonthKey, type ScoreTone } from '@moneylens/shared';
import type { MonthlyTrendPoint } from '@moneylens/types';
import { colors, seriesColour, toneColour, type } from '@/lib/theme';

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * A donut with the headline figure in the hole. Slices are drawn as thick
 * arcs with a small gap; a labelled legend always sits beside it, so colour
 * is never the only cue.
 */
export function Donut({
  slices,
  size = 180,
  thickness = 22,
  label,
  children,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  label: string;
  children: ReactNode;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const gap = slices.length > 1 ? 0.02 : 0;
  let angle = -Math.PI / 2;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={colors.ink[100]} strokeWidth={thickness} fill="none" />
        {total > 0 &&
          slices.map((s) => {
            const sweep = (s.value / total) * Math.PI * 2;
            const start = angle + gap / 2;
            const end = angle + sweep - gap / 2;
            angle += sweep;
            if (sweep >= Math.PI * 2 - 0.001) {
              return (
                <Circle
                  key={s.key}
                  cx={c}
                  cy={c}
                  r={r}
                  stroke={s.color}
                  strokeWidth={thickness}
                  fill="none"
                />
              );
            }
            if (end <= start) return null;
            return (
              <Path
                key={s.key}
                d={arcPath(c, c, r, start, end)}
                stroke={s.color}
                strokeWidth={thickness}
                fill="none"
              />
            );
          })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>{children}</View>
    </View>
  );
}

/** A 0–100 progress ring. The value is always written in the centre too. */
export function ScoreRing({
  value,
  tone,
  size = 112,
  thickness = 10,
  children,
}: {
  value: number | null;
  tone: ScoreTone;
  size?: number;
  thickness?: number;
  children: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const filled = value === null ? 0 : Math.min(100, Math.max(0, value)) / 100;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={c} cy={c} r={r} stroke={colors.ink[100]} strokeWidth={thickness} fill="none" />
        {filled > 0 && (
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={tone === 'fair' ? '#f59e0b' : toneColour[tone]}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${circumference * filled} ${circumference}`}
            fill="none"
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>{children}</View>
    </View>
  );
}

/** Ranked horizontal bars: name and amount above, bar below. */
export function BarList({
  rows,
}: {
  rows: { key: string; label: string; value: number; detail?: string; color?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r) => (
        <View key={r.key}>
          <View style={styles.barHead}>
            {r.color ? <View style={[styles.dot, { backgroundColor: r.color }]} /> : null}
            <Text numberOfLines={1} style={[type.body, styles.barLabel]}>
              {r.label}
            </Text>
            <Text style={[type.body, { fontWeight: '600' }]}>{formatINR(r.value)}</Text>
            {r.detail ? <Text style={[type.small, styles.barDetail]}>{r.detail}</Text> : null}
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max((r.value / max) * 100, 1)}%`,
                  backgroundColor: r.color ?? colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Income and spending side by side for each month, newest on the right. */
export function TrendColumns({
  trend,
  height = 140,
}: {
  trend: MonthlyTrendPoint[];
  height?: number;
}) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.incomePaise, t.spendingPaise]));
  const label = trend
    .map(
      (t) =>
        `${formatMonthKey(t.month)}: income ${formatINR(t.incomePaise)}, spending ${formatINR(t.spendingPaise)}`,
    )
    .join('; ');
  return (
    <View>
      <View style={styles.legend}>
        <Legend colour={seriesColour.income} label="Income" />
        <Legend colour={seriesColour.spending} label="Spending" />
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[styles.columns, { height }]}
      >
        {trend.map((t) => (
          <View key={t.month} style={styles.column}>
            <View style={styles.pair}>
              <View
                style={[
                  styles.bar,
                  { height: (t.incomePaise / max) * height, backgroundColor: seriesColour.income },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  {
                    height: (t.spendingPaise / max) * height,
                    backgroundColor: seriesColour.spending,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {trend.map((t) => (
          <View key={t.month} style={styles.column}>
            <Text style={[type.small, { fontSize: 11 }]}>
              {formatMonthKey(t.month, { short: true })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

/** A thin progress bar for budgets: green, amber near the limit, red over it. */
export function ProgressBar({ pct, status }: { pct: number; status: 'under' | 'near' | 'over' }) {
  const colour =
    status === 'over' ? colors.negative : status === 'near' ? '#f59e0b' : colors.positive;
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${Math.min(100, Math.max(pct, 1))}%`, backgroundColor: colour },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { flex: 1, fontWeight: '500' },
  barDetail: { width: 38, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.ink[100], marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  columns: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center' },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 12, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 },
  axis: { flexDirection: 'row', marginTop: 6 },
});
