/**
 * The parts of node:crypto the API uses, on top of Web Crypto (random) and
 * @noble/hashes (synchronous SHA-256 and HMAC, which Web Crypto lacks).
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Buffer } from 'buffer';

type Data = string | Uint8Array;
const bytes = (d: Data) => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

function encode(digest: Uint8Array, encoding?: string): string | Buffer {
  const buf = Buffer.from(digest);
  return encoding ? toText(buf, encoding) : buf;
}

/** Buffer's toString plus base64url, which the browser Buffer lacks. */
function toText(buf: Buffer, encoding: string): string {
  if (encoding !== 'base64url') return buf.toString(encoding as BufferEncoding);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function assertSha256(algorithm: string) {
  if (algorithm.toLowerCase() !== 'sha256') throw new Error(`Unsupported hash ${algorithm}`);
}

export function createHash(algorithm: string) {
  assertSha256(algorithm);
  const h = sha256.create();
  const api = {
    update(data: Data) {
      h.update(bytes(data));
      return api;
    },
    digest: (encoding?: string) => encode(h.digest(), encoding),
  };
  return api;
}

export function createHmac(algorithm: string, key: Data) {
  assertSha256(algorithm);
  const h = hmac.create(sha256, bytes(key));
  const api = {
    update(data: Data) {
      h.update(bytes(data));
      return api;
    },
    digest: (encoding?: string) => encode(h.digest(), encoding),
  };
  return api;
}

export function randomBytes(size: number): Buffer {
  const buf = Buffer.from(crypto.getRandomValues(new Uint8Array(size)));
  const original = buf.toString.bind(buf);
  buf.toString = ((encoding?: string, ...rest: number[]) =>
    encoding === 'base64url'
      ? toText(buf, encoding)
      : original(encoding as BufferEncoding, ...rest)) as Buffer['toString'];
  return buf;
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same length');
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export default { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual };
