import { LuSparkles } from 'react-icons/lu';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FormField } from '../../components/FormField';
import type { DeviceAI } from '../../lib/device';

/**
 * In the Android app only: turn on written AI answers with the person's own
 * key. Everything else in the app works without it.
 */
export function DeviceAICard({ ai }: { ai: DeviceAI }) {
  const queryClient = useQueryClient();
  const [on, setOn] = useState(ai.hasKey());
  const [key, setKey] = useState('');

  const changed = (next: boolean) => {
    setOn(next);
    setKey('');
    // The assistant and the dashboard brief read whether AI is on.
    void queryClient.invalidateQueries();
  };
  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    ai.setKey(key);
    changed(true);
  };
  const onRemove = () => {
    ai.clearKey();
    changed(false);
  };

  return (
    <Card
      title="MoneyLens AI"
      icon={LuSparkles}
      description={
        on
          ? `Written answers and category suggestions are on, using your ${ai.service} key.`
          : 'Off. The assistant answers with calculated figures, and nothing leaves this phone.'
      }
    >
      <div className="space-y-3 text-sm text-ink-700">
        <p>
          To get written answers and category suggestions, add your own {ai.service} key. When you
          ask the assistant a question or open the dashboard brief, MoneyLens sends {ai.service} the
          question and that month&apos;s calculated figures, such as totals, category totals and top
          merchant names. When you ask for category suggestions while reviewing an import, it sends
          the uncategorised merchant names and one statement line for each, with UPI IDs and account
          numbers hidden, and never amounts or dates. Your statements, transactions, account and
          password always stay on this phone. The key is saved only on this phone.
        </p>
        {on ? (
          <Button variant="secondary" onClick={onRemove}>
            Remove key and turn AI off
          </Button>
        ) : (
          <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <FormField
              label={`${ai.service} API key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button type="submit" disabled={!key.trim()}>
              Turn on AI
            </Button>
            <p className="text-ink-500 sm:col-span-2">
              Get a free key at{' '}
              <a
                href={ai.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 underline"
              >
                Google AI Studio
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </Card>
  );
}
