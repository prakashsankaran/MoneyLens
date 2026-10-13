/**
 * Replaces `@prisma/client` in the on-device build (see vite.config.ts) and in
 * the test run of the API suite (vitest.config.ts). Every client shares one
 * in-memory database, which the app loads from and saves to the phone.
 */
import { MemoryPrismaClient } from './client';
import { MemDecimal } from './decimal';
import { MemoryDatabase } from './engine';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from './errors';
import { RAW_HANDLERS } from './raw';

export const database = new MemoryDatabase();

export class PrismaClient extends MemoryPrismaClient {
  constructor(_options?: unknown) {
    super({ db: database, raw: RAW_HANDLERS });
  }
}

export const Prisma = {
  Decimal: MemDecimal,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  JsonNull: null,
  DbNull: null,
  AnyNull: null,
};

export { MemDecimal as Decimal };
