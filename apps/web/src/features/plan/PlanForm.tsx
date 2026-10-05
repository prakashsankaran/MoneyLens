import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { formatINR } from '@moneylens/shared';
import type { FinancialProfileData, ObservedBaseline } from '@moneylens/types';
import { moneyPlanSchema, type MoneyPlanInput } from '@moneylens/validation';
import type { z } from 'zod';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { fieldErrors } from '../../lib/api-client';
import { toRupeeInput, useSaveMoneyPlan } from './usePlan';

type FormValues = {
  monthlyIncome: string;
  fixedExpenses: string;
  emis: string;
  insurance: string;
  investments: string;
  savingsTarget: string;
  emergencyFundTarget: string;
  emergencyFundCurrent: string;
  upcomingExpenses: { label: string; amount: string; dueMonth: string }[];
};

function defaults(p: FinancialProfileData | null): FormValues {
  return {
    monthlyIncome: toRupeeInput(p?.monthlyIncomePaise),
    fixedExpenses: toRupeeInput(p?.fixedExpensesPaise),
    emis: toRupeeInput(p?.emisPaise),
    insurance: toRupeeInput(p?.insurancePaise),
    investments: toRupeeInput(p?.investmentsPaise),
    savingsTarget: toRupeeInput(p?.savingsTargetPaise),
    emergencyFundTarget: toRupeeInput(p?.emergencyFundTargetPaise),
    emergencyFundCurrent: toRupeeInput(p?.emergencyFundCurrentPaise),
    upcomingExpenses: (p?.upcomingExpenses ?? []).map((e) => ({
      label: e.label,
      amount: toRupeeInput(e.amountPaise),
      dueMonth: e.dueMonth,
    })),
  };
}

/** "From your transactions: ₹32,000 a month" hint, when there is one. */
const seen = (paise: number, months: number) =>
  months > 0 && paise > 0 ? `Your transactions show about ${formatINR(paise)} a month.` : undefined;

/** The user's own figures. Amounts are monthly unless the label says otherwise. */
export function PlanForm({
  profile,
  baseline,
}: {
  profile: FinancialProfileData | null;
  baseline: ObservedBaseline;
}) {
  const save = useSaveMoneyPlan();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormValues, unknown, z.output<typeof moneyPlanSchema>>({
    resolver: zodResolver(moneyPlanSchema) as never,
    defaultValues: defaults(profile),
  });
  const upcoming = useFieldArray({ control, name: 'upcomingExpenses' });
  const server = fieldErrors(save.error);
  const n = baseline.months.length;
  const err = (name: keyof FormValues) => errors[name]?.message ?? server[name];

  const onSubmit = handleSubmit(async (values) => {
    const result = await save.mutateAsync(values as MoneyPlanInput);
    reset(defaults(result.profile));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Each month</legend>
        <FormField
          label="Monthly income (after tax)"
          inputMode="decimal"
          placeholder="e.g. 1,45,000"
          hint={seen(baseline.incomePaise, n)}
          error={err('monthlyIncome')}
          {...register('monthlyIncome')}
        />
        <FormField
          label="Fixed expenses (rent, maintenance, fees)"
          inputMode="decimal"
          hint={
            n > 0 && baseline.commitmentsPaise > 0
              ? `Rent, EMIs and insurance in your transactions: ${formatINR(baseline.commitmentsPaise)} a month.`
              : undefined
          }
          error={err('fixedExpenses')}
          {...register('fixedExpenses')}
        />
        <FormField label="EMIs" inputMode="decimal" error={err('emis')} {...register('emis')} />
        <FormField
          label="Insurance premiums"
          inputMode="decimal"
          error={err('insurance')}
          {...register('insurance')}
        />
        <FormField
          label="Investments (SIPs and similar)"
          inputMode="decimal"
          hint={seen(baseline.investingPaise, n)}
          error={err('investments')}
          {...register('investments')}
        />
        <FormField
          label="Savings target"
          inputMode="decimal"
          hint="How much you want to set aside each month."
          error={err('savingsTarget')}
          {...register('savingsTarget')}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Emergency fund (totals, not monthly)</legend>
        <FormField
          label="Emergency fund target"
          inputMode="decimal"
          error={err('emergencyFundTarget')}
          {...register('emergencyFundTarget')}
        />
        <FormField
          label="Already saved"
          inputMode="decimal"
          error={err('emergencyFundCurrent')}
          {...register('emergencyFundCurrent')}
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Upcoming major expenses</legend>
        <p className="mt-1 text-xs text-ink-500">
          One-off costs you want to save for, such as a laptop or school fees.
        </p>
        <ul className="mt-3 space-y-3">
          {upcoming.fields.map((field, i) => (
            <li key={field.id} className="grid items-end gap-3 sm:grid-cols-[1fr_9rem_10rem_auto]">
              <FormField
                label="What for"
                error={errors.upcomingExpenses?.[i]?.label?.message}
                {...register(`upcomingExpenses.${i}.label`)}
              />
              <FormField
                label="Amount"
                inputMode="decimal"
                error={errors.upcomingExpenses?.[i]?.amount?.message}
                {...register(`upcomingExpenses.${i}.amount`)}
              />
              <FormField
                label="Needed by"
                type="month"
                error={errors.upcomingExpenses?.[i]?.dueMonth?.message}
                {...register(`upcomingExpenses.${i}.dueMonth`)}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => upcoming.remove(i)}
                aria-label={`Remove upcoming expense ${i + 1}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        {upcoming.fields.length < 20 && (
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => upcoming.append({ label: '', amount: '', dueMonth: '' })}
          >
            <Plus className="size-4" aria-hidden="true" /> Add an expense
          </Button>
        )}
      </fieldset>

      {save.isError && !Object.keys(server).length && (
        <p role="alert" className="text-sm text-negative">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save and calculate'}
        </Button>
        {save.isSuccess && !isDirty && (
          <span role="status" className="text-sm text-positive">
            Saved. The plan below is up to date.
          </span>
        )}
      </div>
    </form>
  );
}
