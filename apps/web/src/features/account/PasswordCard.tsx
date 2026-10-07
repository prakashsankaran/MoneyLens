import { useState, type FormEvent } from 'react';
import { changePasswordSchema } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FormField } from '../../components/FormField';
import { fieldErrors } from '../../lib/api-client';
import { useAuth } from '../auth/useAuth';

type Fields = { currentPassword?: string; newPassword?: string };

/** Change the password, or sign out every device at once. */
export function PasswordCard() {
  const { changePassword, signOutEverywhere } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<Fields>({});
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const next: Fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Fields;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setState('busy');
    try {
      await changePassword(parsed.data);
      setCurrent('');
      setNew('');
      setState('done');
    } catch (err) {
      const fields = fieldErrors(err) as Fields;
      setErrors(fields);
      if (!fields.currentPassword && !fields.newPassword) {
        setProblem(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      setState('idle');
    }
  };

  return (
    <Card
      title="Password and devices"
      description="Changing your password signs out every other device. MoneyLens will never ask for your UPI PIN or bank password."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            error={errors.currentPassword}
          />
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters."
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            error={errors.newPassword}
          />
        </div>
        <Button type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Changing…' : 'Change password'}
        </Button>
        {state === 'done' && (
          <p role="status" className="text-sm text-positive">
            Password changed. Other devices have been signed out.
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-negative">
            {problem}
          </p>
        )}
      </form>

      <div className="mt-8 space-y-3 border-t border-ink-100 pt-6">
        <h3 className="text-sm font-semibold">Sign out everywhere</h3>
        <p className="text-sm text-ink-500">
          Ends every session, on this device and all others. Use it if a phone is lost or you see
          activity that wasn't you.
        </p>
        <Button variant="secondary" onClick={() => void signOutEverywhere()}>
          Sign out on all devices
        </Button>
      </div>
    </Card>
  );
}
