import { useState } from 'react';
import { daysInRange } from '@moneylens/shared';
import { MAX_PERIOD_DAYS } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { PERIOD_PRESETS, type PeriodPreset } from './periods';

const inputClass =
  'h-10 w-full min-w-0 rounded-xl border border-ink-200 bg-surface px-3 text-sm transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100';

/** Chips for the period to analyse, with start and end dates for a custom range. */
export function PeriodPicker({
  preset,
  custom,
  onPreset,
  onCustom,
}: {
  preset: PeriodPreset;
  custom: { from: string; to: string };
  onPreset: (preset: PeriodPreset) => void;
  onCustom: (range: { from: string; to: string }) => void;
}) {
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Period to analyse" className="flex flex-wrap gap-2">
        {PERIOD_PRESETS.map((p) => {
          const active = p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onPreset(p.id)}
              className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-all duration-200 sm:px-4 ${
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-ink-200 bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <CustomRange key={`${custom.from}:${custom.to}`} value={custom} onApply={onCustom} />
      )}
    </div>
  );
}

function CustomRange({
  value,
  onApply,
}: {
  value: { from: string; to: string };
  onApply: (range: { from: string; to: string }) => void;
}) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const error =
    !from || !to
      ? 'Choose a start and an end date.'
      : from > to
        ? 'The start date must be on or before the end date.'
        : daysInRange(from, to) > MAX_PERIOD_DAYS
          ? 'Choose a period of up to three years.'
          : null;
  const changed = from !== value.from || to !== value.to;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onApply({ from, to });
      }}
    >
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-ink-700 sm:max-w-44">
        From
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-ink-700 sm:max-w-44">
        To
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={inputClass}
        />
      </label>
      <Button type="submit" disabled={!!error || !changed} className="h-10 w-full sm:w-auto">
        Show
      </Button>
      {error && changed && (
        <p role="alert" className="w-full text-xs text-negative">
          {error}
        </p>
      )}
    </form>
  );
}
