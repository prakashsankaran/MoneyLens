import { describe, expect, it } from 'vitest';
import { dayKeyOf } from '@moneylens/shared';
import { bankWorkbook, unlabelledWorkbook, xlsx } from '../../../../test/fixtures/statements';
import { StatementParseError } from './types';
import { XlsxTransactionParser } from './xlsx-parser';

const parser = new XlsxTransactionParser();
const file = (buffer: Buffer, mapping?: Parameters<typeof parser.parse>[0]['mapping']) => ({
  filename: 'statement.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer,
  mapping,
});

describe('XlsxTransactionParser', () => {
  it('claims .xlsx files only', () => {
    expect(parser.canParse(file(Buffer.from('')))).toBeGreaterThan(0.5);
    expect(parser.canParse({ filename: 'a.xls', mimeType: '', buffer: Buffer.from('') })).toBe(0);
  });

  it('finds the sheet and heading row, and reads date and number cells', async () => {
    const result = await parser.parse(file(await bankWorkbook()));
    expect(result).toMatchObject({ parserName: 'xlsx@1', source: 'XLSX' });
    expect(result.warnings).toEqual(['Read the sheet "Transactions".']);
    expect(result.rows).toHaveLength(3);
    const [swiggy, salary, amazon] = result.rows;
    expect(swiggy).toMatchObject({
      rowIndex: 4,
      amountPaise: 45_200,
      flow: 'OUT',
      upiId: 'swiggy@icici',
      reference: '424698765432',
    });
    expect(dayKeyOf(swiggy!.date)).toBe('2026-09-01');
    expect(salary).toMatchObject({ amountPaise: 1_45_000_00, flow: 'IN', type: 'CREDIT' });
    expect(amazon).toMatchObject({ amountPaise: 1_299_50, reference: null });
  });

  it('offers a preview when the headings are not recognised, then uses the chosen columns', async () => {
    const buffer = await unlabelledWorkbook();
    const err = (await parser.parse(file(buffer)).catch((e: unknown) => e)) as StatementParseError;
    expect(err).toBeInstanceOf(StatementParseError);
    expect(err.reason).toBe('COLUMNS_NOT_FOUND');
    expect(err.preview?.[0]).toEqual(['When', 'What', 'How much']);
    expect(err.preview?.[1]?.[0]).toBe('2026-09-01');

    const result = await parser.parse(
      file(buffer, { headerRow: 0, columns: { date: 0, description: 1, amount: 2 } }),
    );
    expect(result.rows.map((r) => [r.description, r.amountPaise, r.flow])).toEqual([
      ['Swiggy order', 45_200, 'OUT'],
      ['Salary', 1_45_000_00, 'IN'],
    ]);
  });

  it('rejects a column choice that does not fit the sheet', async () => {
    const buffer = await unlabelledWorkbook();
    await expect(
      parser.parse(file(buffer, { headerRow: 0, columns: { date: 0, description: 9, amount: 2 } })),
    ).rejects.toMatchObject({ reason: 'COLUMNS_NOT_FOUND' });
    await expect(
      parser.parse(file(buffer, { headerRow: 0, columns: { date: 0, description: 0, amount: 2 } })),
    ).rejects.toMatchObject({ reason: 'COLUMNS_NOT_FOUND' });
    await expect(
      parser.parse(file(buffer, { headerRow: 0, columns: { date: 0, description: 1 } })),
    ).rejects.toMatchObject({ reason: 'COLUMNS_NOT_FOUND' });
  });

  it('explains unreadable and empty workbooks', async () => {
    await expect(parser.parse(file(Buffer.from('PK\u0003\u0004 not a zip')))).rejects.toThrow(
      /could not be read/,
    );
    await expect(parser.parse(file(await xlsx([{ name: 'Empty', data: [[]] }])))).rejects.toThrow(
      /no data/,
    );
  });
});
