import { StatementParseError } from './types';

/** One line of text on a page: its words with their x positions. */
export interface PdfLine {
  page: number;
  /** Distance from the top of the page, in PDF points. */
  y: number;
  items: { x: number; text: string }[];
}

/** Statements longer than this are not personal exports. */
export const MAX_PDF_PAGES = 200;
/** Words whose baselines are this close (points) share a line. */
const LINE_TOLERANCE = 2;

interface PositionedText {
  str: string;
  transform: number[];
}

/**
 * Group positioned text items into lines, top to bottom and left to right.
 * Pure, so the statement layout logic can be tested without a PDF.
 */
export function groupLines(page: number, height: number, items: PositionedText[]): PdfLine[] {
  const words = items
    .filter((i) => i.str.trim())
    .map((i) => ({ x: i.transform[4] ?? 0, y: height - (i.transform[5] ?? 0), text: i.str.trim() }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const w of words) {
    const last = lines.at(-1);
    if (last && Math.abs(last.y - w.y) <= LINE_TOLERANCE) last.items.push({ x: w.x, text: w.text });
    else lines.push({ page, y: w.y, items: [{ x: w.x, text: w.text }] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** pdf.js signals password problems with these codes (PasswordResponses). */
const NEED_PASSWORD = 1;
const INCORRECT_PASSWORD = 2;

/**
 * Extract positioned text lines from a PDF held in memory. The password, if
 * any, is passed straight to the PDF reader and never stored or logged.
 */
export async function extractPdfLines(buffer: Buffer, password?: string): Promise<PdfLine[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    password: password || undefined,
    // No fonts, scripts or network: we only need the text layer.
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e.name === 'PasswordException') {
      if (e.code === INCORRECT_PASSWORD || (e.code !== NEED_PASSWORD && password)) {
        throw new StatementParseError(
          'That password did not open the PDF. Check it and try again.',
          'PASSWORD_INCORRECT',
        );
      }
      throw new StatementParseError(
        'This PDF is password protected. Enter its password to read it.',
        'PASSWORD_REQUIRED',
      );
    }
    throw new StatementParseError('The PDF could not be read. It may be damaged.');
  }

  try {
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new StatementParseError(
        `This PDF has more than ${MAX_PDF_PAGES} pages. Download a shorter date range.`,
      );
    }
    const lines: PdfLine[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const { height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PositionedText[] = content.items.flatMap((i) =>
        'str' in i ? [{ str: i.str, transform: i.transform as number[] }] : [],
      );
      lines.push(...groupLines(n, height, items));
      page.cleanup();
    }
    if (lines.length === 0) {
      throw new StatementParseError(
        'This PDF has no readable text. It may be a scanned image, which MoneyLens cannot read yet.',
      );
    }
    return lines;
  } finally {
    await task.destroy();
  }
}
