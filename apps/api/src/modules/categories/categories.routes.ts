import { Router } from 'express';
import type { CategoryRef } from '@moneylens/types';
import type { AnalyticsDataSource } from '../../lib/analytics-data';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';

export interface CategoryNode extends CategoryRef {
  children: CategoryRef[];
}

/** Read-only category tree. Custom category CRUD arrives in Phase 2. */
export function categoryRoutes(data: AnalyticsDataSource): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const all = await data.categories(requireUserId(req));
    const tree: CategoryNode[] = all
      .filter((c) => c.parentId === null)
      .map((parent) => ({ ...parent, children: all.filter((c) => c.parentId === parent.id) }));
    ok(res, tree);
  });
  return router;
}
