import { describe, expect, it } from 'vitest';
import { bankWorkbook } from '../../../../test/fixtures/statements';
import { assertSafeZip, MAX_XLSX_ENTRIES, MAX_XLSX_UNZIPPED_BYTES } from './zip-guard';

/** A ZIP made only of central-directory records, with the sizes we choose. */
function fakeZip(entries: { name: string; uncompressed: number }[]): Buffer {
  const records = entries.map(({ name, uncompressed }) => {
    const r = Buffer.alloc(46 + name.length);
    r.writeUInt32LE(0x02014b50, 0);
    r.writeUInt32LE(uncompressed, 24);
    r.writeUInt16LE(name.length, 28);
    r.write(name, 46, 'latin1');
    return r;
  });
  const directory = Buffer.concat(records);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([directory, eocd]);
}

describe('assertSafeZip', () => {
  it('accepts a real workbook', async () => {
    const workbook = await bankWorkbook();
    expect(() => assertSafeZip(workbook)).not.toThrow();
    expect(() =>
      assertSafeZip(fakeZip([{ name: 'xl/workbook.xml', uncompressed: 4096 }])),
    ).not.toThrow();
  });

  it('refuses a file that would unzip to more than the limit', () => {
    const bomb = fakeZip([
      { name: 'xl/worksheets/sheet1.xml', uncompressed: MAX_XLSX_UNZIPPED_BYTES - 10 },
      { name: 'xl/worksheets/sheet2.xml', uncompressed: 100 },
    ]);
    expect(() => assertSafeZip(bomb)).toThrow(/expands to far more data/);
  });

  it('refuses ZIP64 and absurd entry counts', () => {
    expect(() => assertSafeZip(fakeZip([{ name: 'a', uncompressed: 0xffffffff }]))).toThrow(
      /expands/,
    );
    const many = Array.from({ length: MAX_XLSX_ENTRIES + 1 }, (_, i) => ({
      name: `f${i}`,
      uncompressed: 1,
    }));
    expect(() => assertSafeZip(fakeZip(many))).toThrow(/expands/);
  });

  it('refuses something that is not a ZIP, or a damaged directory', () => {
    expect(() => assertSafeZip(Buffer.from('not a zip at all, just text'.repeat(3)))).toThrow(
      /could not be read/,
    );
    const broken = fakeZip([{ name: 'a', uncompressed: 1 }]);
    broken.writeUInt32LE(0xdeadbeef, 0);
    expect(() => assertSafeZip(broken)).toThrow(/could not be read/);
  });
});
