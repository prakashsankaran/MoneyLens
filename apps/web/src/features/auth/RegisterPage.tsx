import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import type { SignupOptions } from '@moneylens/types';
import { registerSchema, type RegisterInput } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { api, ApiError } from '../../lib/api-client';
import { RecoveryKeyPanel } from '../account/RecoveryKeyPanel';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

export function RegisterPage() {
  const { register: createAccount, status } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  // Shown once, after the account is made and before the app opens.
  const [recoveryKey, setRecoveryKey] = useState<{ key: string; email: string } | null>(null);
  // Before the answer arrives the form is shown without the invite field;
  // the server still enforces the rule.
  const signup = useQuery({
    queryKey: ['auth', 'signup'],
    queryFn: () => api<SignupOptions>('/auth/signup'),
    staleTime: Infinity,
  });
  const mode = signup.data?.mode ?? 'open';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  if (recoveryKey) {
    return (
      <AuthLayout
        title="Save your recovery key"
        subtitle="Your account is ready. One last step keeps it safe."
      >
        <RecoveryKeyPanel
          recoveryKey={recoveryKey.key}
          email={recoveryKey.email}
          doneLabel="Open MoneyLens"
          onDone={() => void navigate('/', { replace: true })}
        />
      </AuthLayout>
    );
  }

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const key = await createAccount(values);
      if (key) setRecoveryKey({ key, email: values.email });
      else void navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setError('email', { message: err.message });
      } else if (err instanceof ApiError && err.details?.field === 'inviteCode') {
        setError('inviteCode', { message: err.message });
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not create your account.');
      }
    }
  });

  if (mode === 'closed') {
    return (
      <AuthLayout title="Sign-up is closed" subtitle="New accounts are not being created here.">
        <p className="text-sm text-ink-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
          >
            Sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Your data stays private to your account.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters. A short phrase works well."
          error={errors.password?.message}
          {...register('password')}
        />
        {mode === 'invite' && (
          <FormField
            label="Invite code"
            autoComplete="off"
            hint="From the person who invited you. Your data is stored on the server they run."
            error={errors.inviteCode?.message}
            {...register('inviteCode')}
          />
        )}
        {formError && (
          <p role="alert" className="text-sm text-negative">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-500">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-brand-700 hover:underline underline-offset-4 hover:text-brand-800 transition-all duration-200"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
