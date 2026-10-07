import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { registerSchema, type RegisterInput } from '@moneylens/validation';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { ApiError } from '../../lib/api-client';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './useAuth';

export function RegisterPage() {
  const { register: createAccount, status } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createAccount(values);
      void navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setError('email', { message: err.message });
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not create your account.');
      }
    }
  });

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
          className="font-medium text-brand-600 hover:underline underline-offset-4 hover:text-brand-700 transition-all duration-200"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
