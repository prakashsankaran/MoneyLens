import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@/lib/api';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { RecoveryKeyPanel } from './RecoveryKeyPanel';

const mockReset = jest.fn();
const mockApi = jest.fn();
const mockSend = jest.fn();
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ resetWithRecoveryKey: mockReset }),
}));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: (...args: unknown[]) => mockApi(...args),
  send: (...args: unknown[]) => mockSend(...args),
}));
jest.mock('lucide-react-native', () => ({ Check: () => null, Share2: () => null }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  mockReset.mockReset();
  mockApi.mockReset();
  mockSend.mockReset();
});

const renderScreen = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ForgotPasswordScreen />
    </QueryClientProvider>,
  );

describe('ForgotPasswordScreen', () => {
  it('resets with a loosely typed recovery key', async () => {
    mockApi.mockResolvedValue({ email: false });
    mockReset.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_ERROR', 'That email and recovery key do not match.', {
        fields: { recoveryKey: 'That email and recovery key do not match.' },
      }),
    );
    await renderScreen();
    expect(screen.queryByRole('tab', { name: 'Email link' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'Asha@Example.test');
    await fireEvent.changeText(
      screen.getByLabelText('Recovery key'),
      'abcd efgh jkmn pqrs tvwx yz01',
    );
    await fireEvent.changeText(screen.getByLabelText('New password'), 'a brand new phrase');
    await fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() =>
      expect(screen.getByText('That email and recovery key do not match.')).toBeTruthy(),
    );
    expect(mockReset).toHaveBeenCalledWith({
      email: 'asha@example.test',
      recoveryKey: 'ABCDEFGHJKMNPQRSTVWXYZ01',
      newPassword: 'a brand new phrase',
    });
  });

  it('emails a link when the server can send email', async () => {
    mockApi.mockResolvedValue({ email: true });
    mockSend.mockResolvedValue({ requested: true });
    await renderScreen();
    await fireEvent.press(await screen.findByRole('tab', { name: 'Email link' }));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Email me a reset link' }));
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(mockSend).toHaveBeenCalledWith('POST', '/auth/forgot-password', {
      email: 'asha@example.test',
    });
  });
});

describe('RecoveryKeyPanel', () => {
  it('opens the app only after the owner says the key is saved', async () => {
    const onDone = jest.fn();
    await render(<RecoveryKeyPanel recoveryKey="ABCD-EFGH-JKMN-PQRS-TVWX-YZ01" onDone={onDone} />);
    expect(screen.getByLabelText('Recovery key ABCD-EFGH-JKMN-PQRS-TVWX-YZ01')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have saved my recovery key' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalled();
  });
});
