import { useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Card, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { apiBaseUrl } from '@/lib/config';
import { useDeleteAllTransactions } from '@/lib/queries';
import { colors, type } from '@/lib/theme';
import { ActivityCard, PasswordCard } from './AccountSecurity';

export function SettingsScreen() {
  const { deleteAccount } = useAuth();
  const deleteAll = useDeleteAllTransactions();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  return (
    <Screen edges={[]}>
      <Card title="Your privacy">
        <Text style={[type.small, { color: colors.textSoft }]}>
          MoneyLens never asks for or stores your UPI PIN, bank passwords or card CVV. Statements
          are read once to find transactions and are not kept. UPI IDs and reference numbers are
          masked. MoneyLens AI only sees calculated totals.
        </Text>
        <Text style={[type.small, { marginTop: 8 }]}>
          On this phone your session is kept in the secure device keychain.
        </Text>
      </Card>

      <PasswordCard />
      <ActivityCard />

      <Card
        title="Delete all transactions"
        subtitle="Removes every transaction, import and AI conversation. Your account stays."
      >
        <TextField
          label="Type DELETE to confirm"
          autoCapitalize="characters"
          value={confirmText}
          onChangeText={setConfirmText}
        />
        {deleteAll.isSuccess ? (
          <Text style={[type.small, { color: colors.positive, marginTop: 8 }]}>
            Deleted {deleteAll.data.deleted.transactions} transactions.
          </Text>
        ) : null}
        {deleteAll.isError ? (
          <Text
            accessibilityRole="alert"
            style={[type.small, { color: colors.negative, marginTop: 8 }]}
          >
            {errorMessage(deleteAll.error)}
          </Text>
        ) : null}
        <Button
          label="Delete all transactions"
          variant="danger"
          style={{ marginTop: 12 }}
          disabled={confirmText !== 'DELETE'}
          busy={deleteAll.isPending}
          onPress={() => deleteAll.mutate(undefined, { onSuccess: () => setConfirmText('') })}
        />
      </Card>

      <Card
        title="Delete my account"
        subtitle="Permanently removes your account and all of its data."
      >
        <TextField
          label="Your password"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          error={accountError ?? undefined}
        />
        <Button
          label="Delete my account"
          variant="danger"
          style={{ marginTop: 12 }}
          disabled={!password}
          busy={deletingAccount}
          onPress={() => {
            setAccountError(null);
            setDeletingAccount(true);
            deleteAccount(password)
              .catch((err: unknown) => setAccountError(errorMessage(err)))
              .finally(() => setDeletingAccount(false));
          }}
        />
      </Card>

      <Text style={type.small}>Connected to {apiBaseUrl()}</Text>
    </Screen>
  );
}
