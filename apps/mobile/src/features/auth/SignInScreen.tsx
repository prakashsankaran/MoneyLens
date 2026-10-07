import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { loginSchema, type LoginInput } from '@moneylens/validation';
import { useAuth } from '@/auth/AuthProvider';
import { Button, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { colors, type } from '@/lib/theme';
import { AuthFrame } from './AuthForm';

export function SignInScreen() {
  const { login } = useAuth();
  const [problem, setProblem] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (input) => {
    setProblem(null);
    try {
      await login(input);
    } catch (err) {
      setProblem(errorMessage(err));
    }
  });

  return (
    <AuthFrame title="Sign in" subtitle="See where your money goes and where you could save.">
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => void submit()}
            error={errors.password?.message}
          />
        )}
      />
      {problem ? (
        <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
          {problem}
        </Text>
      ) : null}
      <Button label="Sign in" busy={isSubmitting} onPress={() => void submit()} />
      <Text style={[type.small, { textAlign: 'center' }]}>
        New to MoneyLens?{' '}
        <Link href="/register" style={{ color: colors.primary, fontWeight: '600' }}>
          Create an account
        </Link>
      </Text>
    </AuthFrame>
  );
}
