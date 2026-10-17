import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type { PasswordResetOptions } from '@moneylens/types';
import { forgotPasswordSchema, resetWithRecoveryKeySchema } from '@moneylens/validation';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Segmented, TextField } from '@/components/ui';
import { api, errorMessage, fieldErrors, send } from '@/lib/api';
import { colors, type } from '@/lib/theme';
import { AuthFrame } from './AuthForm';

type Method = 'key' | 'email';
type KeyFields = { email?: string; recoveryKey?: string; newPassword?: string };

/** Reset a forgotten password with the recovery key, or ask for an email link. */
export function ForgotPasswordScreen() {
  const [method, setMethod] = useState<Method>('key');
  const options = useQuery({
    queryKey: ['auth', 'reset-options'],
    queryFn: () => api<PasswordResetOptions>('/auth/reset-options'),
    staleTime: Infinity,
  });
  const canEmail = options.data?.email ?? false;

  return (
    <AuthFrame
      title="Forgot your password?"
      subtitle={
        canEmail
          ? 'Set a new one with your recovery key, or get a reset link by email.'
          : 'Set a new one with the recovery key you saved when you made your account.'
      }
    >
      {canEmail ? (
        <Segmented
          label="How to reset"
          value={method}
          onChange={setMethod}
          options={[
            { value: 'key', label: 'Recovery key' },
            { value: 'email', label: 'Email link' },
          ]}
        />
      ) : null}
      {method === 'key' || !canEmail ? <RecoveryKeyForm /> : <EmailLinkForm />}
      <View style={{ gap: 12, marginTop: 8 }}>
        <Text style={type.small}>
          <Text style={{ fontWeight: '600', color: colors.textSoft }}>
            Lost your recovery key too?{' '}
          </Text>
          Whoever runs your MoneyLens server can set a new password on that computer with the
          command npm run reset-password.
        </Text>
        <Text style={[type.small, { textAlign: 'center' }]}>
          <Link href="/sign-in" style={{ color: colors.primary, fontWeight: '600' }}>
            Back to sign in
          </Link>
        </Text>
      </View>
    </AuthFrame>
  );
}

function RecoveryKeyForm() {
  const { resetWithRecoveryKey } = useAuth();
  const [email, setEmail] = useState('');
  const [recoveryKey, setKey] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<KeyFields>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setProblem(null);
    const parsed = resetWithRecoveryKeySchema.safeParse({ email, recoveryKey, newPassword });
    if (!parsed.success) {
      const next: KeyFields = {};
      for (const issue of parsed.error.issues)
        next[issue.path[0] as keyof KeyFields] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      // On success the app shows the new key, then opens.
      await resetWithRecoveryKey(parsed.data);
    } catch (err) {
      const fields = fieldErrors(err) as KeyFields;
      setErrors(fields);
      if (Object.keys(fields).length === 0) setProblem(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <TextField
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
      />
      <TextField
        label="Recovery key"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}
        value={recoveryKey}
        onChangeText={setKey}
        error={errors.recoveryKey}
      />
      <TextField
        label="New password"
        secureTextEntry
        autoComplete="new-password"
        hint="At least 10 characters. Every device will be signed out."
        value={newPassword}
        onChangeText={setNew}
        error={errors.newPassword}
      />
      {problem ? (
        <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
          {problem}
        </Text>
      ) : null}
      <Button label="Set new password" busy={busy} onPress={() => void submit()} />
    </View>
  );
}

function EmailLinkForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await send('POST', '/auth/forgot-password', parsed.data);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <View accessibilityRole="alert" style={{ gap: 8 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>Check your email</Text>
        <Text style={type.body}>
          If there's an account for {sentTo}, a link to reset its password is on its way. Open it on
          any device; it works once, for 30 minutes.
        </Text>
        <Button label="Send it again" variant="ghost" onPress={() => setSentTo(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <TextField
        label="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={error}
      />
      <Button label="Email me a reset link" busy={busy} onPress={() => void submit()} />
    </View>
  );
}
