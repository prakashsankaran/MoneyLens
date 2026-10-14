import {
  OpenAICompatibleProvider,
  type AIProvider,
  type AIRequest,
  type AIResult,
} from '../../../api/src/modules/ai/providers';

/**
 * MoneyLens AI on the phone is off until the person adds their own Gemini
 * key. Only the assistant then talks to Google, and only with the question
 * and the calculated figures it is about (see the API's prompt.ts); the
 * statements, transactions and account never leave the phone.
 */

export const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com';
const GEMINI_BASE_URL = `${GEMINI_ORIGIN}/v1beta/openai`;
// Works on Google AI Studio's free tier.
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const TIMEOUT_MS = 30_000;
const KEY_STORAGE = 'moneylens.ai.geminiKey';

function savedKey(): string | null {
  return localStorage.getItem(KEY_STORAGE);
}

export class DeviceAIProvider implements AIProvider {
  get configured(): boolean {
    return Boolean(savedKey());
  }

  get name(): string {
    return this.configured ? 'gemini' : 'none';
  }

  get model(): string | null {
    return this.configured ? GEMINI_MODEL : null;
  }

  complete(req: AIRequest): Promise<AIResult> {
    const key = savedKey();
    if (!key) return Promise.reject(new Error('No Gemini key on this phone.'));
    return new OpenAICompatibleProvider(key, GEMINI_BASE_URL, GEMINI_MODEL, TIMEOUT_MS).complete(
      req,
    );
  }
}

/** What the web app's Settings page uses to turn AI on or off on the phone. */
export const deviceAI = {
  service: 'Google Gemini',
  keyUrl: 'https://aistudio.google.com/apikey',
  hasKey: (): boolean => Boolean(savedKey()),
  setKey: (key: string): void => localStorage.setItem(KEY_STORAGE, key.trim()),
  clearKey: (): void => localStorage.removeItem(KEY_STORAGE),
};
