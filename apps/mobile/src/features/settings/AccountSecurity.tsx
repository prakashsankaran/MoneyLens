import { ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  AUTH_EVENT_LABEL,
  AUTH_EVENT_WARNING,
  describeDevice,
  formatDayTime,
} from '@moneylens/shared';
import { changePasswordSchema } from '@moneylens/validation';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Card, ErrorState, Loading, TextField } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/api';
import { useAuthActivity } from '@/lib/queries';
import { colors, type } from '@/lib/theme';

type Fields = { currentPassword?: string; newPassword?: string };

/** Change the password, or end every session at once. */
export function PasswordCard() {
  const { changePassword, signOutEverywhere } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    setProblem(null);
    setDone(false);
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const next: Fields = {};
      for (const issue of parsed.error.issues)
        next[issue.path[0] as keyof Fields] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await changePassword(parsed.data);
      setCurrent('');
      setNew('');
      setDone(true);
    } catch (err) {
      const fields = fieldErrors(err) as Fields;
      setErrors(fields);
      if (!fields.currentPassword && !fields.newPassword) setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Password and devices"
      subtitle="Changing your password signs out every other device."
    >
      <View style={{ gap: 12 }}>
        <TextField
          label="Current password"
          secureTextEntry
          autoComplete="current-password"
          value={currentPassword}
          onChangeText={setCurrent}
          error={errors.currentPassword}
        />
        <TextField
          label="New password"
          secureTextEntry
          autoComplete="new-password"
          hint="At least 10 characters."
          value={newPassword}
          onChangeText={setNew}
          error={errors.newPassword}
        />
        {done ? (
          <Text accessibilityRole="alert" style={[type.small, { color: colors.positive }]}>
            Password changed. Other devices have been signed out.
          </Text>
        ) : null}
        {problem ? (
          <Text accessibilityRole="alert" style={[type.small, { color: colors.negative }]}>
            {problem}
          </Text>
        ) : null}
        <Button label="Change password" busy={busy} onPress={() => void submit()} />
        <Button
          label="Sign out on all devices"
          variant="secondary"
          onPress={() => void signOutEverywhere()}
        />
      </View>
    </Card>
  );
}

/** Recent sign-ins, so the owner can spot activity that was not theirs. */
export function ActivityCard() {
  const activity = useAuthActivity();
  return (
    <Card
      title="Recent sign-in activity"
      subtitle="Kept for 90 days. If something here wasn't you, change your password."
    >
      {activity.isPending ? (
        <Loading />
      ) : activity.isError ? (
        <ErrorState
          message={errorMessage(activity.error)}
          onRetry={() => void activity.refetch()}
        />
      ) : activity.data.length === 0 ? (
        <Text style={type.small}>No activity recorded yet.</Text>
      ) : (
        <View style={{ gap: 12 }}>
          {activity.data.slice(0, 10).map((e, i) => {
            const warn = AUTH_EVENT_WARNING.has(e.type);
            return (
              <View key={`${e.at}-${i}`} style={{ flexDirection: 'row', gap: 10 }}>
                {warn ? (
                  <ShieldAlert size={16} color={colors.warning} accessibilityLabel="Worth a look" />
                ) : (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      marginTop: 6,
                      marginHorizontal: 4,
                      backgroundColor: colors.ink[300],
                    }}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, warn && { fontWeight: '600' }]}>
                    {AUTH_EVENT_LABEL[e.type]}
                  </Text>
                  <Text style={type.small}>
                    {describeDevice(e.userAgent)} · {formatDayTime(e.at)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
