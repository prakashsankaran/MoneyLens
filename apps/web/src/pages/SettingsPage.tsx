import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAuth } from '../features/auth/useAuth';

export function SettingsPage() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card title="Account">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500">Name</dt>
            <dd className="mt-1 font-medium">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Email</dt>
            <dd className="mt-1 font-medium">{user?.email}</dd>
          </div>
        </dl>
        <Button variant="secondary" className="mt-6" onClick={() => void logout()}>
          Sign out
        </Button>
      </Card>
      <Card title="Your data">
        <p className="text-sm text-ink-500">
          Deleting individual transactions, imported files, all transactions, or your whole account
          will be available here in phase 2. Deleting your account removes every record linked to
          it.
        </p>
      </Card>
    </div>
  );
}
