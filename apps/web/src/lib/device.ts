/**
 * Set by the Android app (apps/android/src/main.ts), where the API runs on the
 * phone. Absent in the browser, where AI is configured on the server.
 */
export interface DeviceAI {
  /** The AI service the key is for, e.g. "Google Gemini". */
  service: string;
  /** Where to create a key. */
  keyUrl: string;
  hasKey(): boolean;
  setKey(key: string): void;
  clearKey(): void;
}

declare global {
  interface Window {
    moneylensDevice?: { ai: DeviceAI };
  }
}

export function deviceAI(): DeviceAI | undefined {
  return typeof window === 'undefined' ? undefined : window.moneylensDevice?.ai;
}
