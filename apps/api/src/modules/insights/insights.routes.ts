import { Router } from 'express';
import {
  analyticsMonthQuerySchema,
  monthlyReportQuerySchema,
  updateRecurringSchema,
} from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { RecurringService } from '../recurring/recurring.service';
import type { InsightsService } from './insights.service';

export function insightRoutes(insights: InsightsService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { month } = parseInput(analyticsMonthQuerySchema, req.query);
    ok(res, await insights.insights(requireUserId(req), month));
  });
  return router;
}

export function reportRoutes(insights: InsightsService): Router {
  const router = Router();
  router.get('/monthly', async (req, res) => {
    const { month, compare } = parseInput(monthlyReportQuerySchema, req.query);
    ok(res, await insights.report(requireUserId(req), month, compare));
  });
  return router;
}

export function recurringRoutes(recurring: RecurringService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    ok(res, await recurring.list(requireUserId(req)));
  });
  router.patch('/:id', async (req, res) => {
    const { dismissed } = parseInput(updateRecurringSchema, req.body);
    ok(res, await recurring.setDismissed(requireUserId(req), req.params.id, dismissed));
  });
  return router;
}
