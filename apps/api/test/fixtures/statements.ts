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
