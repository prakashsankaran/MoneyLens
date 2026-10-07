import { useState, type FormEvent } from 'react';
import type { ColumnMappingInput } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { FormField } from '../../components/FormField';
import { mappingProblem } from './mapping';

export function PasswordDialog({
  filename,
  incorrect,
  busy,
  onSubmit,
  onClose,
}: {
  filename: string;
  incorrect: boolean;
  busy: boolean;
  onSubmit: (password: string) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };
  return (
    <Dialog title="This PDF is password protected" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-700">
          Enter the password for <span className="font-medium">{filename}</span>. MoneyLens uses it
          once to open the file and does not store it.
        </p>
        <FormField
          label="PDF password"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={
            incorrect ? 'That password did not open the PDF. Check it and try again.' : undefined
          }
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!password || busy}>
            {busy ? 'Opening…' : 'Open PDF'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Field = keyof ColumnMappingInput['columns'];

const FIELDS: { key: Field; label: string; hint?: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount', hint: 'One column; negative values are money out' },
  { key: 'debit', label: 'Money out', hint: 'Withdrawal or debit column' },
  { key: 'credit', label: 'Money in', hint: 'Deposit or credit column' },
  { key: 'direction', label: 'Debit/credit marker', hint: 'A column saying Dr or Cr' },
  { key: 'reference', label: 'Reference number' },
];

/** Excel-style column names: A, B, … Z, AA. */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export function ColumnMappingDialog({
  filename,
  preview,
  message,
  busy,
  onSubmit,
  onClose,
}: {
  filename: string;
  preview: string[][];
  message?: string;
  busy: boolean;
  onSubmit: (mapping: ColumnMappingInput) => void;
  onClose: () => void;
}) {
  const width = Math.max(0, ...preview.map((r) => r.length));
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<ColumnMappingInput['columns']>({});
  const [touched, setTouched] = useState(false);
  const mapping = { headerRow, columns };
  const problem = mappingProblem(mapping);
  const heading = preview[headerRow] ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!problem) onSubmit(mapping);
  };

  return (
    <Dialog title="Choose the columns" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-700">
          {message ?? 'MoneyLens could not recognise the column headings.'} Tell us which columns in{' '}
          <span className="font-medium">{filename}</span> hold what.
        </p>

        <div className="max-h-48 overflow-auto rounded-xl border border-ink-200/70">
          <table className="w-max min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-100">
              <tr>
                <th scope="col" className="px-2 py-1 font-medium text-ink-500">
                  Row
                </th>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} scope="col" className="px-2 py-1 font-medium text-ink-500">
                    {columnName(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, r) => (
                <tr key={r} className={r === headerRow ? 'bg-brand-50 font-medium' : ''}>
                  <th scope="row" className="px-2 py-1 font-normal text-ink-500">
                    {r + 1}
                  </th>
                  {Array.from({ length: width }, (_, i) => (
                    <td key={i} className="max-w-40 truncate px-2 py-1">
                      {row[i] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-ink-700">Headings are in row</span>
          <select
            value={headerRow}
            onChange={(e) => setHeaderRow(Number(e.target.value))}
            className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            {preview.map((row, r) => (
              <option key={r} value={r}>
                Row {r + 1}: {row.filter(Boolean).slice(0, 3).join(', ').slice(0, 50)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="font-medium text-ink-700">{f.label}</span>
              <select
                value={columns[f.key] ?? ''}
                onChange={(e) =>
                  setColumns((prev) => {
                    const { [f.key]: _previous, ...rest } = prev;
                    return e.target.value === ''
                      ? rest
                      : { ...rest, [f.key]: Number(e.target.value) };
                  })
                }
                className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-surface px-3 text-sm shadow-card transition-all duration-200 hover:border-ink-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
              >
                <option value="">Not in this file</option>
                {Array.from({ length: width }, (_, i) => (
                  <option key={i} value={i}>
                    {columnName(i)}
                    {heading[i] ? `: ${heading[i]}` : ''}
                  </option>
                ))}
              </select>
              {f.hint && <span className="mt-1 block text-xs text-ink-500">{f.hint}</span>}
            </label>
          ))}
        </div>

        {touched && problem && (
          <p role="alert" className="text-sm text-negative">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Reading…' : 'Read file'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
