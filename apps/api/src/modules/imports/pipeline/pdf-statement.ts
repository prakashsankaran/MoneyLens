import { hasGooglePayHeading, parseGooglePayLines } from './google-pay-pdf';
import { detectIssuer, parseStatementTableLines } from './pdf-table';
import { extractPdfLines, type PdfLine } from './pdf-text';
import {
  StatementParseError,
  type ParseResult,
  type TransactionParser,
  type UploadedFile,
} from './types';

/**
 * Every statement PDF: Google Pay's own layout, or a table statement from a
 * bank, PhonePe or Paytm. The text is read once and the layout decides.
 */
export function parseStatementPdfLines(lines: PdfLine[]): ParseResult {
  const issuer = detectIssuer(lines);
  // Paytm's heading looks like Google Pay's, so a named wallet wins.
  if (issuer !== 'paytm' && issuer !== 'phonepe' && hasGooglePayHeading(lines)) {
    try {
      return {
        parserName: 'google-pay-pdf@1',
        source: 'GOOGLE_PAY',
        ...parseGooglePayLines(lines),
      };
    } catch (err) {
      if (!(err instanceof StatementParseError)) throw err;
      // Not Google Pay after all; try it as a table below.
    }
  }
  return {
    parserName: issuer ? `pdf-table@1:${issuer}` : 'pdf-table@1',
    source: 'PDF',
    ...parseStatementTableLines(lines),
  };
}

export class PdfStatementParser implements TransactionParser {
  readonly name = 'pdf@1';
  readonly source = 'PDF' as const;

  canParse(file: UploadedFile): number {
    const ext = file.filename.toLowerCase().split('.').pop();
    if (ext === 'pdf') return 0.8;
    return file.mimeType === 'application/pdf' ? 0.7 : 0;
  }

  async parse(file: UploadedFile): Promise<ParseResult> {
    return parseStatementPdfLines(await extractPdfLines(file.buffer, file.password, file.signal));
  }
}
