import { GitMerge, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MerchantOption } from '@moneylens/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { send } from '../../lib/api-client';
import { invalidateFinancialData } from '../categories/useCategories';
import { useMerchants } from '../transactions/useTransactions';

const SHOWN = 50;

function useMerchantMutations() {
  const client = useQueryClient();
  const onSuccess = () => invalidateFinancialData(client);
  return {
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        send<MerchantOption>('PATCH', `/merchants/${id}`, { name }),
      onSuccess,
    }),
    merge: useMutation({
      mutationFn: ({ id, intoId }: { id: string; intoId: string }) =>
        send<MerchantOption>('POST', `/merchants/${id}/merge`, { intoId }),
      onSuccess,
    }),
  };
}

/** Rename merchants and merge ones that are really the same place. */
export function MerchantsCard() {
  const { data, isPending, isError, error } = useMerchants();
  const [query, setQuery] = useState('');
  const all = data ?? [];
  const matches = all.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Card
      title="Merchants"
      description="Rename a merchant, or merge two that are the same place. Future imports follow your changes."
    >
      {isPending ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-negative">{error.message}</p>
      ) : all.length === 0 ? (
        <p className="text-sm text-ink-500">Merchants appear here after your first import.</p>
      ) : (
        <>
          <input
            type="search"
            aria-label="Find a merchant"
            placeholder="Find a merchant"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-lg border border-ink-300 bg-surface px-3 text-sm"
          />
          <ul className="mt-3 divide-y divide-ink-100 text-sm">
            {matches.slice(0, SHOWN).map((m) => (
              <li key={m.id} className="py-1.5">
                <MerchantLine merchant={m} others={all.filter((o) => o.id !== m.id)} />
              </li>
            ))}
          </ul>
          {matches.length > SHOWN && (
            <p className="mt-2 text-xs text-ink-500">
              Showing {SHOWN} of {matches.length}. Search to find others.
            </p>
          )}
          {matches.length === 0 && <p className="mt-3 text-sm text-ink-500">No match.</p>}
        </>
      )}
    </Card>
  );
}

function MerchantLine({
  merchant,
  others,
}: {
  merchant: MerchantOption;
  others: MerchantOption[];
}) {
  const { rename, merge } = useMerchantMutations();
  const [mode, setMode] = useState<'view' | 'rename' | 'merge'>('view');
  const [name, setName] = useState(merchant.name);
  const [intoId, setIntoId] = useState('');
  const into = others.find((o) => o.id === intoId);
  const count = `${merchant.transactionCount} ${merchant.transactionCount === 1 ? 'transaction' : 'transactions'}`;

  if (mode === 'rename') {
    return (
      <form
        className="flex flex-wrap items-center gap-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(
            { id: merchant.id, name: name.trim() },
            { onSuccess: () => setMode('view') },
          );
        }}
      >
        <input
          aria-label={`New name for ${merchant.name}`}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-ink-300 px-2"
        />
        <Button type="submit" className="!h-9" disabled={!name.trim() || rename.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" className="!h-9" onClick={() => setMode('view')}>
          Cancel
        </Button>
        {rename.isError && <p className="w-full text-negative">{rename.error.message}</p>}
      </form>
    );
  }

  if (mode === 'merge') {
    return (
      <div className="space-y-2 py-1">
        <label className="block">
          <span className="font-medium">Merge {merchant.name} into</span>
          <select
            value={intoId}
            onChange={(e) => setIntoId(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-ink-300 bg-surface px-3"
          >
            <option value="">Choose a merchant</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {into && (
          <p className="text-xs text-ink-700">
            The {count} from {merchant.name} will move to {into.name}, and {merchant.name} will be
            removed. Statements that say “{merchant.name}” will match {into.name} from now on.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="!h-9"
            disabled={!into || merge.isPending}
            onClick={() =>
              merge.mutate({ id: merchant.id, intoId }, { onSuccess: () => setMode('view') })
            }
          >
            Merge
          </Button>
          <Button variant="ghost" className="!h-9" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </div>
        {merge.isError && <p className="text-negative">{merge.error.message}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block truncate font-medium">{merchant.name}</span>
        <span className="text-xs text-ink-500">{count}</span>
      </span>
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`Rename ${merchant.name}`}
          onClick={() => {
            setName(merchant.name);
            setMode('rename');
          }}
          className="rounded p-1.5 text-ink-500 hover:bg-ink-100"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        {others.length > 0 && (
          <button
            type="button"
            aria-label={`Merge ${merchant.name}`}
            onClick={() => setMode('merge')}
            className="rounded p-1.5 text-ink-500 hover:bg-ink-100"
          >
            <GitMerge className="size-4" aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
}
