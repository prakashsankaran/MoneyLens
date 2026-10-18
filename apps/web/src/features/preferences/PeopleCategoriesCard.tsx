import { LuUsers } from 'react-icons/lu';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { usePreferences, useUpdatePreferences } from './usePreferences';

/**
 * A category for UPI payments to and from people ("Paid to Arjun Mehta"),
 * which no merchant list can know. Used only when nothing else categorises
 * the payment, and given to earlier uncategorised ones when saved.
 */
export function PeopleCategoriesCard() {
  const prefs = usePreferences();
  const categories = useCategories();
  const update = useUpdatePreferences();
  // Unsaved choices; the saved ones show until the user picks something.
  const [draft, setDraft] = useState<{ out: string; inbound: string } | null>(null);
  const saved = prefs.data?.people;
  const savedValues = { out: saved?.outCategoryId ?? '', inbound: saved?.inCategoryId ?? '' };
  const { out, inbound } = draft ?? savedValues;
  const setOut = (value: string) => setDraft({ out: value, inbound });
  const setInbound = (value: string) => setDraft({ out, inbound: value });
  const changed = !!saved && (out !== savedValues.out || inbound !== savedValues.inbound);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { peopleOutCategoryId: out || null, peopleInCategoryId: inbound || null },
      { onSuccess: () => setDraft(null) },
    );
  };

  return (
    <Card
      title="Payments to people"
      icon={LuUsers}
      description="UPI payments to friends, family and the people who help at home have no merchant to recognise. Choose a category for them, and imports fill it in when nothing else fits."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-ink-700">
            Money you send to people
            <CategorySelect
              className="mt-1.5 font-normal"
              categories={categories.data ?? []}
              emptyLabel="Leave uncategorised"
              value={out}
              onChange={(e) => setOut(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-ink-700">
            Money people send you
            <CategorySelect
              className="mt-1.5 font-normal"
              categories={categories.data ?? []}
              emptyLabel="Leave uncategorised"
              value={inbound}
              onChange={(e) => setInbound(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-ink-500">
          A payment counts as one to a person when the name reads like a person's (such as
          &quot;Ravi Kumar&quot;) and the UPI ID is not a shop&apos;s QR code. Saving also fills in
          earlier uncategorised payments like these. You can still change any of them.
        </p>
        <Button type="submit" variant="secondary" disabled={!changed || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save people categories'}
        </Button>
        {(update.isError || update.isSuccess) && (
          <p
            role={update.isError ? 'alert' : 'status'}
            className={`text-sm ${update.isError ? 'text-negative' : 'text-positive'}`}
          >
            {update.isError
              ? update.error.message
              : update.data.recategorised > 0
                ? `Saved. Filled in ${update.data.recategorised} earlier ${update.data.recategorised === 1 ? 'payment' : 'payments'}.`
                : 'Saved. New imports will use it.'}
          </p>
        )}
      </form>
    </Card>
  );
}
