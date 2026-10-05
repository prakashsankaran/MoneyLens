import { Router } from 'express';
import { mergeMerchantSchema, renameMerchantSchema } from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { MerchantsService } from './merchants.service';

/** The user's merchants: list for filters and pickers, rename, merge. */
export function merchantRoutes(service: MerchantsService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    ok(res, await service.list(requireUserId(req)));
  });

  router.patch('/:id', async (req, res) => {
    const { name } = parseInput(renameMerchantSchema, req.body);
    ok(res, await service.rename(requireUserId(req), req.params.id, name));
  });

  router.post('/:id/merge', async (req, res) => {
    const { intoId } = parseInput(mergeMerchantSchema, req.body);
    ok(res, await service.merge(requireUserId(req), req.params.id, intoId));
  });

  return router;
}
