import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { resetWithLinkSchema } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { fieldErrors } from '../../lib/api-client';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

const linkClass =
  'font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200';

/** Reads the token from the emailed link (after #) and takes it out of the address bar. */
function takeTokenFromUrl(): string {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  if (token) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

/** Where an emailed reset link lands: choose a new password. */
export function ResetPasswordPage() {
  const { resetWithLink } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromUrl);
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ newPassword?: string; confirm?: string }>({});
  const [linkProblem, setLinkProblem] = useState<string | null>(
    token ? null : 'This reset link is incomplete. Open it straight from the email.',
  );
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = resetWithLinkSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      setErrors({ newPassword: parsed.error.issues[0]?.message });
      return;
    }
    if (confirm !== newPassword) {
      setErrors({ confirm: 'The two passwords do not match' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await resetWithLink(parsed.data);
      void navigate('/', { replace: true });
    } catch (err) {
      setBusy(false);
      if (fieldErrors(err).token && err instanceof Error) setLinkProblem(err.message);
      else setErrors({ newPassword: err instanceof Error ? err.message : 'Please try again.' });
    }
  };

  if (linkProblem) {
    return (
      <AuthLayout title="This link can't be used" subtitle={linkProblem}>
        <p className="text-sm text-ink-500">
          <Link to="/forgot-password" className={linkClass}>
            Ask for a new link
          </Link>{' '}
          or{' '}
          <Link to="/login" className={linkClass}>
            go back to sign in
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Every device signed in to your account will be signed out."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
        <FormField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters. A short phrase works well."
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          error={errors.newPassword}
        />
        <FormField
          label="Type it again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" className="h-12 w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
