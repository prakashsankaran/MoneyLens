import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the API lives. Set EXPO_PUBLIC_API_URL for a deployed API. In
 * development the app talks to the API on the computer running Expo, found
 * from the address the phone used to load the app, so a phone on the same
 * Wi-Fi works without configuration.
 */
export function apiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000/api`;
  // The Android emulator reaches the host computer at 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api';
}
