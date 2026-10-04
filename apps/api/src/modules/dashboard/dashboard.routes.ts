import { Router } from 'express';
import { dashboardQuerySchema } from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { DashboardService } from './dashboard.service';

export function dashboardRoutes(dashboard: DashboardService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { month } = parseInput(dashboardQuerySchema, req.query);
    ok(res, await dashboard.getDashboard(requireUserId(req), month));
  });
  return router;
}
