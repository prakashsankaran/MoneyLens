import { describe, expect, it } from 'vitest';
import { dayKeyOf } from '@moneylens/shared';
import {
  googlePayPdf,
  hdfcStatementPdf,
  otherPdf,
  paytmStatementPdf,
  phonePeStatementPdf,
} from '../../../../test/fixtures/statements';
import { PdfStatementParser } from './pdf-statement';
import { parseStatementTableLines } from './pdf-table';
import type { PdfLine } from './pdf-text';
import { StatementParseError } from './types';

const parser = new PdfStatementParser();
const read = async (buffer: Buffer) =>
  parser.parse({ filename: 'statement.pdf', mimeType: 'application/pdf', buffer });

/** A hand-built line: [x, text] pairs. */
const line = (page: number, y: number, ...items: [number, string][]): PdfLine => ({
  page,
  y,
  items: items.map(([x, text]) => ({ x, text })),
});

describe('bank statement PDFs', () => {
  it('reads an HDFC style statement across pages, with wrapped headings and narrations', async () => {
    const result = await read(await hdfcStatementPdf());
    expect(result).toMatchObject({ parserName: 'pdf-table@1:hdfc', source: 'PDF' });
    // The running balance adds up, so nothing to warn about.
    expect(result.warnings).toEqual([]);
    expect(result.rows.map((r) => [dayKeyOf(r.date), r.amountPaise, r.flow])).toEqual([
      ['2026-10-01', 45_000, 'OUT'],
      ['2026-10-02', 85_000_00, 'IN'],
      ['2026-10-03', 2_340_75, 'OUT'],
      ['2026-10-13', 5_000_00, 'OUT'],
      ['2026-10-15', 649_00, 'OUT'],
      ['2026-10-16', 300_00, 'IN'],
    ]);
    const [swiggy, salary, , , netflix, refund] = result.rows;
    // The second narration line joins the first.
    expect(swiggy?.description).toBe(
      'UPI-SWIGGY-SWIGGY@ICICI-ICIC0000001 -424512345678-PAYMENT FROM PHONE',
    );
    expect(swiggy).toMatchObject({ reference: '424512345678', upiId: 'swiggy@icici' });
    expect(salary).toMatchObject({ type: 'CREDIT', reference: 'N275262612345' });
    expect(netflix?.upiId).toBe('netflix@hdfcbank');
    expect(refund?.type).toBe('REFUND');
  });

  it('reports rows that do not add up with the running balance', () => {
    const lines = [
      line(
        1,
        100,
        [40, 'Txn Date'],
        [100, 'Description'],
        [400, 'Debit'],
        [480, 'Credit'],
        [560, 'Balance'],
      ),
      line(1, 120, [40, '01-10-2026'], [100, 'ATM WDL'], [400, '1,000.00'], [560, '9,000.00']),
      line(1, 135, [40, '02-10-2026'], [100, 'BY TRANSFER'], [480, '500.00'], [560, '9,700.00']),
    ];
    const { rows, warnings } = parseStatementTableLines(lines);
    expect(rows).toHaveLength(2);
    expect(warnings.join(' ')).toMatch(/1 row does not add up with the running balance/);
  });

  it('takes a missing direction from the running balance', () => {
    const lines = [
      line(1, 100, [40, 'Date'], [100, 'Particulars'], [400, 'Amount'], [560, 'Balance']),
      line(1, 120, [40, '01/10/2026'], [100, 'Opening balance'], [560, '10,000.00']),
      line(
        1,
        135,
        [40, '02/10/2026'],
        [100, 'NEFT FROM ACME'],
        [400, '2,500.00'],
        [560, '12,500.00'],
      ),
      line(
        1,
        150,
        [40, '03/10/2026'],
        [100, 'BILLDESK ELECTRICITY'],
        [400, '1,500.00'],
        [560, '11,000.00'],
      ),
    ];
    const { rows, warnings } = parseStatementTableLines(lines);
    expect(rows.map((r) => [r.amountPaise, r.flow])).toEqual([
      [2_500_00, 'IN'],
      [1_500_00, 'OUT'],
    ]);
    // The opening balance settles the first row.
    expect(warnings).toEqual([]);
  });

  it('reads newest-first statements with Dr/Cr suffixes', () => {
    const lines = [
      line(
        1,
        100,
        [40, 'Tran Date'],
        [100, 'Particulars'],
        [420, 'Amount'],
        [520, 'Dr/Cr'],
        [600, 'Balance'],
      ),
      line(
        1,
        120,
        [40, '05-10-2026'],
        [100, 'UPI/ZEPTO/zepto@ybl'],
        [420, '250.00'],
        [520, 'DR'],
        [600, '4,750.00'],
      ),
      line(
        1,
        135,
        [40, '04-10-2026'],
        [100, 'UPI/MEERA/meera@okhdfc'],
        [420, '1,000.00'],
        [520, 'CR'],
        [600, '5,000.00'],
      ),
      line(
        1,
        150,
        [40, '03-10-2026'],
        [100, 'CHARGES'],
        [420, '4,000.00'],
        [520, 'DR'],
        [600, '4,000.00'],
      ),
    ];
    const { rows, warnings } = parseStatementTableLines(lines);
    expect(rows.map((r) => r.flow)).toEqual(['OUT', 'IN', 'OUT']);
    expect(warnings).toEqual([]);
  });

  it('says so when a PDF has no transaction table', async () => {
    const err = await read(await otherPdf()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StatementParseError);
    expect((err as Error).message).toMatch(/could not find the transaction table/);
  });
});

