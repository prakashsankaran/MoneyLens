import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantStatus,
  ChatResponse,
  MoneyBrief,
} from '@moneylens/types';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import type { AIProvider, AIRequest, AIResult } from '../src/modules/ai/providers';
import { createTestContext, registerUser } from './helpers';

/** A provider that answers from a script and records what it was sent. */
class ScriptedProvider implements AIProvider {
  readonly name = 'scripted';
  readonly model = 'test';
  readonly configured = true;
  calls: AIRequest[] = [];
  constructor(private readonly answer: (req: AIRequest, call: number) => string | Error) {}
  async complete(req: AIRequest): Promise<AIResult> {
    this.calls.push(structuredClone(req));
    const out = this.answer(req, this.calls.length);
    if (out instanceof Error) throw out;
    return { text: out };
  }
}

const main = createTestContext(); // AI_PROVIDER=mock from .env.test
const { prisma } = main;
const EMAIL = 'ai-demo@example.test';
let token = '';

async function login(app = main.app) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: EMAIL, password: DEMO_PASSWORD })
    .expect(200);
  return res.body.data.accessToken as string;
}

function ask(
  message: string,
  opts: { conversationId?: string; app?: typeof main.app; auth?: string } = {},
) {
  return request(opts.app ?? main.app)
    .post('/api/ai/chat')
    .set('Authorization', `Bearer ${opts.auth ?? token}`)
    .send({ message, ...(opts.conversationId ? { conversationId: opts.conversationId } : {}) });
}

