import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { addMonths, dayKeyOf } from '@moneylens/shared';
import type { CategoryNode, ImportReview, Preferences } from '@moneylens/types';
import type { MailMessage } from '../src/lib/mailer';
import { monthlySummaryJob } from '../src/modules/preferences/preferences.service';
import { createTestContext, registerUser } from './helpers';

const sent: MailMessage[] = [];
const mailer = {
  async send(message: MailMessage) {
    sent.push(message);
  },
};
const { app, prisma } = createTestContext({ APP_URL: 'https://money.example.test' }, { mailer });
const noMail = createTestContext();

afterAll(async () => {
  await prisma.$disconnect();
  await noMail.prisma.$disconnect();
});

// Last month, so added payments are never in the future.
const lastMonth = addMonths(dayKeyOf(new Date()).slice(0, 7), -1);

async function categoryId(token: string, parent: string, child: string) {
  const res = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);
  const tree = res.body.data as CategoryNode[];
  const node = tree.find((c) => c.slug === parent)?.children.find((c) => c.slug === child);
  if (!node) throw new Error(`no category ${parent}/${child}`);
  return node.id;
}

function addPayment(token: string, merchantName: string, flow: 'IN' | 'OUT', amount = '500') {
  return request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: `${lastMonth}-15`, amount, flow, merchantName })
    .expect(201);
}

describe('preferences', () => {
  it('starts with everything off', async () => {
    const { accessToken, email } = await registerUser(app);
    const res = await request(app)
      .get('/api/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data).toEqual<Preferences>({
      monthlySummary: { available: true, enabled: false, sendTo: email, lastSentFor: null },
      people: { outCategoryId: null, inCategoryId: null },
    });
  });

  it('says the monthly email is unavailable when the server has no email', async () => {
    const { accessToken } = await registerUser(noMail.app);
    const res = await request(noMail.app)
      .get('/api/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.monthlySummary.available).toBe(false);
    await request(noMail.app)
      .patch('/api/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ monthlySummaryEmail: true })
      .expect(400);
    await request(noMail.app)
      .post('/api/preferences/monthly-summary/send')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('rejects unknown categories and empty changes', async () => {
    const { accessToken } = await registerUser(app);
    await request(app)
      .patch('/api/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ peopleOutCategoryId: 'no-such-category' })
      .expect(400);
    await request(app)
      .patch('/api/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);
  });
});

describe('payments to people', () => {
  it('fills in earlier uncategorised payments to people when the category is set', async () => {
    const { accessToken } = await registerUser(app);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const family = await categoryId(accessToken, 'transfers', 'family-transfer');
    const ravi = await addPayment(accessToken, 'Ravi Kumar', 'OUT');
    const shop = await addPayment(accessToken, 'Sri Krishna Stores', 'OUT');
    const fromPerson = await addPayment(accessToken, 'Anita Desai', 'IN');

    const res = await request(app)
      .patch('/api/preferences')
      .set(auth)
      .send({ peopleOutCategoryId: family })
      .expect(200);
    expect(res.body.data.recategorised).toBe(1);
    expect(res.body.data.preferences.people).toEqual({ outCategoryId: family, inCategoryId: null });

    const get = (id: string) => request(app).get(`/api/transactions/${id}`).set(auth).expect(200);
    expect((await get(ravi.body.data.id)).body.data.subcategory?.id).toBe(family);
    expect((await get(shop.body.data.id)).body.data.category).toBeNull();
    expect((await get(fromPerson.body.data.id)).body.data.category).toBeNull();
  });

  it('categorises payments to people in new imports', async () => {
    const { accessToken } = await registerUser(app);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const family = await categoryId(accessToken, 'transfers', 'family-transfer');
    await request(app)
      .patch('/api/preferences')
      .set(auth)
      .send({ peopleOutCategoryId: family })
      .expect(200);

    const csv = [
      'Date,Narration,Withdrawal Amt.,Deposit Amt.',
      '05/09/2026,UPI/412345678901/RAVI KUMAR/ravikumar@okaxis/Payment,500.00,',
      '06/09/2026,UPI/412345678902/SRI KRISHNA STORES/q12345@ybl/Payment,250.00,',
    ].join('\n');
    const upload = await request(app)
      .post('/api/imports')
      .set(auth)
      .attach('file', Buffer.from(csv), 'people.csv')
      .expect(201);
    const review = upload.body.data as ImportReview;
    const byMerchant = new Map(review.rows.map((r) => [r.merchantName, r]));
    expect(byMerchant.get('Ravi Kumar')?.category?.id).toBe(family);
    expect(byMerchant.get('Sri Krishna Stores')?.category).toBeNull();
  });
});

describe('monthly summary email', () => {
  it('sends last month on request, with the figures and a link to the report', async () => {
    const { accessToken, email } = await registerUser(app);
    const auth = { Authorization: `Bearer ${accessToken}` };
    await addPayment(accessToken, 'Salary', 'IN', '50000');
    await addPayment(accessToken, 'Big Bazaar', 'OUT', '1200');

    const res = await request(app)
      .post('/api/preferences/monthly-summary/send')
      .set(auth)
      .expect(200);
    expect(res.body.data).toEqual({ month: lastMonth, sentTo: email });
    const mail = sent.findLast((m) => m.to === email);
    expect(mail?.subject).toMatch(/^Your MoneyLens summary for /);
    expect(mail?.text).toContain('Spent     ₹1,200');
    expect(mail?.text).toContain('Received  ₹50,000');
    expect(mail?.text).toContain(`https://money.example.test/reports?month=${lastMonth}`);

    const prefs = await request(app).get('/api/preferences').set(auth).expect(200);
    expect(prefs.body.data.monthlySummary.lastSentFor).toBe(lastMonth);
  });

  it('sends each due summary once, from 9:00 IST on the 1st', async () => {
    const { accessToken, email } = await registerUser(app);
    await addPayment(accessToken, 'Big Bazaar', 'OUT', '800');
    await request(app)
      .patch('/api/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ monthlySummaryEmail: true })
      .expect(200);

    const job = monthlySummaryJob({
      prisma,
      mailer,
      appUrl: 'https://money.example.test',
      onMailError: (err) => {
        throw err;
      },
    });
    const mine = () => sent.filter((m) => m.to === email).length;
    const month = addMonths(lastMonth, 1);
    // 08:30 IST on the 1st: too early.
    await job(new Date(`${month}-01T03:00:00Z`));
    expect(mine()).toBe(0);
    // 09:30 IST: sent, once.
    await job(new Date(`${month}-01T04:00:00Z`));
    expect(mine()).toBe(1);
    await job(new Date(`${month}-02T04:00:00Z`));
    expect(mine()).toBe(1);
  });
});
