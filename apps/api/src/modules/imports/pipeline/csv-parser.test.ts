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
    expect(swiggy).toMatchObject({ amountPaise: 45_200, reference: '424698765432' });
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

  it('rejects files without recognisable headings, with a preview to choose columns', async () => {
    const err = (await parser
      .parse(csv('foo,bar\n1,2\n'))
      .catch((e: unknown) => e)) as StatementParseError;
    expect(err.message).toMatch(/column headings/);
    expect(err.reason).toBe('COLUMNS_NOT_FOUND');
    expect(err.preview).toEqual([
      ['foo', 'bar'],
      ['1', '2'],
    ]);
  });

  it('reads a file with the columns the user chose', async () => {
    const file = {
      ...csv(
        'Account XXXX1234\nOn,Note,Out,In\n05/09/2026,Chai point,20,\n06/09/2026,Refund from Myntra,,499\n',
      ),
      mapping: { headerRow: 1, columns: { date: 0, description: 1, debit: 2, credit: 3 } },
    };
    const result = await parser.parse(file);
    expect(result.rows.map((r) => [r.rowIndex, r.amountPaise, r.flow, r.type])).toEqual([
      [3, 2_000, 'OUT', 'DEBIT'],
      [4, 49_900, 'IN', 'REFUND'],
    ]);
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

describe('bank downloads that are text under another name', () => {
  it('reads an SBI style tab-separated ".xls" file', async () => {
    const text = [
      'Account Name\t:\tMRS ASHA VERMA',
      'Account Number\t:\t00000012345678901',
      '',
      'Txn Date\tValue Date\tDescription\tRef No./Cheque No.\tDebit\tCredit\tBalance',
      '1 Oct 2026\t1 Oct 2026\tBY TRANSFER-UPI/CR/424512345678/MEERA/meera@okhdfc\tTRANSFER FROM 1234\t\t1,500.00\t21,500.00',
      '2 Oct 2026\t2 Oct 2026\tTO TRANSFER-UPI/DR/424612345678/ZEPTO/zepto@ybl\tTRANSFER TO 5678\t620.00\t\t20,880.00',
    ].join('\n');
    expect(parser.canParse(csv('', 'statement.xls'))).toBeGreaterThan(0.5);
    const result = await parser.parse(csv(text, 'statement.xls'));
    expect(result.rows.map((r) => [dayKeyOf(r.date), r.amountPaise, r.flow, r.upiId])).toEqual([
      ['2026-10-01', 1_500_00, 'IN', 'meera@okhdfc'],
      ['2026-10-02', 620_00, 'OUT', 'zepto@ybl'],
    ]);
  });

  it('reads a web-page table saved as ".xls"', async () => {
    const html = `<html><head><meta charset="utf-8"><style>td{}</style></head><body>
      <table><tr><td colspan="4">Kotak Mahindra Bank &ndash; Account Statement</td></tr></table>
      <table border="1">
        <tr><th>Sl. No.</th><th>Transaction Date</th><th>Description</th><th>Chq / Ref No.</th><th>Amount</th><th>Dr / Cr</th><th>Balance</th></tr>
        <tr><td>1</td><td>03-10-2026</td><td>UPI/SWIGGY/424512345678/swiggy@icici&nbsp;</td><td>UPI-424512345678</td><td>1,250.00</td><td>DR</td><td>18,750.00</td></tr>
        <tr><td>2</td><td>04-10-2026</td><td>NEFT-ACME &amp; CO-SALARY</td><td>N27712345</td><td>90,000.00</td><td>CR</td><td>1,08,750.00</td></tr>
      </table></body></html>`;
    const result = await parser.parse(csv(html, 'Statement.xls'));
    expect(result.parserName).toBe('html-table@1');
    expect(result.rows.map((r) => [r.amountPaise, r.flow, r.description])).toEqual([
      [1_250_00, 'OUT', 'UPI/SWIGGY/424512345678/swiggy@icici'],
      [90_000_00, 'IN', 'NEFT-ACME & CO-SALARY'],
    ]);
  });

  it('reads an Excel 2003 XML workbook saved as ".xls"', async () => {
    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Statement"><Table>
  <Row><Cell><Data ss:Type="String">Transaction Date</Data></Cell><Cell><Data ss:Type="String">Transaction Remarks</Data></Cell><Cell><Data ss:Type="String">Withdrawal Amount (INR )</Data></Cell><Cell><Data ss:Type="String">Deposit Amount (INR )</Data></Cell></Row>
  <Row><Cell><Data ss:Type="String">05/10/2026</Data></Cell><Cell><Data ss:Type="String">UPI/BLINKIT/blinkit@hdfcbank</Data></Cell><Cell><Data ss:Type="Number">412.5</Data></Cell></Row>
  <Row><Cell><Data ss:Type="String">06/10/2026</Data></Cell><Cell><Data ss:Type="String">INTEREST CREDIT</Data></Cell><Cell ss:Index="4"><Data ss:Type="Number">88</Data></Cell></Row>
 </Table></Worksheet></Workbook>`;
    const result = await parser.parse(csv(xml, 'OpTransactionHistory.xls'));
    expect(result.rows.map((r) => [r.amountPaise, r.flow])).toEqual([
      [412_50, 'OUT'],
      [88_00, 'IN'],
    ]);
  });

  it("reads Paytm's columns, keeping only a UPI ID from the other-party column", async () => {
    const text = [
      'Date,Time,Transaction Details,Other Transaction Details (UPI ID or A/c No),Your Account,Amount,UPI Ref No.,Order ID,Remarks,Tags,Comment',
      '15/10/2026,10:30:12,Paid to Swiggy,swiggy@paytm,HDFC Bank - 34,"-450",424512345678,,,#Food,',
      '16/10/2026,18:02:40,Received from Meera,XXXXXX1234,HDFC Bank - 34,"+2,000",424612345678,,,,',
    ].join('\n');
    const result = await parser.parse(csv(text, 'Paytm_UPI_Statement.csv'));
    expect(result.rows.map((r) => [r.amountPaise, r.flow, r.upiId, r.reference])).toEqual([
      [450_00, 'OUT', 'swiggy@paytm', '424512345678'],
      [2_000_00, 'IN', null, '424612345678'],
    ]);
  });
});
