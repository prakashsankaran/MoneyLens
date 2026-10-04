import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { MerchantOption } from '@moneylens/types';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';

/** The user's merchants, for filters and pickers. */
export function merchantRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const rows = await prisma.merchant.findMany({
      where: { userId: requireUserId(req) },
      select: { id: true, name: true, _count: { select: { transactions: true } } },
      orderBy: { name: 'asc' },
    });
    const merchants: MerchantOption[] = rows.map((m) => ({
      id: m.id,
      name: m.name,
      transactionCount: m._count.transactions,
    }));
    ok(res, merchants);
  });

  return router;
}
