import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { dayKeyOf, PAYMENT_METHOD_LABELS } from '@moneylens/shared';
import type { PaymentMethod, TransactionDetail } from '@moneylens/types';
import {
  createTransactionSchema,
  type CreateTransactionFormInput,
  type CreateTransactionInput,
} from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FormField } from '../../components/FormField';
import { fieldErrors } from '../../lib/api-client';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { useCreateTransaction } from './useTransactions';

const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'NETBANKING', 'WALLET', 'OTHER'];
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const selectClass =
  'mt-1.5 h-12 w-full rounded-xl border border-ink-200 bg-surface px-3 text-sm transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100';

/**
 * Add a payment that is on no statement, such as cash. It counts in every
 * total like an imported one, and can be corrected or deleted later.
 */
export function AddTransactionDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (tx: TransactionDetail) => void;
}) {
  const categories = useCategories();
  const create = useCreateTransaction();
  const today = dayKeyOf(new Date());
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTransactionFormInput, unknown, CreateTransactionInput>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      flow: 'OUT',
      date: today,
      paymentMethod: 'CASH',
      amount: '',
      merchantName: '',
    },
  });
  const flow = useWatch({ control, name: 'flow' });
  const serverErrors = fieldErrors(create.error);
  const error = (field: keyof CreateTransactionFormInput) =>
    errors[field]?.message ?? serverErrors[field];

  const onSubmit = handleSubmit(async (values) => {
    try {
      onAdded(await create.mutateAsync(values));
    } catch {
      // Shown below from create.error.
    }
  });

  return (
    <Dialog title="Add a payment" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-ink-500">
          For cash and anything that is not on a statement you import.
        </p>
        <div role="radiogroup" aria-label="Money in or out" className="grid grid-cols-2 gap-2">
          {(
            [
              ['OUT', 'Money out'],
              ['IN', 'Money in'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={flow === value}
              onClick={() => setValue('flow', value)}
              className={`h-11 rounded-full border text-sm font-semibold transition-all duration-200 ${
                flow === value
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-ink-200 bg-surface text-ink-700 hover:bg-ink-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Amount (₹)"
            inputMode="decimal"
            autoComplete="off"
            placeholder="450"
            error={error('amount')}
            {...register('amount')}
          />
          <FormField
            label={flow === 'OUT' ? 'Paid to' : 'Received from'}
            autoComplete="off"
            placeholder={flow === 'OUT' ? 'Vegetable market' : 'Ravi'}
            maxLength={80}
            error={error('merchantName')}
            {...register('merchantName')}
          />
          <FormField
            label="Date"
            type="date"
            max={today}
            error={error('date')}
            {...register('date')}
          />
          <FormField
            label="Time (optional)"
            type="time"
            error={error('time')}
            {...register('time', { setValueAs: emptyToUndefined })}
          />
        </div>
        <label className="block text-xs font-semibold text-ink-700">
          Category
          <CategorySelect
            className="mt-1.5 h-12 font-normal"
            categories={categories.data ?? []}
            emptyLabel="Same as last time for this name, if any"
            {...register('categoryId', { setValueAs: emptyToUndefined })}
          />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Paid by
          <select className={`${selectClass} font-normal`} {...register('paymentMethod')}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Note (optional)
          <textarea
            rows={2}
            maxLength={500}
            className="mt-1.5 block w-full rounded-xl border border-ink-200 bg-surface px-3 py-2 text-sm font-normal transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
            {...register('notes')}
          />
        </label>
        {create.isError && !Object.keys(serverErrors).length && (
          <p role="alert" className="text-sm text-negative">
            {create.error.message}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? 'Adding…' : flow === 'OUT' ? 'Add payment' : 'Add money in'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