beforeAll(async () => {
  await seedDemoUser(prisma, { endMonth: '2026-09', email: EMAIL });
  token = await login();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('authentication', () => {
  it.each([
    ['get', '/api/ai/status'],
    ['post', '/api/ai/chat'],
    ['get', '/api/ai/brief'],
    ['get', '/api/ai/conversations'],
  ] as const)('%s %s needs a session', async (method, path) => {
    await request(main.app)[method](path).expect(401);
  });
});

describe('the example questions from the brief', () => {
  // Each must be routed to the right figures, and the answer must use them.
  const cases: [string, RegExp][] = [
    ['Why did I spend more this month?', /^Spending was ₹[\d,]+ in September 2026, (up|down) ₹/],
    ['Where did most of my money go?', /^Housing: ₹32,000, [\d.]+% of spending/],
    ['What are my top 5 merchants?', /^Your top merchants in September 2026: 1\. /],
    ['Where can I save ₹5,000?', /(reach ₹5,000|less than the ₹5,000)/],
    [
      'Did my food spending increase because of frequency or transaction size?',
      /^Food: \d+ payments averaging ₹[\d,]+ in September 2026, against \d+ payments averaging/,
    ],
    [
      'What recurring payments do I have?',
      /^Active recurring payments come to about ₹[\d,]+ a month/,
    ],
    ['Which categories are increasing?', /3-month average of ₹/],
    ['Compare this month with the last three months.', /^3-month average/i],
    ['Show me my biggest money leaks.', /^Potential saving opportunity:/],
  ];

  it.each(cases)('%s', async (question, expected) => {
    const res = await ask(question).expect(200);
    const { reply, question: q } = res.body.data as ChatResponse;
    expect(q).toMatchObject({ role: 'user', content: question });
    expect(reply.answer).toMatchObject({
      status: 'answered',
      month: '2026-09',
      provider: 'mock/mock',
    });
    expect(reply.answer?.facts.some((f) => expected.test(f.text))).toBe(true);
    // The overview always comes first, labelled as a calculation.
    expect(reply.answer?.facts[0]).toMatchObject({ kind: 'CALCULATION' });
    expect(reply.answer?.facts[0]?.text).toMatch(/^In September 2026 you received ₹1,45,000/);
    expect(reply.content).toBe(reply.answer?.interpretation);
    expect(JSON.stringify(reply)).not.toMatch(/waste/i);
  });
});

describe('choosing the month', () => {
  it('lists the months it can answer about', async () => {
    const res = await request(main.app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { availableMonths } = res.body.data as AssistantStatus;
    expect(availableMonths.at(-1)).toBe('2026-09');
    expect(availableMonths).toContain('2026-08');
  });

  it('answers about a month named in the question, even over the picked month', async () => {
    const named = await ask('Where did most of my money go in August?').expect(200);
    expect((named.body.data as ChatResponse).reply.answer?.month).toBe('2026-08');
    expect((named.body.data as ChatResponse).reply.answer?.facts[0]?.text).toMatch(
      /^In August 2026 you received/,
    );

    const picked = await request(main.app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'What about July?', month: '2026-08' })
      .expect(200);
    expect((picked.body.data as ChatResponse).reply.answer?.month).toBe('2026-07');
  });

  it('says so when the named month has no data', async () => {
    const res = await ask('How much did I spend in January 2020?').expect(200);
    const { answer } = (res.body.data as ChatResponse).reply;
    expect(answer?.month).toBe('2026-09');
    expect(answer?.dataLimitations[0]).toBe(
      'I have no transaction data for January 2020, so this answer is about September 2026.',
    );
  });
});

describe('what the provider is given', () => {
  it('sends aggregated figures and rules, never identifiers or raw descriptions', async () => {
    const provider = new ScriptedProvider(() => 'You spent ₹1,03,283 in September 2026.');
    const ctx = createTestContext({}, { aiProvider: provider });
    const auth = await login(ctx.app);
    const res = await ask('Where did most of my money go?', { app: ctx.app, auth }).expect(200);
    expect(res.body.data.reply.answer.status).toBe('answered');

    const sent = provider.calls[0] as AIRequest;
    expect(sent.system).toMatch(/Never do arithmetic/);
    expect(sent.system).toMatch(/not professional financial advice/);
    const turn = sent.messages.at(-1)?.content ?? '';
    expect(turn).toContain('<context>');
    expect(turn).toContain('Key figures');
    expect(turn).toContain('"spending": "₹1,03,283"');
    // No UPI IDs, references, account numbers or transaction ids.
    expect(turn).not.toMatch(/@ok|@ybl|@icici|UPI-|\d{9,}|"id"/);
    await ctx.prisma.$disconnect();
  });

  it('sends earlier turns with a follow-up question', async () => {
    const provider = new ScriptedProvider((_r, n) =>
      n === 1 ? 'First answer.' : 'Second answer.',
    );
    const ctx = createTestContext({}, { aiProvider: provider });
    const auth = await login(ctx.app);
    const first = await ask('What are my top 5 merchants?', { app: ctx.app, auth }).expect(200);
    const conversationId = (first.body.data as ChatResponse).conversation.id;
    await ask('And which categories are increasing?', {
      app: ctx.app,
      auth,
      conversationId,
    }).expect(200);
    const roles = provider.calls[1]?.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
    expect(provider.calls[1]?.messages[0]?.content).toBe('What are my top 5 merchants?');
    expect(provider.calls[1]?.messages[1]?.content).toBe('First answer.');
    await ctx.prisma.$disconnect();
  });
});

describe('the figure check', () => {
  it('regenerates once when the answer invents a figure', async () => {
    const provider = new ScriptedProvider((_r, n) =>
      n === 1 ? 'You could save ₹7,777 a month.' : 'Your top category was Housing at ₹32,000.',
    );
    const ctx = createTestContext({}, { aiProvider: provider });
    const auth = await login(ctx.app);
    const res = await ask('Where did most of my money go?', { app: ctx.app, auth }).expect(200);
    const { reply } = res.body.data as ChatResponse;
    expect(reply.answer).toMatchObject({ status: 'answered', regenerated: true });
    expect(reply.content).toBe('Your top category was Housing at ₹32,000.');
    expect(provider.calls[1]?.messages.at(-1)?.content).toMatch(/₹7,777/);
    await ctx.prisma.$disconnect();
  });

  it('shows the figures only when the answer keeps inventing numbers or calls spending waste', async () => {
    const provider = new ScriptedProvider((_r, n) =>
      n === 1 ? 'Your savings rate is 99%.' : 'You wasted ₹32,000 on rent.',
    );
    const ctx = createTestContext({}, { aiProvider: provider });
    const auth = await login(ctx.app);
    const res = await ask('How am I doing?', { app: ctx.app, auth }).expect(200);
    const { reply } = res.body.data as ChatResponse;
    expect(reply.answer).toMatchObject({
      status: 'fallback',
      interpretation: null,
      provider: null,
    });
    expect(reply.content).toMatch(
      /couldn't write an explanation that sticks to your calculated figures/,
    );
    expect(reply.answer?.facts.length).toBeGreaterThan(0);
    await ctx.prisma.$disconnect();
  });

  it('still answers with figures when the provider fails or is not set up', async () => {
    const failing = createTestContext(
      {},
      { aiProvider: new ScriptedProvider(() => new Error('boom')) },
    );
    let auth = await login(failing.app);
    let res = await ask('Where did most of my money go?', { app: failing.app, auth }).expect(200);
    expect(res.body.data.reply.answer.status).toBe('unavailable');
    expect(res.body.data.reply.answer.facts.length).toBeGreaterThan(0);
    await failing.prisma.$disconnect();

    const off = createTestContext({ AI_PROVIDER: 'none' });
    auth = await login(off.app);
    res = await ask('Where did most of my money go?', { app: off.app, auth }).expect(200);
    expect(res.body.data.reply.answer.status).toBe('not-configured');
    expect(res.body.data.reply.content).toMatch(/isn't set up/);
    const status = await request(off.app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect(status.body.data as AssistantStatus).toMatchObject({
      configured: false,
      provider: 'none',
    });
    await off.prisma.$disconnect();
  });
});

describe('guardrails on the question', () => {
  it('refuses a message with a PIN without sending or storing it', async () => {
    const provider = new ScriptedProvider(() => 'never');
    const ctx = createTestContext({}, { aiProvider: provider });
    const auth = await login(ctx.app);
    const res = await ask('my upi pin is 4321, is my account safe?', { app: ctx.app, auth }).expect(
      200,
    );
    const data = res.body.data as ChatResponse;
    expect(data.reply.answer?.status).toBe('refused');
    expect(data.reply.content).toMatch(/don't share PINs/);
    expect(provider.calls).toHaveLength(0);
    const stored = await ctx.prisma.aIMessage.findMany({
      where: { conversationId: data.conversation.id },
    });
    expect(stored.map((m) => m.content).join(' ')).not.toContain('4321');
    await ctx.prisma.$disconnect();
  });

  it('refuses to help with tax evasion', async () => {
    const res = await ask('How do I evade tax on my salary?').expect(200);
    expect(res.body.data.reply.answer.status).toBe('refused');
    expect(res.body.data.reply.content).toMatch(/can't help with that/);
  });

  it('validates the message', async () => {
    const res = await ask('').expect(400);
    expect(res.body.error.details.fields.message).toBeDefined();
    await ask('x'.repeat(501)).expect(400);
  });
});

describe('conversations', () => {
  it('lists, reads and deletes only the user’s own conversations', async () => {
    const first = await ask('What recurring payments do I have?').expect(200);
    const id = (first.body.data as ChatResponse).conversation.id;
    await ask('Which ones are subscriptions?', { conversationId: id }).expect(200);

    const list = await request(main.app)
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mine = (list.body.data as AssistantConversationSummary[]).find((c) => c.id === id);
    expect(mine?.title).toBe('What recurring payments do I have?');

    const conv = await request(main.app)
      .get(`/api/ai/conversations/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const messages = (conv.body.data as AssistantConversation).messages;
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages[1]?.answer?.facts.length).toBeGreaterThan(0);

    const other = await registerUser(main.app);
    await request(main.app)
      .get(`/api/ai/conversations/${id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
    await ask('hello', { conversationId: id, auth: other.accessToken }).expect(404);
    await request(main.app)
      .delete(`/api/ai/conversations/${id}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);

    await request(main.app)
      .delete(`/api/ai/conversations/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(main.app)
      .get(`/api/ai/conversations/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('enforces the daily question limit', async () => {
    const ctx = createTestContext({ AI_DAILY_MESSAGE_LIMIT: '1' });
    const user = await registerUser(ctx.app);
    await ask('Hello', { app: ctx.app, auth: user.accessToken }).expect(200);
    const res = await ask('Hello again', { app: ctx.app, auth: user.accessToken }).expect(429);
    expect(res.body.error.message).toMatch(/limit/);
    await ctx.prisma.$disconnect();
  });

  it('a user with no transactions is told so', async () => {
    const user = await registerUser(main.app);
    const res = await ask('Where did most of my money go?', { auth: user.accessToken }).expect(200);
    expect(res.body.data.reply.answer.dataLimitations[0]).toMatch(/no confirmed transactions/);
  });
});

describe('AI Money Brief', () => {
  it('is written from calculated figures and cached until they change', async () => {
    const provider = new ScriptedProvider(
      () => 'In September 2026 you received ₹1,45,000 and spent ₹1,03,283.',
    );
    const ctx = createTestContext({}, { aiProvider: provider });
    const auth = await login(ctx.app);
    const get = () =>
      request(ctx.app).get('/api/ai/brief').set('Authorization', `Bearer ${auth}`).expect(200);
    const brief = (await get()).body.data as MoneyBrief;
    expect(brief).toMatchObject({
      month: '2026-09',
      status: 'answered',
      provider: 'scripted/test',
    });
    expect(brief.text).toMatch(/₹1,45,000/);
    expect(brief.facts[0]?.text).toMatch(/^In September 2026 you received/);
    expect(brief.facts.length).toBeLessThanOrEqual(5);
    await get();
    expect(provider.calls).toHaveLength(1);
    await ctx.prisma.$disconnect();
  });
});

describe('deleting data', () => {
  it('deleting all transactions also deletes AI conversations', async () => {
    const user = await registerUser(main.app);
    await ask('Hello', { auth: user.accessToken }).expect(200);
    expect(await prisma.aIConversation.count({ where: { userId: user.userId } })).toBe(1);
    await request(main.app)
      .delete('/api/transactions')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ confirm: 'DELETE' })
      .expect(200);
    expect(await prisma.aIConversation.count({ where: { userId: user.userId } })).toBe(0);
  });
});

describe('rate limits', () => {
  it('loading the brief does not use up the per-minute question budget', async () => {
    const ctx = createTestContext({ AI_CHAT_RATE_LIMIT: '2' });
    const user = await registerUser(ctx.app);
    for (let i = 0; i < 4; i++) {
      await request(ctx.app)
        .get('/api/ai/brief')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
    }
    await ask('Hello', { app: ctx.app, auth: user.accessToken }).expect(200);
    await ask('Hello', { app: ctx.app, auth: user.accessToken }).expect(200);
    await ask('Hello', { app: ctx.app, auth: user.accessToken }).expect(429);
    await ctx.prisma.$disconnect();
  });
});
