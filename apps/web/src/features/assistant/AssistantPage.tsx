import { useEffect, useRef, useState } from 'react';
import { LuPlus, LuSend, LuTrash2 } from 'react-icons/lu';
import { formatMonthKey } from '@moneylens/shared';
import { ASSISTANT_MESSAGE_MAX } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorCard, PageHeader } from '../../components/PageHeader';
import { formatDayTime } from '../../lib/format';
import { AnswerCard } from './AnswerCard';
import { EXAMPLE_QUESTIONS } from './examples';
import {
  useAssistantStatus,
  useChat,
  useConversation,
  useConversations,
  useDeleteConversation,
} from './useAssistant';

export function AssistantPage() {
  const status = useAssistantStatus();
  const conversations = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const conversation = useConversation(activeId);
  const chat = useChat();
  const remove = useDeleteConversation();
  const [draft, setDraft] = useState('');
  // '' means the latest month with data, which the server picks.
  const [month, setMonth] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = activeId ? (conversation.data?.messages ?? []) : [];
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, pendingQuestion]);

  const ask = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending) return;
    setPendingQuestion(message);
    chat.mutate(
      {
        message,
        ...(activeId ? { conversationId: activeId } : {}),
        ...(month ? { month } : {}),
      },
      {
        onSuccess: (data) => {
          setActiveId(data.conversation.id);
          setDraft('');
        },
        onSettled: () => setPendingQuestion(null),
      },
    );
  };

  const list = conversations.data ?? [];
  const [latestMonth, ...earlierMonths] = [...(status.data?.availableMonths ?? [])].reverse();
  const limitReached =
    status.data !== undefined && status.data.messagesToday >= status.data.dailyMessageLimit;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
      <PageHeader
        title="MoneyLens AI"
        description="Ask about your money. Answers are written from your calculated figures, and the figures are shown with every answer."
        actions={
          <>
            {list.length > 0 && (
              <label className="lg:hidden">
                <span className="sr-only">Conversation</span>
                <select
                  value={activeId ?? ''}
                  onChange={(e) => setActiveId(e.target.value || null)}
                  className="h-11 max-w-56 rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
                >
                  <option value="">New conversation</option>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="button" variant="secondary" onClick={() => setActiveId(null)}>
              <LuPlus className="size-4" aria-hidden />
              New conversation
            </Button>
          </>
        }
      />

      {status.data && !status.data.configured && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-warning/40 bg-surface p-4 text-sm text-ink-700"
        >
          MoneyLens AI is not set up on this server yet. You can still ask questions: you will get
          the calculated figures for each one, without a written explanation. To turn it on, set
          AI_PROVIDER and AI_API_KEY in the API&apos;s environment.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-label="Conversations" className="hidden lg:block">
          <h2 className="text-sm font-semibold">Conversations</h2>
          {list.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">Your questions will appear here.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {list.map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    aria-current={c.id === activeId ? 'true' : undefined}
                    className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm transition-all duration-200 ${
                      c.id === activeId
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
                    }`}
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete conversation: ${c.title}`}
                    onClick={() =>
                      remove.mutate(c.id, {
                        onSuccess: () => c.id === activeId && setActiveId(null),
                      })
                    }
                    className="rounded-xl p-2 text-ink-500 hover:bg-ink-100 hover:text-negative transition-all duration-200"
                  >
                    <LuTrash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <Card className="flex min-h-[28rem] flex-col">
          {conversation.isError && activeId && (
            <ErrorCard
              message={conversation.error.message}
              onRetry={() => void conversation.refetch()}
            />
          )}

          {messages.length === 0 && !pendingQuestion ? (
            <div className="flex-1">
              <h2 className="text-base font-semibold">What would you like to know?</h2>
              <p className="mt-1 text-sm text-ink-500">Try one of these, or ask your own.</p>
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Example questions">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={chat.isPending || limitReached}
                    onClick={() => ask(q)}
                    className="rounded-xl border border-ink-200 px-3.5 py-2 text-left text-sm hover:bg-ink-50 disabled:opacity-50 bg-surface shadow-card transition-all duration-200 hover:border-ink-300 active:scale-[0.98]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol aria-label="Messages" className="flex-1 space-y-5">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <li key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white">
                      {m.content}
                    </p>
                  </li>
                ) : (
                  <li key={m.id} aria-label="MoneyLens AI reply">
                    <p className="mb-1 text-xs font-medium text-ink-500">
                      MoneyLens AI · {formatDayTime(m.createdAt)}
                    </p>
                    <AnswerCard content={m.content} answer={m.answer} />
                  </li>
                ),
              )}
              {pendingQuestion && (
                <>
                  <li className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-700/80 px-4 py-2 text-sm text-white">
                      {pendingQuestion}
                    </p>
                  </li>
                  <li role="status" className="text-sm text-ink-500">
                    Working out your figures…
                  </li>
                </>
              )}
            </ol>
          )}
          <div ref={endRef} />

          <form
            className="mt-6 border-t border-ink-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            {latestMonth && earlierMonths.length > 0 && (
              <label className="mb-3 flex items-center gap-2 text-sm text-ink-500">
                <span>Answer about</span>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 rounded-lg border border-ink-200 bg-surface px-2 text-sm text-ink-900 transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
                >
                  <option value="">Latest month ({formatMonthKey(latestMonth)})</option>
                  {earlierMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthKey(m)}
                    </option>
                  ))}
                </select>
                <span className="hidden sm:inline">or name a month in your question</span>
              </label>
            )}
            <label htmlFor="assistant-question" className="sr-only">
              Ask MoneyLens AI
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="assistant-question"
                rows={2}
                maxLength={ASSISTANT_MESSAGE_MAX}
                value={draft}
                placeholder="Ask about your spending, saving or recurring payments"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                className="min-h-11 flex-1 resize-none rounded-lg border border-ink-300 bg-surface px-3 py-2 text-sm"
              />
              <Button
                type="submit"
                aria-label="Send"
                disabled={!draft.trim() || chat.isPending || limitReached}
              >
                <LuSend className="size-4" aria-hidden />
              </Button>
            </div>
            {chat.isError && (
              <p role="alert" className="mt-2 text-sm text-negative">
                {chat.error.message}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-500">
              MoneyLens AI sees calculated totals only, never your statements, UPI IDs or account
              numbers. Never share your UPI PIN, passwords or OTPs.
              {status.data &&
                ` ${status.data.messagesToday} of ${status.data.dailyMessageLimit} questions used in the last 24 hours.`}
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
