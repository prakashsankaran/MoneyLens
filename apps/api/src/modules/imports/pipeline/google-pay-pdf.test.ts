import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayKeyOf } from '@moneylens/shared';
import {
  GPAY_ENTRIES,
  googlePayPdf,
  imageOnlyPdf,
  otherPdf,
} from '../../../../test/fixtures/statements';
import { GooglePayPdfParser, parseGooglePayLines } from './google-pay-pdf';
import { groupLines, type PdfLine } from './pdf-text';
import { StatementParseError } from './types';

const parser = new GooglePayPdfParser();
const pdf = (buffer: Buffer, password?: string) => ({
  filename: 'gpay.pdf',
  mimeType: 'application/pdf',
  buffer,
  password,
});
const PROTECTED = readFileSync(
  new URL('../../../../test/fixtures/gpay-protected.pdf', import.meta.url),
);

async function parseError(promise: Promise<unknown>): Promise<StatementParseError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StatementParseError);
  return err as StatementParseError;
}

describe('GooglePayPdfParser', () => {
  it('claims PDFs only', () => {
    expect(parser.canParse(pdf(Buffer.from('')))).toBeGreaterThan(0.5);
    expect(
      parser.canParse({ filename: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('') }),
    ).toBe(0);
  });

  it('reads every transaction across pages, skipping headers and footers', async () => {
    const result = await parser.parse(pdf(await googlePayPdf()));
    expect(result).toMatchObject({ parserName: 'google-pay-pdf@1', source: 'GOOGLE_PAY' });
    // Summary totals match the rows, so there is nothing to warn about.
    expect(result.warnings).toEqual([]);
    expect(result.rows).toHaveLength(GPAY_ENTRIES.length);

    const [swiggy, received, fruits, card, self] = result.rows;
    expect(swiggy).toMatchObject({
      amountPaise: 45_000,
      flow: 'OUT',
      type: 'DEBIT',
      counterparty: 'Swiggy',
      description: 'Paid to Swiggy',
      reference: '424698765432',
    });
    // 09:15 IST on 1 Sep.
    expect(swiggy!.date.toISOString()).toBe('2026-09-01T03:45:00.000Z');
    expect(received).toMatchObject({ amountPaise: 2_50_000, flow: 'IN', type: 'CREDIT' });
    expect(received!.counterparty).toBe('Arjun Mehta');
    // A payee name wrapped over two lines is joined.
    expect(fruits).toMatchObject({
      amountPaise: 1_21_050,
      counterparty: 'Sri Venkateshwara Fresh Fruits And Vegetables Store',
    });
    expect(dayKeyOf(fruits!.date)).toBe('2026-09-03');
    // A payee whose name contains "Bank" is not mistaken for the account line.
    expect(card).toMatchObject({ counterparty: 'HDFC Bank Credit Card', flow: 'OUT' });
    expect(self).toMatchObject({ type: 'SELF_TRANSFER', flow: 'OUT' });
    // Contact details from the page header never leak into rows.
    const text = JSON.stringify(result.rows);
    expect(text).not.toMatch(/Asha|98765 43210|example\.com|Page \d/);
  });

  it('warns when the rows do not add up to the statement summary', async () => {
    const result = await parser.parse(
      pdf(await googlePayPdf({ summary: { sent: 'Rs.20,000.00', received: 'Rs.2,500.00' } })),
    );
    expect(result.rows).toHaveLength(GPAY_ENTRIES.length);
    expect(result.warnings.join(' ')).toMatch(/summary says ₹20,000\.00 sent.*₹16,660\.50 sent/);
  });

  it('says when the summary is missing', async () => {
    const result = await parser.parse(pdf(await googlePayPdf({ summary: null })));
    expect(result.warnings.join(' ')).toMatch(/summary was not found/);
  });

  it('asks for the password of a protected PDF and never accepts a wrong one', async () => {
    expect((await parseError(parser.parse(pdf(PROTECTED)))).reason).toBe('PASSWORD_REQUIRED');
    expect((await parseError(parser.parse(pdf(PROTECTED, 'wrong')))).reason).toBe(
      'PASSWORD_INCORRECT',
    );
    const result = await parser.parse(pdf(PROTECTED, 'ASHA0101'));
    expect(result.rows).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('explains PDFs it cannot use', async () => {
    const other = await parseError(parser.parse(pdf(await otherPdf())));
    expect(other.message).toMatch(/does not look like a Google Pay statement/);
    expect(other.reason).toBe('UNREADABLE');
    expect((await parseError(parser.parse(pdf(await imageOnlyPdf())))).message).toMatch(/scanned/);
    expect((await parseError(parser.parse(pdf(Buffer.from('%PDF-1.7 broken'))))).message).toMatch(
      /could not be read/,
    );
  });
});

const line = (y: number, ...items: [number, string][]): PdfLine => ({
  page: 1,
  y,
  items: items.map(([x, text]) => ({ x, text })),
});
const HEADER = line(10, [40, 'Date & time'], [160, 'Transaction details'], [500, 'Amount']);

describe('parseGooglePayLines', () => {
  it('takes direction from the account line when the wording is new', () => {
    const { rows } = parseGooglePayLines([
      HEADER,
      line(30, [40, '07 Sep, 2026'], [160, 'Cashback won'], [490, '₹25']),
      line(42, [40, '10:00 AM'], [160, 'UPI Transaction ID: 99887766'], [490, '']),
      line(54, [160, 'Paid to HDFC Bank 1234']),
    ]);
    expect(rows[0]).toMatchObject({ amountPaise: 2_500, flow: 'IN', reference: '99887766' });
    expect(rows[0]!.warnings[0]).toMatch(/direction taken from the account line/);
  });

  it('skips a transaction without an amount and says so', () => {
    const { rows, warnings } = parseGooglePayLines([
      HEADER,
      line(30, [40, '07 Sep, 2026'], [160, 'Paid to Zepto']),
      line(42, [40, '10:00 AM'], [160, 'Paid by HDFC Bank 1234']),
      line(60, [40, '08 Sep, 2026'], [160, 'Paid to Blinkit'], [495, '₹ 310.00']),
      line(72, [40, '11:00 AM'], [160, 'Paid by HDFC Bank 1234']),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ counterparty: 'Blinkit', amountPaise: 31_000 });
    expect(warnings[0]).toMatch(/Transaction 1 skipped: no amount/);
  });

  it('stops a transaction at text that is not part of the table', () => {
    const { rows } = parseGooglePayLines([
      HEADER,
      line(30, [40, '07 Sep, 2026'], [160, 'Paid to Zepto'], [495, '₹99']),
      line(42, [40, '10:00 AM'], [160, 'UPI Transaction ID: 123456789']),
      line(54, [160, 'Paid by HDFC Bank 1234']),
      line(80, [160, 'Note: amounts include taxes']),
    ]);
    expect(rows[0]!.description).toBe('Paid to Zepto');
  });
});

describe('groupLines', () => {
  it('orders words top to bottom and joins words on the same baseline', () => {
    const lines = groupLines(1, 800, [
      { str: 'Amount', transform: [1, 0, 0, 1, 500, 700.5] },
      { str: 'Date', transform: [1, 0, 0, 1, 40, 700] },
      { str: 'first', transform: [1, 0, 0, 1, 40, 750] },
      { str: ' ', transform: [1, 0, 0, 1, 60, 650] },
    ]);
    expect(lines.map((l) => l.items.map((i) => i.text))).toEqual([['first'], ['Date', 'Amount']]);
  });
});
