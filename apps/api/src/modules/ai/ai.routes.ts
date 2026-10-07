import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ApiFailure } from '@moneylens/types';
import { briefQuerySchema, chatSchema } from '@moneylens/validation';
import { ok } from '../../lib/respond';
import { requireUserId } from '../../middleware/authenticate';
import { parseInput } from '../../middleware/validate';
import type { AIService } from './ai.service';

const limited: ApiFailure = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Too many questions at once. Please wait a minute.' },
};

export function aiRoutes(ai: AIService, { chatPerMinute }: { chatPerMinute: number }): Router {
  const router = Router();
  // Per user, on top of the per-IP API limit and the daily question limit.
  // The brief has its own budget: dashboard visits must not use up questions.
  const perUser = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => requireUserId(req),
      message: limited,
    });
  const chatLimit = perUser(chatPerMinute);
  const briefLimit = perUser(chatPerMinute * 3);

  router.get('/status', async (req, res) => {
    ok(res, await ai.status(requireUserId(req)));
  });
  router.post('/chat', chatLimit, async (req, res) => {
    const input = parseInput(chatSchema, req.body);
    ok(res, await ai.chat(requireUserId(req), input));
  });
  router.get('/brief', briefLimit, async (req, res) => {
    const { month } = parseInput(briefQuerySchema, req.query);
    ok(res, await ai.brief(requireUserId(req), month));
  });
  router.get('/conversations', async (req, res) => {
    ok(res, await ai.conversations(requireUserId(req)));
  });
  router.get('/conversations/:id', async (req, res) => {
    ok(res, await ai.conversation(requireUserId(req), req.params.id));
  });
  router.delete('/conversations/:id', async (req, res) => {
    ok(res, await ai.deleteConversation(requireUserId(req), req.params.id));
  });
  router.delete('/conversations', async (req, res) => {
    ok(res, await ai.deleteAllConversations(requireUserId(req)));
  });
  return router;
}
