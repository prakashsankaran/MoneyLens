/** read-excel-file/node's entry for the app: the browser reader wants an ArrayBuffer. */
import readXlsxFile from 'read-excel-file/browser';

export default function readXlsx(input: Uint8Array) {
  const copy = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  return readXlsxFile(copy as ArrayBuffer);
}
