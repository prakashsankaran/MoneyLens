/**
 * Password hashing for accounts created on the phone. Argon2 needs native
 * code, so the app uses PBKDF2-SHA256 from Web Crypto (310,000 iterations,
 * random 16-byte salt). Hashes never leave the device.
 */
const ITERATIONS = 310_000;
const PREFIX = '$pbkdf2-sha256$';

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, ITERATIONS);
  return `${PREFIX}i=${ITERATIONS}$${b64(salt)}$${b64(derived)}`;
}

export async function verify(stored: string, password: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return false;
  const [params, salt, expected] = stored.slice(PREFIX.length).split('$');
  const iterations = Number(params?.replace('i=', ''));
  if (!salt || !expected || !Number.isInteger(iterations) || iterations < 1) return false;
  const actual = await derive(password, unb64(salt), iterations);
  const want = unb64(expected);
  if (actual.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= (actual[i] as number) ^ (want[i] as number);
  return diff === 0;
}
