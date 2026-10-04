import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { loginSchema, type LoginInput } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { ApiError } from '../../lib/api-client';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      void navigate(from, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    }
  });

  return (
    <AuthLayout title="Sign in" subtitle="Understand where your money goes.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError && (
          <p role="alert" className="text-sm text-negative">
            {formError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-500">
        New to MoneyLens?{' '}
        <Link to="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
      {import.meta.env.DEV && (
        <p className="mt-8 rounded-lg bg-brand-50 p-3 text-xs text-ink-700">
          Demo account: <span className="font-medium">demo@moneylens.app</span> /{' '}
          <span className="font-medium">moneylens-demo</span>
        </p>
      )}
    </AuthLayout>
  );
}
