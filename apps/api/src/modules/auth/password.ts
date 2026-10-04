import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id; the const enum cannot be imported under verbatimModuleSyntax.
const ARGON2ID = 2;

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane).
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real hash to verify against when the email is unknown, so that login takes
 * the same time whether or not an account exists (prevents user enumeration).
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('moneylens-timing-equaliser');
  return dummyHash;
}
