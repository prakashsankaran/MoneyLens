import readXlsxFile from 'read-excel-file/node';
import { HEADER_SEARCH_ROWS, isUsableHeader, mapColumns, parseTable } from './tabular';
import {
  StatementParseError,
  type ParseResult,
  type TransactionParser,
  type UploadedFile,
} from './types';

type Cell = string | number | boolean | Date | null;

/**
 * Excel stores dates as day counts that the reader returns as UTC-midnight
 * dates; the calendar day is what the statement means, so keep that day.
 */
function cellText(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const hasTime =
      value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0 || value.getUTCSeconds() !== 0;
    const iso = value.toISOString();
    return hasTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
  }
  if (typeof value === 'number') return String(value);
  return String(value).trim();
}

/**
 * Excel (.xlsx) statements. Cells are converted to text and read with the
 * same column detection as CSV. The first sheet with recognisable headings is
 * used; with a manual column choice, the first sheet that has data.
 */
export class XlsxTransactionParser implements TransactionParser {
  readonly name = 'xlsx@1';
  readonly source = 'XLSX' as const;

  canParse(file: UploadedFile): number {
    const ext = file.filename.toLowerCase().split('.').pop();
    return ext === 'xlsx' ? 0.9 : 0;
  }

  async parse(file: UploadedFile): Promise<ParseResult> {
    let sheets: { sheet: string; data: Cell[][] }[];
    try {
      sheets = (await readXlsxFile(file.buffer)) as unknown as typeof sheets;
    } catch {
      throw new StatementParseError(
        'The Excel file could not be read. If it is password protected, remove the password or export the statement as CSV.',
      );
    }

    const tables = sheets
      .map((s) => {
        // Keep sheet row numbers (1-based) for messages, skipping blank rows.
        const records: string[][] = [];
        const lineNumbers: number[] = [];
        s.data.forEach((row, i) => {
          const cells = row.map(cellText);
          if (cells.some(Boolean)) {
            records.push(cells);
            lineNumbers.push(i + 1);
          }
        });
        return { name: s.sheet, records, lineNumbers };
      })
      .filter((t) => t.records.length > 0);

    if (tables.length === 0) throw new StatementParseError('The Excel file has no data.');

    const recognised = file.mapping
      ? undefined
      : tables.find((t) =>
          t.records.slice(0, HEADER_SEARCH_ROWS).some((r) => isUsableHeader(mapColumns(r))),
        );
    const table = recognised ?? (tables[0] as (typeof tables)[number]);
    const { rows, warnings } = parseTable(table.records, table.lineNumbers, file.mapping);
    if (tables.length > 1) warnings.unshift(`Read the sheet "${table.name.slice(0, 40)}".`);
    return { parserName: this.name, source: this.source, rows, warnings };
  }
}
