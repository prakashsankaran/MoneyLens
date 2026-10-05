import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CategoryNode, TransactionList } from '@moneylens/types';
import { DEMO_PASSWORD, seedDemoUser } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const EMAIL = 'transactions-demo@example.test';
let token = '';
let seeded = 0;

beforeAll(async () => {
  seeded = (await seedDemoUser(prisma, { endMonth: '2026-09', email: EMAIL })).transactionCount;
  token = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: DEMO_PASSWORD })
      .expect(200)
  ).body.data.accessToken;
});
afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
async function list(query = '', t = token): Promise<TransactionList> {
  const res = await request(app).get(`/api/transactions${query}`).set(auth(t)).expect(200);
  return res.body.data;
}
async function categoryBySlug(slug: string, t = token) {
  const tree: CategoryNode[] = (await request(app).get('/api/categories').set(auth(t))).body.data;
  for (const parent of tree) {
    if (parent.slug === slug) return parent;
    const child = parent.children.find((c) => c.slug === slug);
    if (child) return child;
  }
  throw new Error(`No category ${slug}`);
}

describe('GET /api/transactions', () => {
  it('pages newest first with totals for every match', async () => {
    const page1 = await list('?pageSize=10');
    expect(page1.total).toBe(seeded);
    expect(page1.items).toHaveLength(10);
    const dates = page1.items.map((t) => t.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(page1.summary.spendingPaise).toBeGreaterThan(0);

    const page2 = await list('?pageSize=10&page=2');
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);
  });

  it('filters by date range in IST, category, amount, flow and text', async () => {
    const sept = await list('?from=2026-09-01&to=2026-09-30&pageSize=100');
    expect(sept.items.length).toBeGreaterThan(0);
    for (const t of sept.items) {
      const ist = new Date(new Date(t.date).getTime() + 5.5 * 3600_000).toISOString();
      expect(ist.slice(0, 7)).toBe('2026-09');
    }

    const food = await categoryBySlug('food-delivery');
    const delivery = await list(`?categoryId=${food.id}&pageSize=100`);
    expect(delivery.total).toBeGreaterThan(0);
    expect(delivery.items.every((t) => t.subcategory?.slug === 'food-delivery')).toBe(true);

    const big = await list('?minAmount=10,000&flow=OUT&pageSize=100');
    expect(big.items.every((t) => t.amountPaise >= 10_000_00 && t.flow === 'OUT')).toBe(true);

    const swiggy = await list('?q=swiggy');
    expect(swiggy.total).toBeGreaterThan(0);
    expect(swiggy.items.every((t) => /swiggy/i.test(`${t.merchantName} ${t.description}`))).toBe(
      true,
    );

    const sorted = await list('?sort=amount_desc&pageSize=5');
    const amounts = sorted.items.map((t) => t.amountPaise);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it('validates query parameters', async () => {
    const res = await request(app)
      .get('/api/transactions?from=2026-09-30&to=2026-09-01&pageSize=500')
      .set(auth())
      .expect(400);
    expect(Object.keys(res.body.error.details.fields)).toEqual(
      expect.arrayContaining(['to', 'pageSize']),
    );
  });

  it('never shows another user’s transactions', async () => {
    const other = await registerUser(app);
    expect((await list('', other.accessToken)).total).toBe(0);
    const anyId = (await list('?pageSize=1')).items[0]!.id;
    await request(app).get(`/api/transactions/${anyId}`).set(auth(other.accessToken)).expect(404);
    await request(app)
      .patch(`/api/transactions/${anyId}`)
      .set(auth(other.accessToken))
      .send({ notes: 'x' })
      .expect(404);
    await request(app)
      .delete(`/api/transactions/${anyId}`)
      .set(auth(other.accessToken))
      .expect(404);
  });
});

describe('PATCH /api/transactions/:id', () => {
  it('updates category, notes and status', async () => {
    const tx = (await list('?q=swiggy&pageSize=1')).items[0]!;
    const groceries = await categoryBySlug('groceries');
    const res = await request(app)
      .patch(`/api/transactions/${tx.id}`)
      .set(auth())
      .send({ categoryId: groceries.id, notes: 'Team lunch' })
      .expect(200);
    expect(res.body.data.transaction).toMatchObject({
      category: { slug: 'food' },
      subcategory: { slug: 'groceries' },
      notes: 'Team lunch',
      categoryConfidence: 1,
    });
    expect(res.body.data.alsoUpdated).toBe(0);

    await request(app)
      .patch(`/api/transactions/${tx.id}`)
      .set(auth())
      .send({ status: 'EXCLUDED' })
      .expect(200);
    const excluded = await list('?status=EXCLUDED');
    expect(excluded.items.map((t) => t.id)).toContain(tx.id);
    expect((await list('?pageSize=1')).total).toBe(seeded - 1);
  });

  it('applies a category to every transaction from the merchant and remembers it', async () => {
    const tx = (await list('?q=zomato&pageSize=1')).items[0]!;
    const before = await list(`?merchantId=${tx.merchantId}&pageSize=100`);
    const dining = await categoryBySlug('restaurants');
    const res = await request(app)
      .patch(`/api/transactions/${tx.id}`)
      .set(auth())
      .send({ categoryId: dining.id, applyToMerchant: true })
      .expect(200);
    expect(res.body.data.alsoUpdated).toBe(before.total - 1);

    const after = await list(`?merchantId=${tx.merchantId}&pageSize=100`);
    expect(after.items.every((t) => t.subcategory?.slug === 'restaurants')).toBe(true);
    const rule = await prisma.userCategoryRule.findFirst({
      where: { user: { email: EMAIL }, matchField: 'MERCHANT', categoryId: dining.id },
    });
    expect(rule).not.toBeNull();
  });

  it('keeps the direction consistent when the type changes', async () => {
    const tx = (await list('?flow=OUT&pageSize=1')).items[0]!;
    const res = await request(app)
      .patch(`/api/transactions/${tx.id}`)
      .set(auth())
      .send({ transactionType: 'REFUND' })
      .expect(200);
    expect(res.body.data.transaction).toMatchObject({ type: 'REFUND', flow: 'IN' });
  });

  it('rejects empty updates and applyToMerchant without a category', async () => {
    const tx = (await list('?pageSize=1')).items[0]!;
    await request(app).patch(`/api/transactions/${tx.id}`).set(auth()).send({}).expect(400);
    await request(app)
      .patch(`/api/transactions/${tx.id}`)
      .set(auth())
      .send({ applyToMerchant: true, notes: 'x' })
      .expect(400);
  });
});

describe('DELETE /api/transactions', () => {
  it('deletes one transaction, then everything after a typed confirmation', async () => {
    const user = await registerUser(app);
    const uid = user.userId;
    await prisma.transaction.createMany({
      data: [1, 2, 3].map((n) => ({
        userId: uid,
        transactionDate: new Date(`2026-09-0${n}T06:30:00Z`),
        amount: `${n}00.00`,
        transactionType: 'DEBIT' as const,
        flow: 'OUT' as const,
        source: 'MANUAL' as const,
      })),
    });
    const [first] = (await list('', user.accessToken)).items;
    await request(app)
      .delete(`/api/transactions/${first!.id}`)
      .set(auth(user.accessToken))
      .expect(200);
    await request(app)
      .delete(`/api/transactions/${first!.id}`)
      .set(auth(user.accessToken))
      .expect(404);

    await request(app)
      .delete('/api/transactions')
      .set(auth(user.accessToken))
      .send({ confirm: 'yes' })
      .expect(400);
    const res = await request(app)
      .delete('/api/transactions')
      .set(auth(user.accessToken))
      .send({ confirm: 'DELETE' })
      .expect(200);
    expect(res.body.data.deleted.transactions).toBe(2);
    expect((await list('', user.accessToken)).total).toBe(0);
    // The demo user's data is untouched.
    expect((await list('?pageSize=1')).total).toBeGreaterThan(0);
  });
});

describe('GET /api/merchants', () => {
  it('lists the user’s merchants with counts', async () => {
    const res = await request(app).get('/api/merchants').set(auth()).expect(200);
    expect(res.body.data.length).toBeGreaterThan(5);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      transactionCount: expect.any(Number),
    });
  });
});
