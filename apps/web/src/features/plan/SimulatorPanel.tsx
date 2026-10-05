import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatINR } from '@moneylens/shared';
import type { CategoryNode } from '@moneylens/types';
import type { ScenarioAdjustmentInput } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { CategorySelect } from '../categories/CategorySelect';
import { useCategories } from '../categories/useCategories';
import { fieldErrors } from '../../lib/api-client';
import { useSimulation } from './usePlan';

type Kind = ScenarioAdjustmentInput['type'];

interface Draft {
  key: number;
  type: Kind;
  categoryId: string;
  value: string;
}

const KIND_LABEL: Record<Kind, string> = {
  'category-percent': 'Reduce a category by %',
  'category-amount': 'Reduce a category by ₹',
  'save-more': 'Save more each month (₹)',
  'income-change': 'Change income each month (₹, minus to reduce)',
};

const needsCategory = (t: Kind) => t === 'category-percent' || t === 'category-amount';

/** The UI default: shown, editable, and never presented as guaranteed. */
const DEFAULT_RETURN_PCT = '6';

let nextKey = 1;
const draft = (type: Kind, value = '', categoryId = ''): Draft => ({
  key: nextKey++,
  type,
  categoryId,
  value,
});

function toAdjustment(d: Draft): ScenarioAdjustmentInput {
  switch (d.type) {
    case 'category-percent':
      return { type: d.type, categoryId: d.categoryId, percent: d.value };
    case 'category-amount':
      return { type: d.type, categoryId: d.categoryId, amount: d.value };
    case 'save-more':
    case 'income-change':
      return { type: d.type, amount: d.value };
  }
}

const topLevel = (cats: CategoryNode[], slug: string) =>
  cats.find((c) => c.parentId === null && c.slug === slug)?.id ?? '';

function presets(cats: CategoryNode[]): { label: string; make: () => Draft }[] {
  const food = topLevel(cats, 'food');
  const shopping = topLevel(cats, 'shopping');
  return [
    ...(food
      ? [{ label: 'Reduce food 20%', make: () => draft('category-percent', '20', food) }]
      : []),
    { label: 'Save ₹5,000 more', make: () => draft('save-more', '5000') },
    ...(shopping
      ? [
          {
            label: 'Reduce shopping ₹3,000',
            make: () => draft('category-amount', '3000', shopping),
          },
        ]
      : []),
    { label: 'Income +₹10,000', make: () => draft('income-change', '10000') },
  ];
}

/** "adjustments.1.amount" → "Change 2". */
function describeField(field: string): string {
  const m = /^adjustments\.(\d+)/.exec(field);
  if (m) return `Change ${Number(m[1]) + 1}`;
  return field === 'annualReturnPct' ? 'Assumed return' : 'Changes';
}

const inputClass = 'h-11 w-full rounded-lg border border-ink-300 bg-surface px-3 text-sm';

