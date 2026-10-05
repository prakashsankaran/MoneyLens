import { Router } from 'express';
import {
  analyticsMonthQuerySchema,
  categoryAnalyticsQuerySchema,
  merchantAnalyticsQuerySchema,
  trendQuerySchema,
} from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { InsightsService } from '../insights/insights.service';
import type { AnalyticsService } from './analytics.service';

export function analyticsRoutes(service: AnalyticsService, insights: InsightsService): Router {
  const router = Router();

  router.get('/monthly', async (req, res) => {
    const { month } = parseInput(analyticsMonthQuerySchema, req.query);
    ok(res, await service.monthly(requireUserId(req), month));
  });

  router.get('/categories', async (req, res) => {
    const q = parseInput(categoryAnalyticsQuerySchema, req.query);
    ok(res, await service.categories(requireUserId(req), q));
  });

  router.get('/merchants', async (req, res) => {
    const q = parseInput(merchantAnalyticsQuerySchema, req.query);
    ok(res, await service.merchants(requireUserId(req), q));
  });

  router.get('/trends', async (req, res) => {
    const q = parseInput(trendQuerySchema, req.query);
    ok(res, await service.trends(requireUserId(req), q));
  });

  router.get('/health', async (req, res) => {
    const { month } = parseInput(analyticsMonthQuerySchema, req.query);
    ok(res, await insights.health(requireUserId(req), month));
  });

  router.get('/comparisons', async (req, res) => {
    const { month } = parseInput(analyticsMonthQuerySchema, req.query);
    ok(res, await insights.comparisons(requireUserId(req), month));
  });

  return router;
}