describe('wallet statement PDFs', () => {
  it('reads a PhonePe statement with times, UTR numbers and a Type column', async () => {
    const result = await read(await phonePeStatementPdf());
    expect(result).toMatchObject({ parserName: 'pdf-table@1:phonepe', source: 'PDF' });
    expect(result.rows).toHaveLength(3);
    const [swiggy, ravi, blinkit] = result.rows;
    expect(swiggy).toMatchObject({
      amountPaise: 45_000,
      flow: 'OUT',
      description: 'Paid to Swiggy',
      counterparty: 'Swiggy',
      reference: '424512345678',
    });
    // 09:15 IST on 1 Oct.
    expect(swiggy?.date.toISOString()).toBe('2026-10-01T03:45:00.000Z');
    expect(ravi).toMatchObject({ amountPaise: 1_200_00, flow: 'IN', counterparty: 'Ravi Kumar' });
    expect(blinkit).toMatchObject({ amountPaise: 836_50, flow: 'OUT' });
    expect(result.warnings).toEqual([]);
  });

  it('reads a Paytm statement with signed amounts, not as Google Pay', async () => {
    const result = await read(await paytmStatementPdf());
    expect(result).toMatchObject({ parserName: 'pdf-table@1:paytm', source: 'PDF' });
    expect(result.rows.map((r) => [r.amountPaise, r.flow, r.counterparty])).toEqual([
      [380_00, 'OUT', 'Zomato'],
      [2_000_00, 'IN', 'Meera'],
    ]);
    expect(result.rows[0]).toMatchObject({ upiId: 'zomato@paytm', reference: '424512345111' });
    expect(result.rows[0]?.description).toBe('Paid to Zomato');
  });

  it('accepts amounts written with the rupee sign', () => {
    const lines = [
      line(1, 100, [40, 'Date'], [170, 'Transaction Details'], [560, 'Type'], [660, 'Amount']),
      line(1, 120, [40, 'Oct 07, 2026'], [170, 'Paid to Uber'], [560, 'DEBIT'], [670, '₹312.40']),
    ];
    expect(parseStatementTableLines(lines).rows[0]).toMatchObject({
      amountPaise: 312_40,
      flow: 'OUT',
    });
  });

  it('still reads Google Pay statements with the Google Pay reader', async () => {
    const result = await read(await googlePayPdf());
    expect(result).toMatchObject({ parserName: 'google-pay-pdf@1', source: 'GOOGLE_PAY' });
  });
});
