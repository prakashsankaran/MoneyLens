import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ANSWER_STATUS_NOTE, textBlocks } from '@moneylens/shared';
import type { AssistantAnswer } from '@moneylens/types';
import { ProvenanceBadge } from '@/components/ui';
import { colors, radii, type } from '@/lib/theme';

/** Model text as plain paragraphs and lists; never rendered as markup. */
export function PlainText({ text }: { text: string }) {
  return (
    <View style={{ gap: 8 }}>
      {textBlocks(text).map((block, i) =>
        block.kind === 'list' ? (
          <View key={i} style={{ gap: 4 }}>
            {block.items.map((item, j) => (
              <Text key={j} style={type.body}>
                • {item}
              </Text>
            ))}
          </View>
        ) : (
          <Text key={i} style={type.body}>
            {block.text}
          </Text>
        ),
      )}
    </View>
  );
}

/** One MoneyLens AI reply: the AI text, kept apart from the figures it was written from. */
export function AnswerCard({
  content,
  answer,
}: {
  content: string;
  answer: AssistantAnswer | null;
}) {
  const [showFacts, setShowFacts] = useState(!answer?.interpretation);
  if (!answer || answer.status === 'refused') return <Text style={type.body}>{content}</Text>;
  const note = ANSWER_STATUS_NOTE[answer.status];
  return (
    <View style={{ gap: 12 }}>
      {answer.interpretation ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ProvenanceBadge kind="AI_INTERPRETATION" />
            {answer.regenerated ? (
              <Text style={type.small}>Rewritten once to match your figures</Text>
            ) : null}
          </View>
          <PlainText text={answer.interpretation} />
        </View>
      ) : note ? (
        <Text
          style={[
            type.small,
            {
              color: colors.textSoft,
              backgroundColor: colors.ink[100],
              padding: 10,
              borderRadius: radii.md,
            },
          ]}
        >
          {note}
        </Text>
      ) : null}

      {answer.dataLimitations.map((l) => (
        <Text key={l} style={[type.small, { color: colors.warning }]}>
          {l}
        </Text>
      ))}

      {answer.facts.length > 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radii.md,
            padding: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showFacts }}
            onPress={() => setShowFacts((v) => !v)}
          >
            <Text style={[type.small, { fontWeight: '600', color: colors.textSoft }]}>
              {showFacts ? '▾' : '▸'} The figures behind this answer ({answer.facts.length})
            </Text>
          </Pressable>
          {showFacts ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              {answer.facts.map((f) => (
                <View key={f.text} style={{ gap: 4 }}>
                  <ProvenanceBadge kind={f.kind} />
                  <Text style={type.small}>{f.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {answer.interpretation ? (
        <Text style={[type.small, { fontSize: 12 }]}>
          Every amount and percentage in the answer was checked against your calculated figures.
          Educational information, not professional financial advice.
        </Text>
      ) : null}
    </View>
  );
}
