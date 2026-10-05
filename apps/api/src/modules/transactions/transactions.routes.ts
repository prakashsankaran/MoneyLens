import { Router } from 'express';
import {
  confirmDeleteAllSchema,
  transactionQuerySchema,
  updateTransactionSchema,
} from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { TransactionsService } from './transactions.service';

export function transactionRoutes(service: TransactionsService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseInput(transactionQuerySchema, req.query);
    ok(res, await service.list(requireUserId(req), query));
  });

  router.get('/:id', async (req, res) => {
    ok(res, await service.get(requireUserId(req), req.params.id));
  });

  router.patch('/:id', async (req, res) => {
    const input = parseInput(updateTransactionSchema, req.body);
    ok(res, await service.update(requireUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await service.remove(requireUserId(req), req.params.id);
    ok(res, { deleted: true });
  });

  // Bulk delete requires a typed confirmation in the body.
  router.delete('/', async (req, res) => {
    parseInput(confirmDeleteAllSchema, req.body);
    ok(res, { deleted: await service.removeAll(requireUserId(req)) });
  });

  return router;
}
