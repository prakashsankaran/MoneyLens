import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ApiFailure } from '@moneylens/types';
import { updatePreferencesSchema } from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { PreferencesService } from './preferences.service';

const tooMany: ApiFailure = {
  success: false,
  error: {
    code: 'RATE_LIMITED',
    message: 'That summary was just sent. Check your inbox, then try again in a few minutes.',
  },
};

export function preferencesRoutes(service: PreferencesService): Router {
  const router = Router();
  // Each send is a real email; a few per user every 10 minutes is plenty.
  const sendLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => requireUserId(req),
    message: tooMany,
  });

  router.get('/', async (req, res) => {
    ok(res, await service.get(requireUserId(req)));
  });

  router.patch('/', async (req, res) => {
    const input = parseInput(updatePreferencesSchema, req.body);
    ok(res, await service.update(requireUserId(req), input));
  });

  router.post('/monthly-summary/send', sendLimit, async (req, res) => {
    ok(res, await service.sendNow(requireUserId(req)));
  });

  return router;
}
