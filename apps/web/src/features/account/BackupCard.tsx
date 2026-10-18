import { LuArchiveRestore, LuDownload } from 'react-icons/lu';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dayKeyOf } from '@moneylens/shared';
import type { BackupStatus, RestoreResult } from '@moneylens/types';
import { BACKUP_FORMAT, REPLACE_CONFIRMATION, type BackupFile } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FormField } from '../../components/FormField';
import { api } from '../../lib/api-client';
import { saveTextFile } from '../../lib/device';
import { formatDay } from '../../lib/format';
import { invalidateFinancialData } from '../categories/useCategories';

/** What the chosen backup holds, read in the browser before anything is sent. */
interface Chosen {
  file: File;
  exportedAt: string;
  accountName: string;
  transactions: number;
  first: string | null;
  last: string | null;
}

async function readChosen(file: File): Promise<Chosen> {
  let json: Partial<BackupFile>;
  try {
    json = JSON.parse(await file.text()) as Partial<BackupFile>;
  } catch {
    throw new Error('This file is not a MoneyLens backup. Choose the .json file MoneyLens saved.');
  }
  if (json?.format !== BACKUP_FORMAT || !Array.isArray(json.transactions)) {
    throw new Error('This file is not a MoneyLens backup. Choose the .json file MoneyLens saved.');
  }
  const dates = json.transactions.map((t) => t.date).sort();
  return {
    file,
    exportedAt: json.exportedAt ?? '',
    accountName: json.account?.name ?? '',
    transactions: json.transactions.length,
    first: dates[0] ?? null,
    last: dates.at(-1) ?? null,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Save everything to one file and load it back: for a new phone, a reset, or
 * moving between the Mac, the phone app and a hosted copy.
 */
export function BackupCard() {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [existing, setExisting] = useState<BackupStatus | null>(null);
  const [confirm, setConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const download = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const backup = await api<BackupFile>('/backup');
      const name = `moneylens-backup-${dayKeyOf(new Date())}.json`;
      const how = await saveTextFile(name, JSON.stringify(backup), 'application/json');
      const what = plural(backup.transactions.length, 'transaction');
      setSaveMessage({
        ok: true,
        text:
          how === 'shared'
            ? `Backup with ${what} is ready. Choose where to keep it, such as Drive or Files.`
            : `Saved ${name} with ${what}. Keep it somewhere safe: it holds your full history.`,
      });
    } catch (err) {
      setSaveMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const choose = async (file: File | undefined) => {
    setChosen(null);
    setRestoreMessage(null);
    setConfirm('');
    if (!file) return;
    try {
      const [summary, status] = await Promise.all([
        readChosen(file),
        api<BackupStatus>('/backup/status'),
      ]);
      setChosen(summary);
      setExisting(status);
    } catch (err) {
      setRestoreMessage({ ok: false, text: (err as Error).message });
    }
  };

  const replacing = !!existing && (existing.transactions > 0 || existing.imports > 0);

  const restore = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setRestoring(true);
    setRestoreMessage(null);
    const body = new FormData();
    body.append('file', chosen.file);
    if (replacing) body.append('replace', confirm);
    try {
      const result = await api<RestoreResult>('/backup/restore', { method: 'POST', body });
      setChosen(null);
      setConfirm('');
      invalidateFinancialData(client);
      void client.invalidateQueries({ queryKey: ['categories'] });
      setRestoreMessage({
        ok: true,
        text: `Restored ${plural(result.transactions, 'transaction')} and ${plural(result.merchants, 'merchant')}${result.replaced ? ', replacing what was here before' : ''}.`,
      });
    } catch (err) {
      setRestoreMessage({ ok: false, text: (err as Error).message });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card
      title="Backup and restore"
      icon={LuArchiveRestore}
      description="Save all your transactions, categories, merchant rules, budgets and money plan in one file. Restore it on a new phone, after a reset, or in another copy of MoneyLens."
    >
      <div className="space-y-3">
        <Button variant="secondary" onClick={() => void download()} disabled={saving}>
          <LuDownload className="size-4" aria-hidden="true" />
          {saving ? 'Preparing…' : 'Download a backup'}
        </Button>
        <p className="text-xs text-ink-500">
          The file is not protected by a password, so keep it as private as your bank statements.
          Your password and MoneyLens AI chats are not included.
        </p>
        {saveMessage && (
          <p
            role={saveMessage.ok ? 'status' : 'alert'}
            className={`text-sm ${saveMessage.ok ? 'text-positive' : 'text-negative'}`}
          >
            {saveMessage.text}
          </p>
        )}
      </div>

      <form onSubmit={restore} className="mt-8 space-y-3 border-t border-ink-200 pt-6">
        <h3 className="text-sm font-semibold">Restore from a backup</h3>
        <label className="block text-sm">
          <span className="sr-only">Backup file</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="block w-full text-sm text-ink-700 file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border file:border-ink-200 file:bg-surface file:px-5 file:text-sm file:font-semibold file:text-ink-900 hover:file:bg-ink-100"
          />
        </label>
        {chosen && (
          <div className="rounded-2xl bg-ink-50 p-4 text-sm">
            <p className="font-medium text-ink-900">
              {plural(chosen.transactions, 'transaction')}
              {chosen.first && chosen.last
                ? `, ${formatDay(chosen.first)} to ${formatDay(chosen.last)}`
                : ''}
            </p>
            <p className="mt-1 text-ink-500">
              Saved {chosen.exportedAt ? formatDay(chosen.exportedAt) : ''}
              {chosen.accountName ? ` from ${chosen.accountName}'s account` : ''}.
            </p>
            {replacing && existing && (
              <p className="mt-3 font-medium text-negative">
                This account already has {plural(existing.transactions, 'transaction')}. Restoring
                deletes them, with this account's imports, categories, rules, budgets and plan, and
                puts the backup in their place.
              </p>
            )}
          </div>
        )}
        {chosen && replacing && (
          <FormField
            label={`Type ${REPLACE_CONFIRMATION} to confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
        )}
        {chosen && (
          <Button
            type="submit"
            className={replacing ? '!bg-negative' : ''}
            disabled={restoring || (replacing && confirm !== REPLACE_CONFIRMATION)}
          >
            {restoring
              ? 'Restoring…'
              : replacing
                ? 'Replace with this backup'
                : 'Restore this backup'}
          </Button>
        )}
        {restoreMessage && (
          <p
            role={restoreMessage.ok ? 'status' : 'alert'}
            className={`text-sm ${restoreMessage.ok ? 'text-positive' : 'text-negative'}`}
          >
            {restoreMessage.text}
          </p>
        )}
      </form>
    </Card>
  );
}
