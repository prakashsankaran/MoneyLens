import { AuthFrame } from './AuthForm';
import { RecoveryKeyPanel } from './RecoveryKeyPanel';

/** Shown once after sign-up or a reset with a key, before the app opens. */
export function RecoveryKeyScreen({
  recoveryKey,
  onDone,
}: {
  recoveryKey: string;
  onDone: () => void;
}) {
  return (
    <AuthFrame
      title="Save your recovery key"
      subtitle="You're signed in. Keep this key safe in case you forget your password."
    >
      <RecoveryKeyPanel recoveryKey={recoveryKey} doneLabel="Open MoneyLens" onDone={onDone} />
    </AuthFrame>
  );
}
