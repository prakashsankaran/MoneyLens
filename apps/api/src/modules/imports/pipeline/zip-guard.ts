import { StatementParseError } from './types';

/** An .xlsx statement never needs more than this once unzipped. */
export const MAX_XLSX_UNZIPPED_BYTES = 100 * 1024 * 1024;
/** Workbooks have a few dozen parts; thousands means something else. */
export const MAX_XLSX_ENTRIES = 2_000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

/**
 * Check an .xlsx (ZIP) file's central directory before anything unzips it, so
 * a small upload cannot expand into gigabytes in memory (a "zip bomb"). Only
 * the directory is read; no entry is decompressed here.
 */
export function assertSafeZip(buffer: Buffer): void {
  const tooBig = () =>
    new StatementParseError(
      'This Excel file expands to far more data than a bank statement. Export the statement again, or as CSV.',
    );
  const unreadable = () =>
    new StatementParseError('The Excel file could not be read. It may be damaged.');

  // The end-of-central-directory record sits in the last 22 bytes plus an
  // optional comment of up to 65,535 bytes.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unreadable();

  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries === 0xffff || directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) {
    // ZIP64 is only needed for archives far larger than any statement.
    throw tooBig();
  }
  if (entries > MAX_XLSX_ENTRIES) throw tooBig();
  if (directoryOffset + directorySize > eocd) throw unreadable();

  let total = 0;
  let at = directoryOffset;
  for (let n = 0; n < entries; n += 1) {
    if (at + 46 > eocd || buffer.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw unreadable();
    const uncompressed = buffer.readUInt32LE(at + 24);
    if (uncompressed === ZIP64_MARKER) throw tooBig();
    total += uncompressed;
    if (total > MAX_XLSX_UNZIPPED_BYTES) throw tooBig();
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    at += 46 + nameLength + extraLength + commentLength;
  }
}
