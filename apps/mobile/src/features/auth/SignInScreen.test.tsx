import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@/lib/api';
import { SignInScreen } from './SignInScreen';

const mockLogin = jest.fn();
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ login: mockLogin }) }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => mockLogin.mockReset());

describe('SignInScreen', () => {
  it('checks the form before calling the API', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('signs in and shows the API message when it fails', async () => {
    mockLogin.mockRejectedValueOnce(
      new ApiError(401, 'UNAUTHENTICATED', 'Incorrect email or password.'),
    );
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'aarav@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText('Incorrect email or password.')).toBeTruthy());
    expect(mockLogin).toHaveBeenCalledWith({
      email: 'aarav@example.com',
      password: 'correct horse battery',
    });
  });
});
