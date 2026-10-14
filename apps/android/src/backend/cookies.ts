/**
 * The cookie jar for the in-app API. The web app keeps its sign-in in an
 * httpOnly refresh cookie; here that cookie is kept in the app's own storage
 * so you stay signed in between launches, as you would in a browser.
 */
const KEY = 'moneylens.cookies';

interface Saved {
  value: string;
  /** Epoch ms, or null for a session cookie. */
  expires: number | null;
}

function load(): Record<string, Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Saved>;
  } catch {
    return {};
  }
}

export const cookieJar = {
  all(): Record<string, string> {
    const now = Date.now();
    const out: Record<string, string> = {};
    for (const [name, c] of Object.entries(load())) {
      if (c.expires === null || c.expires > now) out[name] = c.value;
    }
    return out;
  },
  set(name: string, value: string, expires: Date | undefined): void {
    const all = load();
    all[name] = { value, expires: expires ? expires.getTime() : null };
    localStorage.setItem(KEY, JSON.stringify(all));
  },
  remove(name: string): void {
    const rest = Object.fromEntries(Object.entries(load()).filter(([n]) => n !== name));
    localStorage.setItem(KEY, JSON.stringify(rest));
  },
};
