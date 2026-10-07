import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'moneylens.refresh-token';

/**
 * The refresh token lives in the device keychain (iOS) or keystore-backed
 * storage (Android). The web preview has no secure store, so there it stays
 * in memory and a reload signs you out.
 */
let memory: string | null = null;
const native = Platform.OS === 'ios' || Platform.OS === 'android';

export async function readRefreshToken(): Promise<string | null> {
  return native ? SecureStore.getItemAsync(KEY) : memory;
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (native) await SecureStore.setItemAsync(KEY, token);
  else memory = token;
}

export async function clearRefreshToken(): Promise<void> {
  if (native) await SecureStore.deleteItemAsync(KEY);
  else memory = null;
}
