import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/respond';

export function healthRoutes(prisma: PrismaClient): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppError('INTERNAL_ERROR', 'Database unavailable');
    }
    ok(res, { status: 'ok' });
  });
  return router;
}
