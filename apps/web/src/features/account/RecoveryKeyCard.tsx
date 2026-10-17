import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { LuLifeBuoy } from 'react-icons/lu';
import type { NewRecoveryKey, RecoveryKeyStatus } from '@moneylens/types';
import { formatDay } from '@moneylens/shared';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FormField } from '../../components/FormField';
import { api, fieldErrors, send } from '../../lib/api-client';
import { RecoveryKeyPanel } from './RecoveryKeyPanel';

const STATUS_KEY = ['auth', 'recovery-key'];

/** Whether the account has a recovery key, and a way to make a new one. */
export function RecoveryKeyCard() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api<RecoveryKeyStatus>('/auth/recovery-key'),
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const createdAt = status.data?.createdAt;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password');
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const made = await send<NewRecoveryKey>('POST', '/auth/recovery-key', { password });
      setPassword('');
      setNewKey(made.recoveryKey);
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      await queryClient.invalidateQueries({ queryKey: ['auth-activity'] });
    } catch (err) {
      setError(
        fieldErrors(err).password ?? (err instanceof Error ? err.message : 'Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Recovery key"
      icon={LuLifeBuoy}
      description="If you forget your password, your recovery key lets you set a new one from the sign-in screen."
    >
      {newKey ? (
        <RecoveryKeyPanel recoveryKey={newKey} doneLabel="Done" onDone={() => setNewKey(null)} />
      ) : (
        <>
          {status.isPending ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : status.isError ? (
            <p className="text-sm text-negative">{status.error.message}</p>
          ) : createdAt ? (
            <p className="text-sm text-ink-700">
              You have a recovery key, made {formatDay(createdAt)}. Lost it? Make a new one; the old
              one will stop working.
            </p>
          ) : (
            <p
              role="status"
              className="rounded-xl bg-warning-50 px-3 py-2.5 text-sm font-medium text-warning"
            >
              You don't have a recovery key yet. Make one now, so a forgotten password never locks
              you out.
            </p>
          )}
          <form
            onSubmit={(e) => void onSubmit(e)}
            noValidate
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
          >
            <FormField
              label="Password to confirm"
              type="password"
              autoComplete="current-password"
              className="sm:flex-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
            />
            <Button type="submit" className="sm:mt-6" disabled={busy}>
              {busy ? 'Making…' : createdAt ? 'Make a new key' : 'Make a recovery key'}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
