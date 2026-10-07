import { describe, expect, it } from 'vitest';
import { googlePayPdf } from '../../../test/fixtures/statements';
import { parseWithDeadline } from './imports.service';
import { extractPdfLines } from './pipeline/pdf-text';
import { StatementParseError, TOO_SLOW, type TransactionParser } from './pipeline/types';

const file = { filename: 'statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') };

const parserThat = (parse: TransactionParser['parse']): TransactionParser => ({
  name: 'test@1',
  source: 'OTHER',
  canParse: () => 1,
  parse,
});

describe('parseWithDeadline', () => {
  it('refuses a parser that never finishes, on time', async () => {
    const started = Date.now();
    const hung = parserThat(() => new Promise(() => {}));
    await expect(parseWithDeadline(hung, file, 50)).rejects.toThrow(TOO_SLOW);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('tells the parser to stop when the deadline passes', async () => {
    let signal: AbortSignal | undefined;
    const slow = parserThat(async (f) => {
      signal = f.signal;
      await new Promise((r) => setTimeout(r, 200));
      return { parserName: 'test@1', source: 'OTHER', rows: [], warnings: [] };
    });
    await expect(parseWithDeadline(slow, file, 20)).rejects.toBeInstanceOf(StatementParseError);
    expect(signal?.aborted).toBe(true);
  });

  it('returns the result of a parser that finishes in time', async () => {
    const quick = parserThat(async () => ({
      parserName: 'test@1',
      source: 'OTHER',
      rows: [],
      warnings: ['ok'],
    }));
    await expect(parseWithDeadline(quick, file, 1000)).resolves.toMatchObject({ warnings: ['ok'] });
  });
});

describe('extractPdfLines with a deadline', () => {
  it('stops reading pages once the signal is aborted', async () => {
    const pdf = await googlePayPdf();
    await expect(extractPdfLines(pdf, undefined, AbortSignal.abort())).rejects.toThrow(TOO_SLOW);
    await expect(
      extractPdfLines(pdf, undefined, new AbortController().signal),
    ).resolves.not.toHaveLength(0);
  });
});
