/** HS256 JSON Web Tokens (sign and verify), as used by the API's token service. */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

const enc = new TextEncoder();

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const signature = (input: string, secret: string) =>
  b64url(hmac(sha256, enc.encode(secret), enc.encode(input)));

class JsonWebTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonWebTokenError';
  }
}

interface SignOptions {
  algorithm?: string;
  subject?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: number;
}

function sign(payload: Record<string, unknown>, secret: string, opts: SignOptions = {}): string {
  if (opts.algorithm && opts.algorithm !== 'HS256')
    throw new JsonWebTokenError('Unsupported algorithm');
  const iat = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat,
    ...(opts.expiresIn !== undefined ? { exp: iat + opts.expiresIn } : {}),
    ...(opts.audience ? { aud: opts.audience } : {}),
    ...(opts.issuer ? { iss: opts.issuer } : {}),
    ...(opts.subject ? { sub: opts.subject } : {}),
  };
  const input = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(body))}`;
  return `${input}.${signature(input, secret)}`;
}

function verify(
  token: string,
  secret: string,
  opts: { algorithms?: string[]; issuer?: string; audience?: string } = {},
): Record<string, unknown> {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) throw new JsonWebTokenError('jwt malformed');
  const head = JSON.parse(fromB64url(header)) as { alg?: string };
  if (head.alg !== 'HS256' || (opts.algorithms && !opts.algorithms.includes('HS256'))) {
    throw new JsonWebTokenError('invalid algorithm');
  }
  if (signature(`${header}.${body}`, secret) !== sig)
    throw new JsonWebTokenError('invalid signature');
  const payload = JSON.parse(fromB64url(body)) as Record<string, unknown>;
  if (typeof payload.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new JsonWebTokenError('jwt expired');
  }
  if (opts.issuer && payload.iss !== opts.issuer) throw new JsonWebTokenError('jwt issuer invalid');
  if (opts.audience && payload.aud !== opts.audience)
    throw new JsonWebTokenError('jwt audience invalid');
  return payload;
}

export default { sign, verify, JsonWebTokenError };
export { sign, verify, JsonWebTokenError };
