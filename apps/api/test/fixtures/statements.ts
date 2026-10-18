/**
 * Synthetic statement files built at test time. Names, amounts, phone
 * numbers and references are invented; the Google Pay layout follows public
 * descriptions of the statement, not a real user's file.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';

export interface GPayEntry {
  date: string; // "01 Sep, 2026"
  time: string; // "12:30 PM"
  /** Lines of the details column before the UPI Transaction ID. */
  action: string[];
  reference?: string;
  bank: string; // "Paid by HDFC Bank 1234"
  amount: string; // "Rs.450.00" (standard PDF fonts cannot draw the rupee sign)
}

export const GPAY_ENTRIES: GPayEntry[] = [
  {
    date: '01 Sep, 2026',
    time: '09:15 AM',
    action: ['Paid to Swiggy'],
    reference: '424698765432',
    bank: 'Paid by HDFC Bank 1234',
    amount: 'Rs.450.00',
  },
  {
    date: '02 Sep, 2026',
    time: '06:40 PM',
    action: ['Received from Arjun Mehta'],
    reference: '424698765433',
    bank: 'Paid to HDFC Bank 1234',
    amount: 'Rs.2,500.00',
  },
  {
    date: '03 Sep, 2026',
    time: '08:05 PM',
    action: ['Paid to Sri Venkateshwara Fresh Fruits', 'And Vegetables Store'],
    reference: '424698765434',
    bank: 'Paid by HDFC Bank 1234',
    amount: 'Rs.1,210.50',
  },
  {
    date: '04 Sep, 2026',
    time: '11:00 AM',
    action: ['Paid to HDFC Bank Credit Card'],
    reference: '424698765435',
    bank: 'Paid by HDFC Bank 1234',
    amount: 'Rs.10,000.00',
  },
  {
    date: '05 Sep, 2026',
    time: '07:30 AM',
    action: ['Self transfer to ICICI Bank 9876'],
    reference: '424698765436',
    bank: 'Paid by HDFC Bank 1234',
    amount: 'Rs.5,000.00',
  },
];

interface GPayOptions {
  entries?: GPayEntry[];
  /** Transactions per page; later ones go on the next page. */
  perPage?: number;
  /** Summary totals; omitted when null. */
  summary?: { sent: string; received: string } | null;
}

/** A Google Pay style statement PDF. */
export async function googlePayPdf(opts: GPayOptions = {}): Promise<Buffer> {
  const entries = opts.entries ?? GPAY_ENTRIES;
  const perPage = opts.perPage ?? 3;
  const summary =
    opts.summary === undefined ? { sent: 'Rs.16,660.50', received: 'Rs.2,500.00' } : opts.summary;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = Math.max(1, Math.ceil(entries.length / perPage));

  for (let p = 0; p < pages; p += 1) {
    const page = doc.addPage([595, 842]);
    const text = (s: string, x: number, top: number, size = 9) =>
      page.drawText(s, { x, y: 842 - top, size, font });

    // Header with the account holder's (invented) details.
    text('Transaction statement', 40, 50, 14);
    text('Asha Verma', 40, 70);
    text('+91 98765 43210', 40, 82);
    text('asha.verma@example.com', 40, 94);
    if (p === 0) {
      text('Transaction statement period 01 September 2026 - 30 September 2026', 40, 112);
      if (summary) {
        text('Sent', 40, 130);
        text(summary.sent, 40, 142);
        text('Received', 200, 130);
        text(summary.received, 200, 142);
      }
    }
    // Column headings, as separate words the way some PDF writers emit them.
    let top = 170;
    text('Date', 40, top);
    text('&', 62, top);
    text('time', 72, top);
    text('Transaction', 160, top);
    text('details', 210, top);
    text('Amount', 500, top);
    top += 22;

    for (const e of entries.slice(p * perPage, (p + 1) * perPage)) {
      text(e.date, 40, top);
      text(e.action[0] ?? '', 160, top);
      text(e.amount, 490, top);
      top += 12;
      e.action.slice(1).forEach((line, i) => {
        if (i === 0) text(e.time, 40, top);
        text(line, 160, top);
        top += 12;
      });
      if (e.action.length === 1) text(e.time, 40, top);
      if (e.reference) {
        text(`UPI Transaction ID: ${e.reference}`, 160, top);
        top += 12;
      }
      text(e.bank, 160, top);
      top += 24;
    }
    text(`Page ${p + 1} of ${pages}`, 270, 810, 8);
    text('Note: This statement reflects payments made through Google Pay.', 40, 822, 7);
  }
  return Buffer.from(await doc.save());
}

/** A PDF with text that is not a Google Pay statement. */
export async function otherPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('Electricity bill for September 2026', { x: 50, y: 700, font, size: 12 });
  return Buffer.from(await doc.save());
}

/** A PDF page with no text at all, like a scan. */
export async function imageOnlyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage().drawRectangle({ x: 50, y: 50, width: 200, height: 100 });
  return Buffer.from(await doc.save());
}

