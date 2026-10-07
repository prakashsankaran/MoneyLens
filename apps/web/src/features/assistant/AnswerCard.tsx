import { ANSWER_STATUS_NOTE, textBlocks } from '@moneylens/shared';
import type { AssistantAnswer } from '@moneylens/types';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';

/** Paragraphs and simple "- " lists from model text, rendered as plain text. */
export function PlainText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {textBlocks(text).map((block, i) =>
        block.kind === 'list' ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block.text}</p>
        ),
      )}
    </div>
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
  if (!answer || answer.status === 'refused') {
    return <p className="text-sm">{content}</p>;
  }
  const note = ANSWER_STATUS_NOTE[answer.status];
  return (
    <div className="space-y-4 text-sm">
      {answer.interpretation ? (
        <section aria-label="MoneyLens AI answer">
          <div className="mb-2 flex items-center gap-2">
            <ProvenanceBadge kind="AI_INTERPRETATION" />
            {answer.regenerated && (
              <span className="text-xs text-ink-500">Rewritten once to match your figures</span>
            )}
          </div>
          <PlainText text={answer.interpretation} />
        </section>
      ) : (
        note && (
          <p role="status" className="rounded-xl bg-ink-100/60 p-3 text-ink-700">
            {note}
          </p>
        )
      )}

      {answer.dataLimitations.length > 0 && (
        <ul aria-label="Data limitations" className="space-y-1 text-xs text-warning">
          {answer.dataLimitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      {answer.facts.length > 0 && (
        <details
          className="group rounded-xl border border-ink-200/70 p-3"
          open={!answer.interpretation}
        >
          <summary className="cursor-pointer text-xs font-medium text-ink-700">
            The figures behind this answer ({answer.facts.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {answer.facts.map((f) => (
              <li key={f.text} className="flex flex-wrap items-start gap-2">
                <ProvenanceBadge kind={f.kind} />
                <span className="min-w-0 flex-1">{f.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {answer.interpretation && (
        <p className="text-xs text-ink-500">
          Every amount and percentage in the answer was checked against your calculated figures.
          Educational information, not professional financial advice.
        </p>
      )}
    </div>
  );
}
