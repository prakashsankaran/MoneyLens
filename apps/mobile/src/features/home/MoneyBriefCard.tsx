import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, ProvenanceBadge } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useMoneyBrief } from '@/lib/queries';
import { colors, type } from '@/lib/theme';

/**
 * The AI Money Brief: a short summary written from the calculated figures,
 * which are listed with it. Without an AI provider it shows the figures only.
 */
export function MoneyBriefCard({ month }: { month: string }) {
  const brief = useMoneyBrief(month);
  return (
    <Card
      title="AI Money Brief"
      action={brief.data?.text ? <ProvenanceBadge kind="AI_INTERPRETATION" /> : undefined}
    >
      {brief.isPending ? (
        <Text style={type.small}>Writing your brief…</Text>
      ) : brief.isError ? (
        <Text style={type.small}>The brief could not be loaded. {errorMessage(brief.error)}</Text>
      ) : (
        <View style={{ gap: 12 }}>
          {brief.data.text ? (
            <Text style={type.body}>{brief.data.text}</Text>
          ) : (
            <Text style={type.small}>
              {brief.data.facts.length === 0
                ? 'There are no figures to summarise for this month yet.'
                : brief.data.status === 'not-configured'
                  ? 'MoneyLens AI is not set up on this server, so here are the figures the brief would be written from.'
                  : 'A written brief is not available right now. These are the figures it is written from.'}
            </Text>
          )}
          {brief.data.facts.length > 0 ? (
            <View
              style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.ink[100], paddingTop: 12 }}
            >
              <Text style={type.label}>WRITTEN FROM THESE FIGURES</Text>
              {brief.data.facts.map((f) => (
                <View key={f.text} style={{ gap: 4 }}>
                  <ProvenanceBadge kind={f.kind} />
                  <Text style={[type.small, { color: colors.textSoft }]}>{f.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Button
            label="Ask MoneyLens AI a question"
            variant="secondary"
            onPress={() => router.push('/assistant')}
          />
        </View>
      )}
    </Card>
  );
}
