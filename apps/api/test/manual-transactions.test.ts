import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type {
  CategoryNode,
  TransactionCsvExport,
  TransactionDetail,
  TransactionList,
} from '@moneylens/types';
import { createTestContext, registerUser } from './helpers';

const { app, prisma } = createTestContext();
afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
async function category(token: string, slug: string): Promise<{ id: string; slug: string }> {
  const tree: CategoryNode[] = (await request(app).get('/api/categories').set(auth(token))).body
    .data;
  for (const parent of tree) {
    if (parent.slug === slug) return parent;
    const child = parent.children.find((c) => c.slug === slug);
    if (child) return child;
  }
  throw new Error(`No category ${slug}`);
}
function add(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/transactions').set(auth(token)).send(body);
}

describe('adding a payment by hand', () => {
  it('adds a cash payment that counts in totals and lists', async () => {
    const { accessToken: token } = await registerUser(app);
    const groceries = await category(token, 'groceries');
    const res = await add(token, {
      date: '2026-10-05',
      time: '18:45',
      amount: '1,250.50',
      flow: 'OUT',
      merchantName: 'Vegetable market',
      categoryId: groceries.id,
      notes: 'Weekly vegetables',
    }).expect(201);
    const tx: TransactionDetail = res.body.data;
    expect(tx).toMatchObject({
      amountPaise: 125050,
      flow: 'OUT',
      type: 'DEBIT',
      source: 'MANUAL',
      paymentMethod: 'CASH',
      merchantName: 'Vegetable market',
      notes: 'Weekly vegetables',
    });
    expect(tx.subcategory?.slug).toBe('groceries');
    // 18:45 IST is 13:15 UTC.
    expect(tx.date).toBe('2026-10-05T13:15:00.000Z');

    const list: TransactionList = (
      await request(app).get('/api/transactions?source=MANUAL').set(auth(token)).expect(200)
    ).body.data;
    expect(list.total).toBe(1);
    expect(list.summary.spendingPaise).toBe(125050);

    const income = await add(token, {
      date: '2026-10-06',
      amount: '500',
      flow: 'IN',
      merchantName: 'Ravi',
      paymentMethod: 'UPI',
    }).expect(201);
    expect(income.body.data).toMatchObject({ type: 'CREDIT', paymentMethod: 'UPI' });
    // No time: midday IST.
    expect(income.body.data.date).toBe('2026-10-06T06:30:00.000Z');
  });

  it("uses the merchant's usual category when none is chosen", async () => {
    const { accessToken: token } = await registerUser(app);
    const tea = await category(token, 'restaurants');
    const first = (
      await add(token, {
        date: '2026-10-01',
        amount: '20',
        flow: 'OUT',
        merchantName: 'Chai stall',
      }).expect(201)
    ).body.data as TransactionDetail;
    expect(first.category).toBeNull();
    await request(app)
      .patch(`/api/transactions/${first.id}`)
      .set(auth(token))
      .send({ categoryId: tea.id, applyToMerchant: true })
      .expect(200);

    const second = (
      await add(token, {
        date: '2026-10-02',
        amount: '20',
        flow: 'OUT',
        merchantName: 'chai stall',
      }).expect(201)
    ).body.data as TransactionDetail;
    expect(second.merchantName).toBe('Chai stall');
    expect(second.subcategory?.id ?? second.category?.id).toBe(tea.id);
  });

  it('validates what is typed', async () => {
    const { accessToken: token } = await registerUser(app);
    const empty = await add(token, { date: '2026-10-01', amount: '0', flow: 'OUT' }).expect(400);
    expect(Object.keys(empty.body.error.details.fields)).toEqual(
      expect.arrayContaining(['amount', 'merchantName']),
    );
    const mismatch = await add(token, {
      date: '2026-10-01',
      amount: '100',
      flow: 'OUT',
      merchantName: 'Shop',
      transactionType: 'REFUND',
    }).expect(400);
    expect(mismatch.body.error.details.fields.transactionType).toBeDefined();
    const future = await add(token, {
      date: '2999-01-01',
      amount: '100',
      flow: 'OUT',
      merchantName: 'Shop',
    }).expect(400);
    expect(future.body.error.details.fields.date).toMatch(/today or an earlier/);
    await request(app)
      .post('/api/transactions')
      .send({ date: '2026-10-01', amount: '1', flow: 'OUT', merchantName: 'x' })
      .expect(401);
  });

  it('lets hand-added payments have their figures corrected, but not imported ones', async () => {
    const { accessToken: token, userId } = await registerUser(app);
    const tx = (
      await add(token, {
        date: '2026-10-05',
        time: '09:30',
        amount: '300',
        flow: 'OUT',
        merchantName: 'Auto rickshaw',
      }).expect(201)
    ).body.data as TransactionDetail;

    const moved = (
      await request(app)
        .patch(`/api/transactions/${tx.id}`)
        .set(auth(token))
        .send({ amount: '350', date: '2026-10-04', paymentMethod: 'UPI' })
        .expect(200)
    ).body.data.transaction as TransactionDetail;
    // The time of day is kept when only the date changes.
    expect(moved).toMatchObject({
      amountPaise: 35000,
      date: '2026-10-04T04:00:00.000Z',
      paymentMethod: 'UPI',
    });

    const flipped = (
      await request(app)
        .patch(`/api/transactions/${tx.id}`)
        .set(auth(token))
        .send({ flow: 'IN' })
        .expect(200)
    ).body.data.transaction as TransactionDetail;
    expect(flipped).toMatchObject({ flow: 'IN', type: 'CREDIT' });

    const imported = await prisma.transaction.create({
      data: {
        userId,
        transactionDate: new Date('2026-10-01T06:30:00Z'),
        amount: '99',
        transactionType: 'DEBIT',
        flow: 'OUT',
        source: 'CSV',
      },
    });
    const refused = await request(app)
      .patch(`/api/transactions/${imported.id}`)
      .set(auth(token))
      .send({ amount: '1' })
      .expect(400);
    expect(refused.body.error.message).toMatch(/Only payments you added yourself/);
    // Payment method can be set on any transaction.
    await request(app)
      .patch(`/api/transactions/${imported.id}`)
      .set(auth(token))
      .send({ paymentMethod: 'CARD' })
      .expect(200);
  });
});

