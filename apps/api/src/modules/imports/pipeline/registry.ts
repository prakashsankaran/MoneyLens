import { CsvTransactionParser } from './csv-parser';
import { PdfStatementParser } from './pdf-statement';
import { XlsxTransactionParser } from './xlsx-parser';
import type { TransactionParser, UploadedFile } from './types';

/**
 * Registered statement parsers. New sources are added here; the rest of the
 * pipeline is unchanged.
 */
export const PARSERS: TransactionParser[] = [
  new CsvTransactionParser(),
  new XlsxTransactionParser(),
  new PdfStatementParser(),
];

export function selectParser(
  file: UploadedFile,
  parsers: readonly TransactionParser[] = PARSERS,
): TransactionParser | null {
  let best: TransactionParser | null = null;
  let bestScore = 0;
  for (const parser of parsers) {
    const score = parser.canParse(file);
    if (score > bestScore) {
      best = parser;
      bestScore = score;
    }
  }
  return best;
}