/** What-if scenarios against the user's recent monthly averages. */
export function SimulatorPanel() {
  const categories = useCategories();
  const simulation = useSimulation();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [returnPct, setReturnPct] = useState(DEFAULT_RETURN_PCT);
  const cats = categories.data ?? [];

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const result = simulation.data;
  const problems = Object.entries(fieldErrors(simulation.error));

  return (
    <div className="space-y-6">
      <Card
        title="What if I changed something?"
        description="Try a change against your average month. Nothing is saved."
      >
        <div className="flex flex-wrap gap-2" aria-label="Examples">
          {presets(cats).map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="secondary"
              className="h-9"
              onClick={() => setDrafts((ds) => [...ds, p.make()])}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            simulation.mutate({
              adjustments: drafts.map(toAdjustment),
              annualReturnPct: returnPct === '' ? 0 : returnPct,
            });
          }}
        >
          {drafts.length === 0 && (
            <p className="text-sm text-ink-500">Pick an example above or add your own change.</p>
          )}
          <ol className="space-y-3">
            {drafts.map((d, i) => (
              <li
                key={d.key}
                className="grid gap-2 rounded-xl border border-ink-100 p-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end"
              >
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-ink-500">Change {i + 1}</span>
                  <select
                    value={d.type}
                    onChange={(e) => update(d.key, { type: e.target.value as Kind })}
                    className={inputClass}
                  >
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                {needsCategory(d.type) ? (
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-ink-500">Category</span>
                    <CategorySelect
                      categories={cats}
                      emptyLabel="Choose a category"
                      value={d.categoryId}
                      onChange={(e) => update(d.key, { categoryId: e.target.value })}
                    />
                  </label>
                ) : (
                  <span className="hidden sm:block" />
                )}
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-ink-500">
                    {d.type === 'category-percent' ? 'Percent' : 'Rupees a month'}
                  </span>
                  <input
                    inputMode="decimal"
                    value={d.value}
                    onChange={(e) => update(d.key, { value: e.target.value })}
                    className={`${inputClass} text-right tabular-nums`}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove change ${i + 1}`}
                  onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={drafts.length >= 10}
              onClick={() => setDrafts((ds) => [...ds, draft('save-more')])}
            >
              <Plus className="size-4" aria-hidden />
              Add a change
            </Button>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-ink-500">
                Assumed yearly return (%), 0 to 15
              </span>
              <input
                inputMode="decimal"
                value={returnPct}
                onChange={(e) => setReturnPct(e.target.value)}
                className={`${inputClass} w-28 text-right tabular-nums`}
              />
            </label>
            <Button type="submit" disabled={drafts.length === 0 || simulation.isPending}>
              Calculate
            </Button>
          </div>
          <p className="text-xs text-ink-500">
            The return is an assumption you choose, not a prediction. Returns are not guaranteed and
            can be lower or negative.
          </p>
          {simulation.isError && (
            <p role="alert" className="text-sm text-negative">
              {simulation.error.message}
              {problems.map(([field, msg]) => (
                <span key={field} className="block">
                  {describeField(field)}: {msg}
                </span>
              ))}
            </p>
          )}
        </form>
      </Card>

      {result && (
        <Card title="What this would change" action={<ProvenanceBadge kind="CALCULATION" />}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-500">Each month</dt>
              <dd
                className={`text-xl font-semibold tabular-nums ${result.monthlyImpactPaise < 0 ? 'text-negative' : ''}`}
              >
                {result.monthlyImpactPaise < 0 ? '−' : '+'}
                {formatINR(Math.abs(result.monthlyImpactPaise))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Each year</dt>
              <dd
                className={`text-xl font-semibold tabular-nums ${result.annualImpactPaise < 0 ? 'text-negative' : ''}`}
              >
                {result.annualImpactPaise < 0 ? '−' : '+'}
                {formatINR(Math.abs(result.annualImpactPaise))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Kept each month after the change</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {result.newMonthlySavedPaise < 0 ? '−' : ''}
                {formatINR(Math.abs(result.newMonthlySavedPaise))}
              </dd>
              <dd className="text-xs text-ink-500">
                Now {result.baseline.savedPaise < 0 ? '−' : ''}
                {formatINR(Math.abs(result.baseline.savedPaise))}
              </dd>
            </div>
          </dl>

          <ul className="mt-5 space-y-2 text-sm">
            {result.adjustments.map((a) => (
              <li key={a.description} className="flex flex-wrap justify-between gap-2">
                <span>
                  {a.description}
                  {a.note && <span className="block text-xs text-ink-500">{a.note}</span>}
                </span>
                <span className="tabular-nums">
                  {a.monthlyImpactPaise < 0 ? '−' : '+'}
                  {formatINR(Math.abs(a.monthlyImpactPaise))} a month
                </span>
              </li>
            ))}
          </ul>

          {result.monthlyImpactPaise > 0 && (
            <section aria-label="Long-term projection" className="mt-6">
              <h3 className="text-sm font-semibold">
                If you put the extra aside, at an assumed {result.annualReturnPct}% a year
              </h3>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-ink-500">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">
                      After
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      You put aside
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      With the assumed return
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {result.projections.map((p) => (
                    <tr key={p.years}>
                      <td className="py-2">
                        {p.years} {p.years === 1 ? 'year' : 'years'}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatINR(p.contributedPaise)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {formatINR(p.withReturnPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-label="Assumptions" className="mt-6 rounded-lg bg-ink-100/60 p-3">
            <h3 className="text-xs font-semibold">Assumptions</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-700">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        </Card>
      )}
    </div>
  );
}