export async function xlsx(sheets: { name: string; data: SheetData }[]): Promise<Buffer> {
  return writeXlsxFile(sheets.map((s) => ({ sheet: s.name, data: s.data }))).toBuffer();
}

const d = (iso: string) => ({ value: new Date(`${iso}T00:00:00.000Z`), format: 'dd/mm/yyyy' });

/** A bank-style workbook: a cover sheet, then a sheet with a preamble and the table. */
export function bankWorkbook(): Promise<Buffer> {
  return xlsx([
    { name: 'Cover', data: [['Statement of account'], ['Generated for testing']] },
    {
      name: 'Transactions',
      data: [
        ['Account Number', 'XXXXXXXX4321'],
        [],
        ['Txn Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Chq./Ref.No.'],
        [d('2026-09-01'), 'UPI-SWIGGY-swiggy@icici-424698765432', 452, null, '424698765432'],
        [d('2026-09-02'), 'NEFT-ACME TECHNOLOGIES-SALARY', null, 145000, 'N000111'],
        [d('2026-09-03'), 'POS AMAZON PAY INDIA', 1299.5, null, ''],
        ['Total', '', 1751.5, 145000, ''],
      ],
    },
  ]);
}

/** A workbook whose headings MoneyLens does not recognise. */
export function unlabelledWorkbook(): Promise<Buffer> {
  return xlsx([
    {
      name: 'Sheet1',
      data: [
        ['When', 'What', 'How much'],
        [d('2026-09-01'), 'Swiggy order', -452],
        [d('2026-09-02'), 'Salary', 145000],
      ],
    },
  ]);
}

/** One printed line of a table statement: text at x, or right-aligned to `right`. */
type Cell = { text: string; x: number } | { text: string; right: number };

/**
 * A statement PDF laid out as a table, the way banks, PhonePe and Paytm
 * print them. Each entry of `lines` is one printed line; `gap` adds space
 * above it. All names and numbers are invented.
 */
async function tablePdf(
  pages: { preamble: string[]; heading: Cell[][]; lines: { cells: Cell[]; gap?: number }[] }[],
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage([842, 595]);
    const draw = (cell: Cell, top: number, size = 8) => {
      const x = 'x' in cell ? cell.x : cell.right - font.widthOfTextAtSize(cell.text, size);
      page.drawText(cell.text, { x, y: 595 - top, size, font });
    };
    let top = 40;
    for (const line of spec.preamble) {
      draw({ text: line, x: 40 }, top, 10);
      top += 14;
    }
    top += 10;
    for (const row of spec.heading) {
      for (const cell of row) draw(cell, top);
      top += 10;
    }
    top += 8;
    for (const line of spec.lines) {
      top += line.gap ?? 0;
      for (const cell of line.cells) draw(cell, top);
      top += 11;
    }
    draw(
      { text: 'This is a computer generated statement and does not need a signature.', x: 40 },
      570,
      7,
    );
  }
  return Buffer.from(await doc.save());
}

/** An HDFC Bank style account statement: withdrawal, deposit and balance columns. */
export function hdfcStatementPdf(): Promise<Buffer> {
  const heading: Cell[][] = [
    [
      { text: 'Date', x: 40 },
      { text: 'Narration', x: 95 },
      { text: 'Chq./Ref.No.', x: 330 },
      { text: 'Value Dt', x: 430 },
      { text: 'Withdrawal', x: 500 },
      { text: 'Deposit', x: 590 },
      { text: 'Closing', x: 680 },
    ],
    [
      { text: 'Amt.', x: 500 },
      { text: 'Amt.', x: 590 },
      { text: 'Balance', x: 680 },
    ],
  ];
  const row = (
    date: string,
    narration: string,
    ref: string,
    withdrawal: string,
    deposit: string,
    balance: string,
  ): Cell[] => [
    { text: date, x: 40 },
    { text: narration, x: 95 },
    { text: ref, x: 330 },
    { text: date, x: 430 },
    ...(withdrawal ? [{ text: withdrawal, right: 560 }] : []),
    ...(deposit ? [{ text: deposit, right: 650 }] : []),
    { text: balance, right: 750 },
  ];
  return tablePdf([
    {
      preamble: [
        'HDFC BANK LTD',
        'Statement of account',
        'MR ASHA VERMA',
        'Account No : XXXXXXXX1234',
      ],
      heading,
      lines: [
        {
          cells: [
            { text: 'Opening Balance', x: 95 },
            { text: '20,000.00', right: 750 },
          ],
        },
        {
          cells: row(
            '01/10/26',
            'UPI-SWIGGY-SWIGGY@ICICI-ICIC0000001',
            '0000424512345678',
            '450.00',
            '',
            '19,550.00',
          ),
          gap: 4,
        },
        { cells: [{ text: '-424512345678-PAYMENT FROM PHONE', x: 95 }] },
        {
          cells: row(
            '02/10/26',
            'NEFT CR-ACME SOFTWARE PVT LTD-SALARY OCT',
            'N275262612345',
            '',
            '85,000.00',
            '1,04,550.00',
          ),
          gap: 4,
        },
        {
          cells: row(
            '03/10/26',
            'POS 4321XXXXXXXX9876 DMART AVENUE',
            '000000000000',
            '2,340.75',
            '',
            '1,02,209.25',
          ),
          gap: 4,
        },
        {
          cells: row(
            '13/10/26',
            'ATW-4321XXXXXXXX9876-S1ANBG12-BENGALURU',
            '000000004567',
            '5,000.00',
            '',
            '97,209.25',
          ),
          gap: 4,
        },
      ],
    },
    {
      preamble: ['HDFC BANK LTD', 'Page 2'],
      heading,
      lines: [
        {
          cells: row(
            '15/10/26',
            'UPI-NETFLIX-NETFLIX@HDFCBANK-HDFC0000001',
            '0000428812345678',
            '649.00',
            '',
            '96,560.25',
          ),
          gap: 4,
        },
        {
          cells: row(
            '16/10/26',
            'UPI-RAVI KUMAR-RAVI@OKAXIS-UTIB0000001-REFUND',
            '0000429912345678',
            '',
            '300.00',
            '96,860.25',
          ),
          gap: 4,
        },
        { cells: [{ text: 'STATEMENT SUMMARY :-', x: 40 }], gap: 20 },
        {
          cells: [
            { text: 'Opening Balance', x: 40 },
            { text: 'Closing Bal', x: 300 },
          ],
        },
      ],
    },
  ]);
}

