import { parse } from 'csv-parse/sync';
import { parseTable } from './tabular';
import {
  StatementParseError,
  type ParseResult,
  type TransactionParser,
  type UploadedFile,
} from './types';

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 20).join('\n');
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLines.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function decode(buffer: Buffer): string {
  if (buffer.includes(0)) {
    throw new StatementParseError('This file does not look like a CSV text file.');
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return text.replace(/^\uFEFF/, '');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Cell text from HTML or XML: tags removed, entities decoded, spaces collapsed. */
function cellText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code =
          name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : ' ';
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** A web page or Excel 2003 XML saved with a ".xls" name, as many banks send. */
export function isMarkupTable(text: string): boolean {
  const head = text.slice(0, 4096).trimStart().toLowerCase();
  return (
    /^<(!doctype|html|table|\?xml|meta|head|body|style|div)/.test(head) &&
    /<(table|tr|row)[\s>]/i.test(text)
  );
}

/**
 * Rows of every table in an HTML page, or of an Excel 2003 XML workbook
 * (Row/Cell elements). Nested tables are flattened row by row.
 */
export function markupRows(text: string): string[][] {
  const xml = /<Workbook[\s>]/i.test(text) && /<Row[\s>]/i.test(text);
  const rowPattern = xml ? /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi : /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = xml
    ? /<Cell\b([^>]*)>([\s\S]*?)<\/Cell>|<Cell\b([^>]*)\/>/gi
    : /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  const rows: string[][] = [];
  for (const row of text.matchAll(rowPattern)) {
    const cells: string[] = [];
    for (const cell of (row[1] ?? '').matchAll(cellPattern)) {
      const attrs = cell[1] ?? cell[3] ?? '';
      if (xml) {
        // ss:Index skips empty cells (1-based).
        const index = /ss:Index="(\d+)"/i.exec(attrs);
        while (index && cells.length < Number(index[1]) - 1 && cells.length < 200) cells.push('');
      }
      cells.push(cellText(cell[2] ?? ''));
      if (!xml) {
        const span = Number(/colspan="?(\d+)/i.exec(attrs)?.[1] ?? 1);
        for (let i = 1; i < Math.min(span, 50); i += 1) cells.push('');
      }
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

/**
 * Generic CSV statement parser. Finds the header row (exports often start with
 * account details), maps columns by common header names, and supports either a
 * single signed amount column (optionally with a Dr/Cr column) or separate
 * debit and credit columns.
 */
export class CsvTransactionParser implements TransactionParser {
  readonly name = 'csv@1';
  readonly source = 'CSV' as const;

  canParse(file: UploadedFile): number {
    const ext = file.filename.toLowerCase().split('.').pop();
    if (ext === 'csv') return 0.9;
    // Text downloads with other names: HDFC's ".txt", SBI's tab-separated
    // ".xls" and web-page ".xls" files. The upload checks they are text.
    if (ext === 'txt' || ext === 'xls') return 0.7;
    if (file.mimeType === 'text/csv') return 0.8;
    return 0;
  }

  async parse(file: UploadedFile): Promise<ParseResult> {
    const text = decode(file.buffer);
    if (isMarkupTable(text)) {
      const records = markupRows(text);
      if (records.length === 0) throw new StatementParseError('No table was found in this file.');
      const { rows, warnings } = parseTable(
        records,
        records.map((_, i) => i + 1),
        file.mapping,
      );
      return { parserName: 'html-table@1', source: this.source, rows, warnings };
    }
    let records: string[][];
    let lineNumbers: number[];
    try {
      const parsed = parse(text, {
        delimiter: detectDelimiter(text),
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        info: true,
      }) as unknown as { record: string[]; info: { lines: number } }[];
      records = parsed.map((p) => p.record);
      // Source line numbers, so messages match what the user sees in the file.
      lineNumbers = parsed.map((p) => p.info.lines);
    } catch {
      throw new StatementParseError(
        'The CSV file could not be read. Check that it is a valid CSV export.',
      );
    }

    const { rows, warnings } = parseTable(records, lineNumbers, file.mapping);
    return { parserName: this.name, source: this.source, rows, warnings };
  }
}
