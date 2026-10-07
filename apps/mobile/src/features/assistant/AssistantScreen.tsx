import { Stack } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EXAMPLE_QUESTIONS } from '@moneylens/shared';
import { ASSISTANT_MESSAGE_MAX } from '@moneylens/validation';
import { errorMessage } from '@/lib/api';
import { useAssistantStatus, useChat, useConversation } from '@/lib/queries';
import { colors, radii, type } from '@/lib/theme';
import { AnswerCard } from './AnswerCard';

export function AssistantScreen() {
  const status = useAssistantStatus();
  const chat = useChat();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversation = useConversation(conversationId);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const messages = conversationId ? (conversation.data?.messages ?? []) : [];
  const limitReached =
    status.data !== undefined && status.data.messagesToday >= status.data.dailyMessageLimit;

  const ask = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending || limitReached) return;
    setPending(message);
    chat.mutate(
      { message, ...(conversationId ? { conversationId } : {}) },
      {
        onSuccess: (data) => {
          setConversationId(data.conversation.id);
          setDraft('');
        },
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Stack.Screen
        options={{
          headerRight: () =>
            conversationId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setConversationId(null)}
                hitSlop={8}
              >
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 16 }}>New</Text>
              </Pressable>
            ) : null,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {status.data && !status.data.configured ? (
            <Text style={styles.notice}>
              MoneyLens AI is not set up on this server yet. You can still ask: each answer shows
              the calculated figures, without a written explanation.
            </Text>
          ) : null}

          {messages.length === 0 && !pending ? (
            <View style={{ gap: 10 }}>
              <Text accessibilityRole="header" style={type.heading}>
                What would you like to know?
              </Text>
              <Text style={type.small}>
                Answers are written from your calculated figures, shown with every answer.
              </Text>
              <View accessibilityLabel="Example questions" style={styles.examples}>
                {EXAMPLE_QUESTIONS.map((q) => (
                  <Pressable
                    key={q}
                    accessibilityRole="button"
                    disabled={chat.isPending || limitReached}
                    onPress={() => ask(q)}
                    style={({ pressed }) => [
                      styles.example,
                      pressed && { backgroundColor: colors.ink[100] },
                    ]}
                  >
                    <Text style={[type.small, { color: colors.text }]}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={styles.mine}>
                <Text style={{ color: '#fff', fontSize: 15 }}>{m.content}</Text>
              </View>
            ) : (
              <View key={m.id} style={styles.reply} accessibilityLabel="MoneyLens AI reply">
                <AnswerCard content={m.content} answer={m.answer} />
              </View>
            ),
          )}
          {pending ? (
            <>
              <View style={[styles.mine, { opacity: 0.8 }]}>
                <Text style={{ color: '#fff', fontSize: 15 }}>{pending}</Text>
              </View>
              <Text accessibilityLiveRegion="polite" style={type.small}>
                Working out your figures…
              </Text>
            </>
          ) : null}
          {chat.isError ? (
            <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
              {errorMessage(chat.error)}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Ask MoneyLens AI"
              placeholder="Ask about your spending or saving"
              placeholderTextColor={colors.ink[300]}
              value={draft}
              onChangeText={setDraft}
              maxLength={ASSISTANT_MESSAGE_MAX}
              multiline
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!draft.trim() || chat.isPending || limitReached}
              onPress={() => ask(draft)}
              style={[
                styles.send,
                (!draft.trim() || chat.isPending || limitReached) && { opacity: 0.4 },
              ]}
            >
              <Send size={20} color="#fff" />
            </Pressable>
          </View>
          <Text style={[type.small, { fontSize: 11.5 }]}>
            MoneyLens AI sees calculated totals only, never your statements or account numbers.
            Never share your UPI PIN, passwords or OTPs.
            {status.data
              ? ` ${status.data.messagesToday} of ${status.data.dailyMessageLimit} questions used in the last 24 hours.`
              : ''}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  notice: {
    ...type.small,
    color: colors.textSoft,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 12,
  },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  example: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.primary,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reply: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 6,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
