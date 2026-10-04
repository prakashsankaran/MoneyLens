import { Router } from 'express';
import { createCategorySchema, updateCategorySchema } from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { CategoriesService } from './categories.service';

export function categoryRoutes(service: CategoriesService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    ok(res, await service.tree(requireUserId(req)));
  });

  router.post('/', async (req, res) => {
    const input = parseInput(createCategorySchema, req.body);
    ok(res, await service.create(requireUserId(req), input), 201);
  });

  router.patch('/:id', async (req, res) => {
    const input = parseInput(updateCategorySchema, req.body);
    await service.rename(requireUserId(req), req.params.id, input);
    ok(res, { updated: true });
  });

  router.delete('/:id', async (req, res) => {
    ok(res, { deleted: true, ...(await service.remove(requireUserId(req), req.params.id)) });
  });

  return router;
}
