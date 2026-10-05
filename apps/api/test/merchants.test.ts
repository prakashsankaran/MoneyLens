import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImportReview, MerchantOption, TransactionList } from '@moneylens/types';
import { seedCategories } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
const HDFC = readFileSync(new URL('./fixtures/hdfc-style.csv', import.meta.url));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await seedCategories(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function userWithTransactions() {
  const user = await registerUser(app);
  const review: ImportReview = (
    await request(app)
      .post('/api/imports')
      .set(auth(user.accessToken))
      .attach('file', HDFC, 'statement.csv')
      .expect(201)
  ).body.data;
  await request(app)
    .post(`/api/imports/${review.import.id}/confirm`)
    .set(auth(user.accessToken))
    .expect(200);
  const merchants: MerchantOption[] = (
    await request(app).get('/api/merchants').set(auth(user.accessToken)).expect(200)
  ).body.data;
  const byName = (name: string) => merchants.find((m) => m.name === name)!;
  return { user, byName };
}

const transactions = async (token: string, q = ''): Promise<TransactionList> =>
  (await request(app).get(`/api/transactions?pageSize=50${q}`).set(auth(token)).expect(200)).body
    .data;

describe('merchants', () => {
  it('renames a merchant and its transactions, keeping the old name as an alias', async () => {
    const { user, byName } = await userWithTransactions();
    const swiggy = byName('Swiggy');
    const res = await request(app)
      .patch(`/api/merchants/${swiggy.id}`)
      .set(auth(user.accessToken))
      .send({ name: 'Swiggy Food' })
      .expect(200);
    expect(res.body.data).toEqual({ id: swiggy.id, name: 'Swiggy Food', transactionCount: 1 });
    const list = await transactions(user.accessToken, `&merchantId=${swiggy.id}`);
    expect(list.items.map((t) => t.merchantName)).toEqual(['Swiggy Food']);

    // A new statement that still says "SWIGGY" maps to the renamed merchant.
    const csv = 'Date,Description,Amount\n2026-10-02,UPI-SWIGGY-ORDER,-199\n';
    const next: ImportReview = (
      await request(app)
        .post('/api/imports')
        .set(auth(user.accessToken))
        .attach('file', Buffer.from(csv), 'next.csv')
        .expect(201)
    ).body.data;
    expect(next.rows[0]?.merchantName).toBe('Swiggy Food');
  });

  it('refuses a rename that clashes with another merchant', async () => {
    const { user, byName } = await userWithTransactions();
    const res = await request(app)
      .patch(`/api/merchants/${byName('Swiggy').id}`)
      .set(auth(user.accessToken))
      .send({ name: 'starbucks' })
      .expect(409);
    expect(res.body.error.details.merchantId).toBe(byName('Starbucks').id);
    await request(app)
      .patch(`/api/merchants/${byName('Swiggy').id}`)
      .set(auth(user.accessToken))
      .send({ name: '  ' })
      .expect(400);
  });

  it('merges one merchant into another', async () => {
    const { user, byName } = await userWithTransactions();
    const starbucks = byName('Starbucks');
    const swiggy = byName('Swiggy');
    const res = await request(app)
      .post(`/api/merchants/${starbucks.id}/merge`)
      .set(auth(user.accessToken))
      .send({ intoId: swiggy.id })
      .expect(200);
    expect(res.body.data).toMatchObject({ id: swiggy.id, transactionCount: 2 });

    const merchants: MerchantOption[] = (
      await request(app).get('/api/merchants').set(auth(user.accessToken))
    ).body.data;
    expect(merchants.find((m) => m.id === starbucks.id)).toBeUndefined();
    const list = await transactions(user.accessToken, `&merchantId=${swiggy.id}`);
    expect(list.items.map((t) => t.merchantName)).toEqual(['Swiggy', 'Swiggy']);

    await request(app)
      .post(`/api/merchants/${swiggy.id}/merge`)
      .set(auth(user.accessToken))
      .send({ intoId: swiggy.id })
      .expect(400);
  });

  it('keeps merchants private to their owner', async () => {
    const { user, byName } = await userWithTransactions();
    const other = await registerUser(app);
    const id = byName('Swiggy').id;
    await request(app)
      .patch(`/api/merchants/${id}`)
      .set(auth(other.accessToken))
      .send({ name: 'Mine now' })
      .expect(404);
    const theirs = await userWithTransactions();
    await request(app)
      .post(`/api/merchants/${id}/merge`)
      .set(auth(user.accessToken))
      .send({ intoId: theirs.byName('Swiggy').id })
      .expect(404);
  });
});