/** A PhonePe transaction statement: a Type column and multi-line details. */
export function phonePeStatementPdf(): Promise<Buffer> {
  const heading: Cell[][] = [
    [
      { text: 'Date', x: 40 },
      { text: 'Transaction Details', x: 170 },
      { text: 'Type', x: 560 },
      { text: 'Amount', x: 660 },
    ],
  ];
  const entry = (date: string, time: string, details: string[], type: string, amount: string) => [
    {
      cells: [
        { text: date, x: 40 },
        { text: details[0] ?? '', x: 170 },
        { text: type, x: 560 },
        { text: amount, right: 700 },
      ],
      gap: 8,
    },
    {
      cells: [
        { text: time, x: 40 },
        { text: details[1] ?? '', x: 170 },
      ],
    },
    ...details.slice(2).map((d) => ({ cells: [{ text: d, x: 170 }] })),
  ];
  return tablePdf([
    {
      preamble: ['Transaction Statement for 98XXXXXX10', 'Oct 01, 2026 - Oct 17, 2026', 'PhonePe'],
      heading,
      lines: [
        ...entry(
          'Oct 01, 2026',
          '09:15 am',
          [
            'Paid to Swiggy',
            'Transaction ID T2610010915123456789',
            'UTR No. 424512345678',
            'Paid by XXXXXX1234',
          ],
          'DEBIT',
          'Rs.450',
        ),
        ...entry(
          'Oct 02, 2026',
          '06:40 pm',
          [
            'Received from Ravi Kumar',
            'Transaction ID T2610021840123456789',
            'UTR No. 424612345678',
            'Credited to XXXXXX1234',
          ],
          'CREDIT',
          'Rs.1,200',
        ),
        ...entry(
          'Oct 05, 2026',
          '01:05 pm',
          [
            'Paid to Blinkit',
            'Transaction ID T2610051305123456789',
            'UTR No. 424712345678',
            'Paid by XXXXXX1234',
          ],
          'DEBIT',
          'Rs.836.50',
        ),
      ],
    },
  ]);
}

/** A Paytm UPI statement: signed amounts and a "Your Account" column. */
export function paytmStatementPdf(): Promise<Buffer> {
  const heading: Cell[][] = [
    [
      { text: 'Date & Time', x: 40 },
      { text: 'Transaction Details', x: 150 },
      { text: 'Your Account', x: 480 },
      { text: 'Amount', x: 680 },
    ],
  ];
  const entry = (
    date: string,
    time: string,
    details: string[],
    account: string,
    amount: string,
  ) => [
    {
      cells: [
        { text: date, x: 40 },
        { text: details[0] ?? '', x: 150 },
        { text: account, x: 480 },
        { text: amount, right: 730 },
      ],
      gap: 8,
    },
    {
      cells: [
        { text: time, x: 40 },
        { text: details[1] ?? '', x: 150 },
      ],
    },
    ...details.slice(2).map((d) => ({ cells: [{ text: d, x: 150 }] })),
  ];
  return tablePdf([
    {
      preamble: ['Paytm Statement for 98XXXXXX10', "01 OCT'26 - 17 OCT'26"],
      heading,
      lines: [
        ...entry(
          '01 Oct 2026',
          '9:15 AM',
          [
            'Paid to Zomato',
            'UPI ID: zomato@paytm on 01 Oct',
            'UPI Ref No: 424512345111',
            'Tag: # Food',
          ],
          'HDFC Bank - 34',
          '- Rs.380',
        ),
        ...entry(
          '03 Oct 2026',
          '7:02 PM',
          ['Received from Meera', 'UPI ID: meera@ybl on 03 Oct', 'UPI Ref No: 424512345222'],
          'HDFC Bank - 34',
          '+ Rs.2,000',
        ),
      ],
    },
  ]);
}