describe('GET /api/transactions/export', () => {
  it('exports every match as CSV that MoneyLens can import again', async () => {
    const { accessToken: token } = await registerUser(app);
    await add(token, {
      date: '2026-10-05',
      time: '18:45',
      amount: '1250.5',
      flow: 'OUT',
      merchantName: 'Kirana, "Sharma" & sons',
      notes: '=HYPERLINK("x")',
    }).expect(201);
    await add(token, {
      date: '2026-09-30',
      amount: '50000',
      flow: 'IN',
      merchantName: 'Salary',
    }).expect(201);

    const all: TransactionCsvExport = (
      await request(app).get('/api/transactions/export').set(auth(token)).expect(200)
    ).body.data;
    expect(all.count).toBe(2);
    expect(all.filename).toMatch(/^moneylens-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = all.csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'Date,Time,Merchant,Description,Category,Subcategory,Kind,Dr/Cr,Amount,Payment method,UPI ID,Reference,Notes,Source',
    );
    expect(lines[1]).toContain('2026-10-05,18:45,"Kirana, ""Sharma"" & sons"');
    expect(lines[1]).toContain(',Dr,1250.50,Cash,');
    // Formula-looking text is defused.
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain(',Cr,50000.00,');

    const october: TransactionCsvExport = (
      await request(app)
        .get('/api/transactions/export?from=2026-10-01&to=2026-10-31')
        .set(auth(token))
        .expect(200)
    ).body.data;
    expect(october.count).toBe(1);
    expect(october.filename).toBe('moneylens-transactions-2026-10-01-to-2026-10-31.csv');

    // The export reads back through the CSV import.
    const upload = await request(app)
      .post('/api/imports')
      .set(auth(token))
      .attach('file', Buffer.from(all.csv), 'export.csv')
      .expect(201);
    const rows = upload.body.data.rows as { amountPaise: number; flow: string; decision: string }[];
    expect(rows.map((r) => [r.amountPaise, r.flow])).toEqual(
      expect.arrayContaining([
        [125050, 'OUT'],
        [5000000, 'IN'],
      ]),
    );
    // And it knows they are already there.
    expect(rows.every((r) => r.decision === 'DUPLICATE')).toBe(true);
  });
});
