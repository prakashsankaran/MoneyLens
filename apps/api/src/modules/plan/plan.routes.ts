import { Router } from 'express';
import {
  budgetsQuerySchema,
  monthKeySchema,
  moneyPlanPatchSchema,
  moneyPlanSchema,
  putBudgetsSchema,
  simulationSchema,
} from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { PlanService } from './plan.service';

export function moneyPlanRoutes(plan: PlanService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    ok(res, await plan.get(requireUserId(req)));
  });
  router.post('/', async (req, res) => {
    const input = parseInput(moneyPlanSchema, req.body);
    ok(res, await plan.save(requireUserId(req), input, { replace: true }));
  });
  router.patch('/', async (req, res) => {
    const input = parseInput(moneyPlanPatchSchema, req.body);
    ok(res, await plan.save(requireUserId(req), input, { replace: false }));
  });
  router.post('/simulate', async (req, res) => {
    const input = parseInput(simulationSchema, req.body);
    ok(res, await plan.simulate(requireUserId(req), input));
  });
  return router;
}

export function budgetRoutes(plan: PlanService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { month } = parseInput(budgetsQuerySchema, req.query);
    ok(res, await plan.budgets(requireUserId(req), month));
  });
  router.put('/:month', async (req, res) => {
    const month = parseInput(monthKeySchema, req.params.month);
    const input = parseInput(putBudgetsSchema, req.body);
    ok(res, await plan.putBudgets(requireUserId(req), month, input));
  });
  return router;
}
