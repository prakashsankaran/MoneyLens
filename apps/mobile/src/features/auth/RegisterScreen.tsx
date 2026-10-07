import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { registerSchema, type RegisterInput } from '@moneylens/validation';
import { useAuth } from '@/auth/AuthProvider';
import { Button, TextField } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/api';
import { colors, type } from '@/lib/theme';
import { AuthFrame } from './AuthForm';

export function RegisterScreen() {
  const { register } = useAuth();
  const [problem, setProblem] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (input) => {
    setProblem(null);
    try {
      await register(input);
    } catch (err) {
      const fields = fieldErrors(err);
      for (const [name, message] of Object.entries(fields)) {
        if (name === 'name' || name === 'email' || name === 'password') setError(name, { message });
      }
      if (Object.keys(fields).length === 0) setProblem(errorMessage(err));
    }
  });

  const fields: {
    name: keyof RegisterInput;
    label: string;
    props: Partial<React.ComponentProps<typeof TextField>>;
  }[] = [
    { name: 'name', label: 'Your name', props: { autoComplete: 'name' } },
    {
      name: 'email',
      label: 'Email',
      props: { autoCapitalize: 'none', autoComplete: 'email', keyboardType: 'email-address' },
    },
    {
      name: 'password',
      label: 'Password',
      props: {
        secureTextEntry: true,
        autoComplete: 'new-password',
        hint: 'At least 10 characters. A short phrase works well.',
      },
    },
  ];

  return (
    <AuthFrame
      title="Create your account"
      subtitle="MoneyLens never asks for your UPI PIN or bank passwords."
    >
      {fields.map((f) => (
        <Controller
          key={f.name}
          control={control}
          name={f.name}
          render={({ field }) => (
            <TextField
              label={f.label}
              {...f.props}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors[f.name]?.message}
            />
          )}
        />
      ))}
      {problem ? (
        <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
          {problem}
        </Text>
      ) : null}
      <Button label="Create account" busy={isSubmitting} onPress={() => void submit()} />
      <Text style={[type.small, { textAlign: 'center' }]}>
        Already have an account?{' '}
        <Link href="/sign-in" style={{ color: colors.primary, fontWeight: '600' }}>
          Sign in
        </Link>
      </Text>
    </AuthFrame>
  );
}
