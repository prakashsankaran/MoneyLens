import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayKeyOf, istDate } from '@moneylens/shared';
import { CsvTransactionParser } from './csv-parser';
import { StatementParseError } from './types';

const parser = new CsvTransactionParser();
const fixture = (name: string) => ({
  filename: name,
  mimeType: 'text/csv',
  buffer: readFileSync(new URL(`../../../../test/fixtures/${name}`, import.meta.url)),
});
const csv = (text: string, filename = 'statement.csv') => ({
  filename,
  mimeType: 'text/csv',
  buffer: Buffer.from(text, 'utf8'),
});

describe('CsvTransactionParser.canParse', () => {
  it('accepts .csv files and rejects others', () => {
    expect(parser.canParse(csv('', 'a.CSV'))).toBeGreaterThan(0.5);
    expect(
      parser.canParse({ filename: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('') }),
    ).toBe(0);
  });
});

describe('bank export with separate debit/credit columns and a preamble', () => {
  it('finds the header, parses Indian amounts and skips summary rows', async () => {
    const result = await parser.parse(fixture('hdfc-style.csv'));
    expect(result.rows).toHaveLength(6);
    const [salary, rent, swiggy, coffee, refund, sip] = result.rows;
    expect(salary).toMatchObject({ amountPaise: 14_500_000, flow: 'IN', type: 'CREDIT' });
    expect(dayKeyOf(salary!.date)).toBe('2026-09-01');
    expect(rent).toMatchObject({
      amountPaise: 3_200_000,
      flow: 'OUT',
      upiId: 'landlord.demo@okaxis',
    });
    expect(swiggy).toMatchObject({ amountPaise: 45_200, reference: '0000424698765432' });
    expect(coffee).toMatchObject({ amountPaise: 31_050 });
    expect(refund).toMatchObject({ amountPaise: 129_900, flow: 'IN', type: 'REFUND' });
    expect(sip).toMatchObject({ amountPaise: 1_000_000, flow: 'OUT' });
    expect(result.rows.map((r) => r.rowIndex)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(result.warnings).toEqual([]);
  });
});

describe('signed single amount column', () => {
  it('uses the sign for direction, keeps times, and reports bad lines', async () => {
    const result = await parser.parse(fixture('signed-amount.csv'));
    expect(result.rows.map((r) => [r.flow, r.type, r.amountPaise])).toEqual([
      ['OUT', 'DEBIT', 24_500],
      ['OUT', 'DEBIT', 61_240],
      ['IN', 'CASHBACK', 2_500],
      ['OUT', 'SELF_TRANSFER', 2_000_000],
    ]);
    expect(result.rows[0]!.date).toEqual(istDate(2026, 9, 2, 8, 15));
    expect(result.rows[0]!.upiId).toBe('twc.demo@ybl');
    expect(result.warnings).toContain('Line 6 skipped: unreadable date "2026-09-31".');
  });

  it('warns when direction cannot be known', async () => {
    const result = await parser.parse(
      csv('Date,Description,Amount\n01/09/2026,Shop,100\n02/09/2026,Shop,200\n'),
    );
    expect(result.rows.every((r) => r.flow === 'OUT')).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/treated as money out/);
    expect(result.warnings).toContain('Dates were read as day/month/year.');
  });
});

describe('amount with Dr/Cr column', () => {
  it('reads month-name dates and direction markers', async () => {
    const result = await parser.parse(fixture('dr-cr-column.csv'));
    expect(
      result.rows.map((r) => [dayKeyOf(r.date), r.flow, r.type, r.amountPaise, r.reference]),
    ).toEqual([
      ['2026-09-03', 'OUT', 'DEBIT', 38_900, 'UTR1234567890'],
      ['2026-09-04', 'IN', 'REFUND', 105_000, 'UTR1234567891'],
      ['2026-09-06', 'OUT', 'DEBIT', 164_000, 'UTR1234567892'],
    ]);
  });
});

describe('edge cases', () => {
  it('handles a UTF-8 BOM, semicolons, quotes and blank lines', async () => {
    const text = '﻿Date;Narration;Debit;Credit\n\n"01/09/2026";"Cafe; ""Corner""";"150,00";\n';
    // European decimal comma is not supported: the amount is read as 15000 and must be reviewed.
    const result = await parser.parse(csv(text));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.description).toBe('Cafe; "Corner"');
  });

  it('rejects binary files', async () => {
    await expect(parser.parse(csv('PK\u0003\u0004\u0000\u0000binary'))).rejects.toBeInstanceOf(
      StatementParseError,
    );
  });

  it('rejects files without recognisable headings', async () => {
    await expect(parser.parse(csv('foo,bar\n1,2\n'))).rejects.toThrow(/column headings/);
  });

  it('skips rows without an amount', async () => {
    const result = await parser.parse(
      csv('Date,Description,Debit,Credit\n01/09/2026,Nothing,,\n02/09/2026,Tea,20,\n'),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.warnings).toContain('Line 2 skipped: no amount.');
  });

  it('summarises when many lines are skipped', async () => {
    const lines = Array.from({ length: 15 }, (_, i) => `bad-${i},Thing,10,`).join('\n');
    const result = await parser.parse(
      csv(`Date,Description,Debit,Credit\n${lines}\n01/09/2026,Tea,20,\n`),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.warnings).toContain('5 more lines were skipped.');
    expect(result.warnings.filter((w) => w.startsWith('Line '))).toHaveLength(10);
  });
});
