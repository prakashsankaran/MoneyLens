import { Sparkles } from 'lucide-react';
import { Card } from '../../../components/Card';

/**
 * The AI Money Brief arrives with the AI assistant (phase 6). Until then this
 * card says so plainly instead of showing invented text.
 */
export function MoneyBriefCard() {
  return (
    <Card title="AI Money Brief">
      <div className="flex gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-ink-300" aria-hidden="true" />
        <p className="text-sm text-ink-500">
          Not available yet. When it arrives, the brief will summarise only the calculated figures
          on this page and will be labelled as AI interpretation.
        </p>
      </div>
    </Card>
  );
}
