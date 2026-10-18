import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { CategorySuggestions, ImportReview } from '@moneylens/types';
import type { AIProvider, AIRequest, AIResult } from '../src/modules/ai/providers';
import { createTestContext, registerUser } from './helpers';

/** Answers from a script and records what it was sent. */
class ScriptedProvider implements AIProvider {
  readonly name = 'scripted';
  readonly model = 'test';
  readonly configured = true;
  calls: AIRequest[] = [];
  constructor(private readonly answer: () => string | Error) {}
  async complete(req: AIRequest): Promise<AIResult> {
    this.calls.push(structuredClone(req));
    const out = this.answer();
    if (out instanceof Error) throw out;
    return { text: out };
  }
}

let answer: () => string | Error = () => '{}';
const provider = new ScriptedProvider(() => answer());
const { app, prisma } = createTestContext({}, { aiProvider: provider });
const off = createTestContext({ AI_PROVIDER: 'none' });

afterAll(async () => {
  await prisma.$disconnect();
  await off.prisma.$disconnect();
});

const CSV = [
  'Date,Narration,Withdrawal Amt.,Deposit Amt.',
  '05/09/2026,UPI/412345678901/SRI KRISHNA STORES/krishna.stores@okaxis/Payment,250.00,',
  '06/09/2026,UPI/412345678902/SRI KRISHNA STORES/krishna.stores@okaxis/Payment,180.00,',
  '07/09/2026,UPI/412345678903/ZORBLE GADGETS/zorble@icici/Payment,9999.00,',
].join('\n');

async function upload(target = app) {
  const user = await registerUser(target);
  const res = await request(target)
    .post('/api/imports')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .attach('file', Buffer.from(CSV), 'statement.csv')
    .expect(201);
  return { ...user, review: res.body.data as ImportReview };
}

function suggest(token: string, importId: string, target = app) {
  return request(target)
    .post('/api/ai/suggest-categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ importId });
}

describe('MoneyLens AI category suggestions', () => {
  it('suggests listed categories only, sending names but no amounts', async () => {
    const { accessToken, review } = await upload();
    answer = () => 'Here you go: {"1": "food/groceries", "2": "gadgets/made-up"}';
    const res = await suggest(accessToken, review.import.id).expect(200);
    const data = res.body.data as CategorySuggestions;
    expect(data.status).toBe('ok');
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0]?.merchant).toBe('Sri Krishna Stores');
    // Nothing is saved until the user applies a suggestion.
    const after = await request(app)
      .get(`/api/imports/${review.import.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((after.body.data as ImportReview).rows.filter((r) => r.category)).toHaveLength(0);

    const sent = provider.calls.at(-1)!.messages[0]!.content;
    expect(sent).toContain('1. "Sri Krishna Stores" (money out)');
    expect(sent).toContain('food/groceries: Food: Groceries');
    expect(sent).not.toMatch(/9999|250\.00|krishna\.stores@okaxis|412345678901/);
  });

  it('says when MoneyLens AI is off or unreachable', async () => {
    const offUser = await upload(off.app);
    const res = await suggest(offUser.accessToken, offUser.review.import.id, off.app).expect(200);
    expect(res.body.data).toMatchObject({ status: 'not-configured', suggestions: [] });

    const { accessToken, review } = await upload();
    answer = () => new Error('boom');
    const failed = await suggest(accessToken, review.import.id).expect(200);
    expect(failed.body.data).toMatchObject({ status: 'unavailable', suggestions: [] });
  });

  it("does not touch another account's import", async () => {
    const { review } = await upload();
    const other = await registerUser(app);
    await suggest(other.accessToken, review.import.id).expect(404);
  });
});
