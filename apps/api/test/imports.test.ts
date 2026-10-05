import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImportReview, TransactionList } from '@moneylens/types';
import { seedCategories } from '../prisma/seed';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext({ MAX_UPLOAD_MB: '0.05' });
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const HDFC = fixture('hdfc-style.csv');

beforeAll(async () => {
  await seedCategories(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Each upload gets a unique trailing comment line so the same-file guard does not trigger. */
function unique(buffer: Buffer): Buffer {
  return Buffer.concat([buffer, Buffer.from(`\n,Opening Balance ${Math.random()},,,,,\n`)]);
}

function upload(token: string, buffer: Buffer, filename = 'statement.csv') {
  return request(app).post('/api/imports').set(auth(token)).attach('file', buffer, filename);
}

describe('POST /api/imports', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/imports').attach('file', HDFC, 'a.csv').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('stages a CSV for review without creating transactions', async () => {
    const user = await registerUser(app);
    const res = await upload(user.accessToken, HDFC).expect(201);
    const review: ImportReview = res.body.data;

    expect(review.import.status).toBe('READY_FOR_REVIEW');
    expect(review.import.parserName).toBe('csv@1');
    expect(review.import.statementStart).toBe('2026-09-01');
    expect(review.import.statementEnd).toBe('2026-09-25');
    expect(review.rows).toHaveLength(6);
    expect(review.stats).toMatchObject({
      detected: 6,
      included: 6,
      totalDebitsPaise: 32_000_00 + 452_00 + 310_50 + 10_000_00,
      totalCreditsPaise: 1_45_000_00 + 1_299_00,
    });

    const swiggy = review.rows.find((r) => r.merchantName === 'Swiggy');
    expect(swiggy?.category?.slug).toBe('food-delivery');
    expect(swiggy?.flow).toBe('OUT');
    const refund = review.rows.find((r) => r.amountPaise === 1_299_00);
    expect(refund?.type).toBe('REFUND');

    const list = await request(app)
      .get('/api/transactions')
      .set(auth(user.accessToken))
      .expect(200);
    expect((list.body.data as TransactionList).total).toBe(0);
  });

  it('rejects the same file twice and points at the earlier import', async () => {
    const user = await registerUser(app);
    const first = await upload(user.accessToken, HDFC).expect(201);
    const second = await upload(user.accessToken, HDFC).expect(409);
    expect(second.body.error.details.importId).toBe(first.body.data.import.id);
  });

  it('explains that PDF and XLSX arrive later', async () => {
    const user = await registerUser(app);
    const res = await upload(user.accessToken, Buffer.from('%PDF-1.7'), 'gpay.pdf').expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(res.body.error.message).toMatch(/Phase 3/);
  });

  it('checks file contents, not just the extension', async () => {
    const user = await registerUser(app);
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    await upload(user.accessToken, zip, 'renamed.csv').expect(415);
    await upload(user.accessToken, Buffer.from('hello'), 'notes.txt').expect(415);
  });

  it('enforces the upload size limit', async () => {
    const user = await registerUser(app);
    const big = Buffer.alloc(80 * 1024, 'a');
    const res = await upload(user.accessToken, big, 'big.csv').expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('requires a file', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/api/imports').set(auth(user.accessToken)).expect(400);
    expect(res.body.error.details.fields.file).toBeDefined();
  });

  it('records unreadable files as failed imports', async () => {
    const user = await registerUser(app);
    const res = await upload(
      user.accessToken,
      Buffer.from('just,some,words\nno,dates,here\n'),
    ).expect(201);
    expect(res.body.data.import.status).toBe('FAILED');
    expect(res.body.data.import.errorMessage).toBeTruthy();
    const history = await request(app).get('/api/imports').set(auth(user.accessToken)).expect(200);
    expect(history.body.data[0].status).toBe('FAILED');
  });
});

describe('import review and confirm', () => {
  it('lets the user adjust rows, then commits only included rows', async () => {
    const user = await registerUser(app);
    const review: ImportReview = (await upload(user.accessToken, unique(HDFC)).expect(201)).body
      .data;
    const id = review.import.id;

    const starbucks = review.rows.find((r) => r.merchantName === 'Starbucks');
    const salary = review.rows.find((r) => r.amountPaise === 1_45_000_00);
    expect(starbucks && salary).toBeTruthy();

    const excluded = await request(app)
      .patch(`/api/imports/${id}/rows/${starbucks!.id}`)
      .set(auth(user.accessToken))
      .send({ decision: 'EXCLUDE' })
      .expect(200);
    expect(excluded.body.data.stats.included).toBe(5);

    const categories = await request(app).get('/api/categories').set(auth(user.accessToken));
    const income = categories.body.data.find((c: { slug: string }) => c.slug === 'income');
    const salaryCat = income.children.find((c: { slug: string }) => c.slug === 'salary');
    await request(app)
      .patch(`/api/imports/${id}/rows/${salary!.id}`)
      .set(auth(user.accessToken))
      .send({ categoryId: salaryCat.id, merchantName: 'Northwind' })
      .expect(200);

    const confirmed = await request(app)
      .post(`/api/imports/${id}/confirm`)
      .set(auth(user.accessToken))
      .expect(200);
    expect(confirmed.body.data.committed).toBe(5);
    expect(confirmed.body.data.import.status).toBe('CONFIRMED');

    // A second confirm or edit is refused.
    await request(app).post(`/api/imports/${id}/confirm`).set(auth(user.accessToken)).expect(409);
    await request(app)
      .patch(`/api/imports/${id}/rows/${salary!.id}`)
      .set(auth(user.accessToken))
      .send({ decision: 'EXCLUDE' })
      .expect(409);

    const list: TransactionList = (
      await request(app)
        .get('/api/transactions?pageSize=50')
        .set(auth(user.accessToken))
        .expect(200)
    ).body.data;
    expect(list.total).toBe(5);
    const salaryTx = list.items.find((t) => t.amountPaise === 1_45_000_00);
    expect(salaryTx).toMatchObject({
      merchantName: 'Northwind',
      category: { slug: 'income' },
      subcategory: { slug: 'salary' },
      source: 'CSV',
    });
    // Identifiers are masked in responses.
    const swiggy = list.items.find((t) => t.merchantName === 'Swiggy');
    expect(swiggy?.upiIdMasked).not.toContain('swiggy.demo');
    expect(swiggy?.referenceMasked).toMatch(/^•+\d{4}$/);
    expect(JSON.stringify(list)).not.toContain('424698765432');

    const rows = await prisma.importTransaction.findMany({
      where: { importId: id, decision: 'INCLUDE' },
    });
    expect(rows.every((r) => r.committedId)).toBe(true);

    // Re-uploading a statement whose references already exist flags duplicates.
    const again: ImportReview = (await upload(user.accessToken, unique(HDFC)).expect(201)).body
      .data;
    const flagged = again.rows.filter((r) => r.decision === 'DUPLICATE');
    expect(flagged.length).toBeGreaterThanOrEqual(3);
    expect(flagged[0]?.duplicateReason).toMatch(/reference/);

    // Deleting the import removes exactly the transactions it added.
    const deleted = await request(app)
      .delete(`/api/imports/${id}`)
      .set(auth(user.accessToken))
      .expect(200);
    expect(deleted.body.data.transactions).toBe(5);
    const after = await request(app)
      .get('/api/transactions')
      .set(auth(user.accessToken))
      .expect(200);
    expect(after.body.data.total).toBe(0);
  });

  it('remembers merchants so the next import is categorised the same way', async () => {
    const user = await registerUser(app);
    const first: ImportReview = (await upload(user.accessToken, unique(HDFC)).expect(201)).body
      .data;
    await request(app)
      .post(`/api/imports/${first.import.id}/confirm`)
      .set(auth(user.accessToken))
      .expect(200);

    const list: TransactionList = (
      await request(app).get('/api/transactions?q=starbucks').set(auth(user.accessToken))
    ).body.data;
    const starbucks = list.items[0]!;
    const categories = await request(app).get('/api/categories').set(auth(user.accessToken));
    const shopping = categories.body.data.find((c: { slug: string }) => c.slug === 'shopping');

    const patched = await request(app)
      .patch(`/api/transactions/${starbucks.id}`)
      .set(auth(user.accessToken))
      .send({ categoryId: shopping.id, applyToMerchant: true })
      .expect(200);
    expect(patched.body.data.transaction.category.slug).toBe('shopping');

    const csv = 'Date,Description,Amount\n2026-10-02,POS STARBUCKS COFFEE MG ROAD,-280\n';
    const next: ImportReview = (await upload(user.accessToken, Buffer.from(csv)).expect(201)).body
      .data;
    expect(next.rows[0]?.category?.slug).toBe('shopping');
    expect(next.rows[0]?.categoryConfidence).toBe(1);
  });

  it('hides other users’ imports', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const review: ImportReview = (await upload(owner.accessToken, unique(HDFC)).expect(201)).body
      .data;
    const id = review.import.id;
    const rowId = review.rows[0]!.id;

    await request(app).get(`/api/imports/${id}`).set(auth(other.accessToken)).expect(404);
    await request(app)
      .patch(`/api/imports/${id}/rows/${rowId}`)
      .set(auth(other.accessToken))
      .send({ decision: 'EXCLUDE' })
      .expect(404);
    await request(app).post(`/api/imports/${id}/confirm`).set(auth(other.accessToken)).expect(404);
    await request(app).delete(`/api/imports/${id}`).set(auth(other.accessToken)).expect(404);
    const history = await request(app).get('/api/imports').set(auth(other.accessToken)).expect(200);
    expect(history.body.data).toEqual([]);
  });

  it('rejects categories the user cannot see', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const custom = await request(app)
      .post('/api/categories')
      .set(auth(other.accessToken))
      .send({ name: 'Secret stuff' })
      .expect(201);
    const review: ImportReview = (await upload(owner.accessToken, unique(HDFC)).expect(201)).body
      .data;
    const res = await request(app)
      .patch(`/api/imports/${review.import.id}/rows/${review.rows[0]!.id}`)
      .set(auth(owner.accessToken))
      .send({ categoryId: custom.body.data.id })
      .expect(400);
    expect(res.body.error.details.fields.categoryId).toBeDefined();
  });
});
