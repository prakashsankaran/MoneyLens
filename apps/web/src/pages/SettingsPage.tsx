import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CategoryNode } from '@moneylens/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { fieldErrors, send } from '../lib/api-client';
import { useAuth } from '../features/auth/useAuth';
import {
  invalidateFinancialData,
  useCategories,
  useCategoryMutations,
} from '../features/categories/useCategories';
import { MerchantsCard } from '../features/merchants/MerchantsCard';

export function SettingsPage() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8 lg:py-12">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
      <Card title="Account">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500">Name</dt>
            <dd className="mt-1 font-medium">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Email</dt>
            <dd className="mt-1 font-medium">{user?.email}</dd>
          </div>
        </dl>
        <Button variant="secondary" className="mt-6" onClick={() => void logout()}>
          Sign out
        </Button>
      </Card>
      <CategoriesCard />
      <MerchantsCard />
      <DataCard />
    </div>
  );
}

function CategoriesCard() {
  const { data, isPending, isError, error } = useCategories();
  const { create } = useCategoryMutations();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), parentId: parentId || null },
      { onSuccess: () => setName('') },
    );
  };
  const createErrors = fieldErrors(create.error);

  return (
    <Card
      title="Categories"
      description="Built-in categories cannot be changed, but you can add your own and subcategories under any category."
    >
      <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FormField
          label="New category"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          error={
            createErrors.name ??
            (create.isError && !createErrors.name ? create.error.message : undefined)
          }
        />
        <label className="block text-sm">
          <span className="font-medium text-ink-700">Inside</span>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            <option value="">Top level</option>
            {(data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          <LuPlus className="size-4" aria-hidden="true" /> Add
        </Button>
      </form>

      {isPending ? (
        <p className="mt-6 text-sm text-ink-500">Loading…</p>
      ) : isError ? (
        <p className="mt-6 text-sm text-negative">{error.message}</p>
      ) : (
        <>
          <h3 className="mt-6 text-sm font-semibold">Your categories</h3>
          {(() => {
            const mine = data.flatMap((parent) => [
              ...(parent.isSystem ? [] : [{ category: parent, parentName: null }]),
              ...parent.children
                .filter((c) => !c.isSystem)
                .map((c) => ({ category: c, parentName: parent.name })),
            ]);
            return mine.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">You have not added any categories yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-100 text-sm">
                {mine.map(({ category, parentName }) => (
                  <li key={category.id} className="py-1.5">
                    <CategoryLine category={category} parentName={parentName} />
                  </li>
                ))}
              </ul>
            );
          })()}
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer font-semibold">
              Built-in categories ({data.filter((c) => c.isSystem).length})
            </summary>
            <dl className="mt-3 space-y-3">
              {data
                .filter((c) => c.isSystem)
                .map((parent) => (
                  <div key={parent.id}>
                    <dt className="font-medium">{parent.name}</dt>
                    <dd className="text-ink-500">
                      {parent.children
                        .filter((c) => c.isSystem)
                        .map((c) => c.name)
                        .join(', ') || 'No subcategories'}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
        </>
      )}
    </Card>
  );
}

function CategoryLine({
  category,
  parentName,
}: {
  category: Pick<CategoryNode, 'id' | 'name' | 'isSystem'>;
  parentName: string | null;
}) {
  const { rename, remove } = useCategoryMutations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(
            { id: category.id, name: draft.trim() },
            { onSuccess: () => setEditing(false) },
          );
        }}
      >
        <input
          aria-label={`Rename ${category.name}`}
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9 flex-1 rounded-xl border border-ink-200 px-2 shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
        <Button type="submit" className="!h-9" disabled={!draft.trim() || rename.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" className="!h-9" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {rename.isError && <span className="text-negative">{rename.error.message}</span>}
      </form>
    );
  }

  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <span>
        <span className="font-medium">{category.name}</span>
        {parentName && <span className="ml-2 text-xs text-ink-500">in {parentName}</span>}
      </span>
      {confirming ? (
        <span className="flex items-center gap-2 text-xs">
          Delete? Transactions keep their data but lose this category.
          <button
            type="button"
            className="font-medium text-negative"
            onClick={() => remove.mutate(category.id)}
            disabled={remove.isPending}
          >
            Delete
          </button>
          <button type="button" className="font-medium" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <span className="flex gap-1">
          <button
            type="button"
            aria-label={`Rename ${category.name}`}
            onClick={() => setEditing(true)}
            className="rounded-xl p-1.5 text-ink-500 hover:bg-ink-100 transition-all duration-200 hover:text-ink-900"
          >
            <LuPencil className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${category.name}`}
            onClick={() => setConfirming(true)}
            className="rounded-xl p-1.5 text-ink-500 hover:bg-ink-100 hover:text-negative transition-all duration-200"
          >
            <LuTrash2 className="size-4" aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}

function DataCard() {
  const client = useQueryClient();
  const { deleteAccount } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deleteAllState, setDeleteAllState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; count: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const deleteAll = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteAllState({ kind: 'busy' });
    try {
      const result = await send<{ deleted: { transactions: number } }>('DELETE', '/transactions', {
        confirm: confirmText,
      });
      setConfirmText('');
      setDeleteAllState({ kind: 'done', count: result.deleted.transactions });
      invalidateFinancialData(client);
    } catch (err) {
      setDeleteAllState({ kind: 'error', message: (err as Error).message });
    }
  };

  const onDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setDeletingAccount(true);
    setAccountError(null);
    try {
      await deleteAccount(password);
    } catch (err) {
      setAccountError(fieldErrors(err).password ?? (err as Error).message);
      setDeletingAccount(false);
    }
  };

  return (
    <Card title="Your data" description="Deletion is permanent. There is no undo.">
      <form onSubmit={deleteAll} className="space-y-3">
        <h3 className="text-sm font-semibold">Delete all transactions</h3>
        <p className="text-sm text-ink-500">
          Removes every transaction and import. Your categories and merchant corrections are kept so
          future imports are categorised the same way.
        </p>
        <FormField
          label="Type DELETE to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
        <Button
          type="submit"
          className="!bg-negative"
          disabled={confirmText !== 'DELETE' || deleteAllState.kind === 'busy'}
        >
          Delete all transactions
        </Button>
        {deleteAllState.kind === 'done' && (
          <p role="status" className="text-sm text-positive">
            Deleted {deleteAllState.count} transactions.
          </p>
        )}
        {deleteAllState.kind === 'error' && (
          <p role="alert" className="text-sm text-negative">
            {deleteAllState.message}
          </p>
        )}
      </form>

      <form onSubmit={onDeleteAccount} className="mt-8 space-y-3 border-t border-ink-100 pt-6">
        <h3 className="text-sm font-semibold">Delete account</h3>
        <p className="text-sm text-ink-500">
          Deletes your account and everything linked to it: transactions, imports, categories,
          merchants and sessions.
        </p>
        <FormField
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={accountError ?? undefined}
        />
        <Button type="submit" className="!bg-negative" disabled={!password || deletingAccount}>
          {deletingAccount ? 'Deleting…' : 'Delete my account'}
        </Button>
      </form>
    </Card>
  );
}
