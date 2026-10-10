import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { TransactionDetail } from '@moneylens/types';
import type { UpdateTransactionInput } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FormField } from '../../components/FormField';
import { fieldErrors } from '../../lib/api-client';
import { formatDayTime, SOURCE_LABELS, TYPE_LABELS } from '../../lib/format';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { Amount } from './Amount';
import { useDeleteTransaction, useTransaction, useUpdateTransaction } from './useTransactions';

export function TransactionDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isPending, isError, error } = useTransaction(id);
  return (
    <Dialog title="Transaction" onClose={onClose} variant="side">
      {isPending ? (
        <p role="status" className="text-sm text-ink-500">
          Loading…
        </p>
      ) : isError ? (
        <p role="alert" className="text-sm text-negative">
          {error.message}
        </p>
      ) : (
        <TransactionDetailBody key={data.id} tx={data} onClose={onClose} />
      )}
    </Dialog>
  );
}

interface EditValues {
  categoryId: string;
  merchantName: string;
  notes: string;
  applyToMerchant: boolean;
}

function TransactionDetailBody({ tx, onClose }: { tx: TransactionDetail; onClose: () => void }) {
  const categories = useCategories();
  const update = useUpdateTransaction(tx.id);
  const remove = useDeleteTransaction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const currentCategory = tx.subcategory?.id ?? tx.category?.id ?? '';
  const { register, handleSubmit, control, formState } = useForm<EditValues>({
    defaultValues: {
      categoryId: currentCategory,
      merchantName: tx.merchantName ?? '',
      notes: tx.notes ?? '',
      applyToMerchant: false,
    },
  });
  const [watchedCategory, applyChecked] = useWatch({
    control,
    name: ['categoryId', 'applyToMerchant'],
  });
  const categoryChanged = watchedCategory !== currentCategory;
  const errors = fieldErrors(update.error);

  const onSubmit = handleSubmit(async (values) => {
    const input: UpdateTransactionInput = {};
    if (values.categoryId !== currentCategory || values.applyToMerchant) {
      input.categoryId = values.categoryId || null;
    }
    const merchantName = values.merchantName.trim();
    if (merchantName && merchantName !== (tx.merchantName ?? '')) input.merchantName = merchantName;
    if (values.notes.trim() !== (tx.notes ?? '')) input.notes = values.notes.trim() || null;
    if (values.applyToMerchant && input.categoryId !== undefined) input.applyToMerchant = true;
    if (Object.keys(input).length === 0) {
      setMessage('Nothing changed.');
      return;
    }
    setMessage(null);
    let result;
    try {
      result = await update.mutateAsync(input);
    } catch {
      return; // Shown from update.error.
    }
    setMessage(
      result.alsoUpdated > 0
        ? `Saved. ${result.alsoUpdated} other ${result.alsoUpdated === 1 ? 'transaction' : 'transactions'} from this merchant updated too.`
        : 'Saved.',
    );
  });

  const excluded = tx.status === 'EXCLUDED';

  return (
    <div className="space-y-6">
      <div>
        <Amount paise={tx.amountPaise} flow={tx.flow} className="text-2xl" />
        <p className="mt-1 text-sm text-ink-700">{tx.merchantName ?? 'Unknown merchant'}</p>
        {excluded && (
          <p className="mt-2 inline-block rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning">
            Excluded from your totals
          </p>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-500">Date</dt>
        <dd>{formatDayTime(tx.date)}</dd>
        <dt className="text-ink-500">Type</dt>
        <dd>{TYPE_LABELS[tx.type]}</dd>
        {tx.description && (
          <>
            <dt className="text-ink-500">Statement text</dt>
            <dd className="break-words">{tx.description}</dd>
          </>
        )}
        {tx.upiIdMasked && (
          <>
            <dt className="text-ink-500">UPI ID</dt>
            <dd>{tx.upiIdMasked}</dd>
          </>
        )}
        {tx.referenceMasked && (
          <>
            <dt className="text-ink-500">Reference</dt>
            <dd>{tx.referenceMasked}</dd>
          </>
        )}
        <dt className="text-ink-500">Source</dt>
        <dd className="break-words">
          {tx.sourceFile ? tx.sourceFile.filename : SOURCE_LABELS[tx.source]}
        </dd>
        {tx.categoryConfidence !== null && tx.categoryConfidence < 1 && (
          <>
            <dt className="text-ink-500">Category</dt>
            <dd>Suggested automatically. Check it is right.</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-ink-500">
        UPI IDs and reference numbers are partly hidden to protect your privacy.
      </p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <label className="block text-sm">
          <span className="font-medium text-ink-700">Category</span>
          <CategorySelect
            className="mt-1.5"
            categories={categories.data ?? []}
            emptyLabel="Uncategorised"
            {...register('categoryId')}
          />
          {errors.categoryId && (
            <span className="mt-1 block text-negative">{errors.categoryId}</span>
          )}
        </label>
        {tx.merchantId && (categoryChanged || applyChecked) && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" {...register('applyToMerchant')} />
            <span>
              Use this category for every {tx.merchantName ?? 'merchant'} transaction, including
              future imports
            </span>
          </label>
        )}
        <FormField
          label="Merchant name"
          error={errors.merchantName}
          {...register('merchantName')}
        />
        <label className="block text-sm">
          <span className="font-medium text-ink-700">Notes</span>
          <textarea
            rows={2}
            maxLength={500}
            className="mt-1.5 block w-full rounded-xl border border-ink-200 bg-surface px-3 py-2 text-sm transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
            {...register('notes')}
          />
        </label>
        {remove.isError && (
          <p role="alert" className="text-sm text-negative">
            {remove.error.message}
          </p>
        )}
        {update.isError && !Object.keys(errors).length && (
          <p role="alert" className="text-sm text-negative">
            {update.error.message}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-positive">
            {message}
          </p>
        )}
        <Button type="submit" disabled={formState.isSubmitting} className="w-full">
          {formState.isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      <div className="space-y-3 border-t border-ink-100 pt-5">
        <Button
          variant="secondary"
          className="w-full"
          disabled={update.isPending}
          onClick={() => update.mutate({ status: excluded ? 'CONFIRMED' : 'EXCLUDED' })}
        >
          {excluded ? 'Include in totals again' : 'Exclude from totals'}
        </Button>
        {confirmDelete ? (
          <div className="rounded-xl border border-negative/30 p-3 text-sm">
            <p>Delete this transaction permanently? This cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1 !bg-negative"
                disabled={remove.isPending}
                onClick={() => remove.mutate(tx.id, { onSuccess: onClose })}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full text-negative"
            onClick={() => setConfirmDelete(true)}
          >
            Delete transaction
          </Button>
        )}
      </div>
    </div>
  );
}
