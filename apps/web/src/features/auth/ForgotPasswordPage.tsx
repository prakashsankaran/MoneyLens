import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import type { PasswordResetOptions } from '@moneylens/types';
import {
  forgotPasswordSchema,
  resetWithRecoveryKeySchema,
  type ForgotPasswordInput,
  type ResetWithRecoveryKeyInput,
} from '@moneylens/validation';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { api, ApiError, fieldErrors, send } from '../../lib/api-client';
import { deviceAI } from '../../lib/device';
import { RecoveryKeyPanel } from '../account/RecoveryKeyPanel';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

type Method = 'key' | 'email';

const linkClass =
  'font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200';

/** Reset a forgotten password with the recovery key, or ask for an email link. */
export function ForgotPasswordPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('key');
  const [newKey, setNewKey] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ['auth', 'reset-options'],
    queryFn: () => api<PasswordResetOptions>('/auth/reset-options'),
    staleTime: Infinity,
  });
  const canEmail = options.data?.email ?? false;

  if (newKey) {
    return (
      <AuthLayout
        title="Password changed"
        subtitle="You're signed in. Your old recovery key is used up, so save this new one."
      >
        <RecoveryKeyPanel
          recoveryKey={newKey}
          doneLabel="Open MoneyLens"
          onDone={() => void navigate('/', { replace: true })}
        />
      </AuthLayout>
    );
  }

  if (status === 'authenticated') return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle={
        canEmail
          ? 'Set a new one with your recovery key, or get a reset link by email.'
          : 'Set a new one with the recovery key you saved when you made your account.'
      }
    >
      {canEmail && (
        <div
          role="tablist"
          aria-label="How to reset"
          className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-ink-100 p-1"
        >
          {(
            [
              ['key', 'Recovery key'],
              ['email', 'Email link'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={method === value}
              onClick={() => setMethod(value)}
              className={`h-10 rounded-full text-sm font-medium transition-all duration-200 ${
                method === value ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {method === 'key' || !canEmail ? <RecoveryKeyForm onReset={setNewKey} /> : <EmailLinkForm />}

      <div className="mt-6 space-y-3 border-t border-ink-200 pt-5 text-sm text-ink-500">
        <p>
          <span className="font-medium text-ink-700">Lost your recovery key too?</span>{' '}
          {deviceAI()
            ? "Your account is kept only on this phone, so without the key its password can't be reset."
            : 'Whoever runs this MoneyLens can set a new password on that computer with the command npm run reset-password.'}
        </p>
        <p>
          <Link to="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function RecoveryKeyForm({ onReset }: { onReset: (key: string | null) => void }) {
  const { resetWithRecoveryKey } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetWithRecoveryKeyInput>({ resolver: zodResolver(resetWithRecoveryKeySchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const key = await resetWithRecoveryKey(values);
      if (key) onReset(key);
      else void navigate('/', { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      if (fields.recoveryKey) setError('recoveryKey', { message: fields.recoveryKey });
      else setFormError(err instanceof ApiError ? err.message : 'Could not reset the password.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        label="Recovery key"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        className="[&_input]:font-mono [&_input]:tracking-wide"
        error={errors.recoveryKey?.message}
        {...register('recoveryKey')}
      />
      <FormField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. Every device will be signed out."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      {formError && (
        <p role="alert" className="text-sm text-negative">
          {formError}
        </p>
      )}
      <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Setting new password…' : 'Set new password'}
      </Button>
    </form>
  );
}

function EmailLinkForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await send('POST', '/auth/forgot-password', values);
      setSentTo(values.email);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not send the email.');
    }
  });

  if (sentTo) {
    return (
      <div role="status" className="space-y-3 rounded-2xl bg-brand-50/60 p-4 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">Check your email</p>
        <p>
          If there's an account for <span className="font-medium">{sentTo}</span>, a link to reset
          its password is on its way. It works once, for 30 minutes. Have a look in spam if it
          doesn't arrive.
        </p>
        <button type="button" className={linkClass} onClick={() => setSentTo(null)}>
          Send it again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      {formError && (
        <p role="alert" className="text-sm text-negative">
          {formError}
        </p>
      )}
      <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Email me a reset link'}
      </Button>
    </form>
  );
}
