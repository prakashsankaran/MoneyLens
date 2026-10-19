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

/** Saving a file on the phone, where the web view cannot download. */
export interface DeviceFiles {
  /** Opens the share sheet with the file, so the person chooses where it goes. */
  save(name: string, text: string, mimeType: string): Promise<void>;
}

declare global {
  interface Window {
    moneylensDevice?: { ai: DeviceAI; files?: DeviceFiles; version?: string };
  }
}

export function deviceAI(): DeviceAI | undefined {
  return typeof window === 'undefined' ? undefined : window.moneylensDevice?.ai;
}

/** The Android app's version, e.g. "1.0.33". Absent in the browser. */
export function deviceVersion(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.moneylensDevice?.version;
}

/**
 * Save a text file: a download in the browser, the share sheet on the phone.
 * Resolves to how it was saved, for the message shown afterwards.
 */
export async function saveTextFile(
  name: string,
  text: string,
  mimeType: string,
): Promise<'downloaded' | 'shared'> {
  const files = typeof window === 'undefined' ? undefined : window.moneylensDevice?.files;
  if (files) {
    await files.save(name, text, mimeType);
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
