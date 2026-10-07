import { Link } from 'react-router';
import { Card } from '../../../components/Card';
import { ProvenanceBadge } from '../../../components/ProvenanceBadge';
import { PlainText } from '../../assistant/AnswerCard';
import { useMoneyBrief } from '../../assistant/useAssistant';

/**
 * The AI Money Brief: a short summary written by MoneyLens AI from the
 * calculated figures on this page, which are listed with it. Without a
 * configured provider it shows the figures and says why there is no text.
 */
export function MoneyBriefCard({ month }: { month: string }) {
  const brief = useMoneyBrief(month);
  return (
    <Card
      title="AI Money Brief"
      action={brief.data?.text ? <ProvenanceBadge kind="AI_INTERPRETATION" /> : undefined}
    >
      {brief.isPending ? (
        <p className="text-sm text-ink-500">Writing your brief…</p>
      ) : brief.isError ? (
        <p className="text-sm text-ink-500">The brief could not be loaded. {brief.error.message}</p>
      ) : (
        <div className="space-y-3 text-sm">
          {brief.data.text ? (
            <PlainText text={brief.data.text} />
          ) : (
            <p className="text-ink-500">
              {brief.data.facts.length === 0
                ? 'There are no figures to summarise for this month yet.'
                : brief.data.status === 'not-configured'
                  ? 'MoneyLens AI is not set up on this server, so here are the figures the brief would be written from.'
                  : 'A written brief is not available right now. These are the figures it is written from.'}
            </p>
          )}
          {brief.data.facts.length > 0 && (
            <details open={!brief.data.text} className="rounded-xl border border-ink-200/70 p-3">
              <summary className="cursor-pointer text-xs font-medium text-ink-700">
                Written from these figures
              </summary>
              <ul className="mt-2 space-y-2">
                {brief.data.facts.map((f) => (
                  <li key={f.text} className="flex flex-wrap items-start gap-2">
                    <ProvenanceBadge kind={f.kind} />
                    <span className="min-w-0 flex-1">{f.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Link
            to="/assistant"
            className="inline-block font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
          >
            Ask MoneyLens AI a question
          </Link>
        </div>
      )}
    </Card>
  );
}
