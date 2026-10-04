import type { Prisma } from '@prisma/client';
import { rupeesToPaise } from '@moneylens/shared';

/** Prisma Decimal (rupees) -> integer paise, without floating point. */
export function decimalToPaise(value: Prisma.Decimal): number {
  return rupeesToPaise(value.toFixed(2));
}
