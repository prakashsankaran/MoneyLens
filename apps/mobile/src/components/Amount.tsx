import { Text, type TextStyle } from 'react-native';
import { formatINR } from '@moneylens/shared';
import type { TransactionFlow } from '@moneylens/types';
import { colors } from '@/lib/theme';

/** Money in is green with a plus; money out is plain with a minus. */
export function Amount({
  paise,
  flow,
  style,
}: {
  paise: number;
  flow: TransactionFlow;
  style?: TextStyle;
}) {
  const incoming = flow === 'IN';
  return (
    <Text
      accessibilityLabel={`${incoming ? 'Received' : 'Paid'} ${formatINR(paise, { exact: true })}`}
      style={[{ fontWeight: '600', color: incoming ? colors.positive : colors.text }, style]}
    >
      {incoming ? '+' : '−'}
      {formatINR(paise, { exact: true })}
    </Text>
  );
}
