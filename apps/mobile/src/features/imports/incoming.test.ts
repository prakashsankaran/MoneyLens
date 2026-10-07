import { redirectSystemPath } from '@/app/+native-intent';
import { incomingFileRoute, kindFromMime, kindFromName, nameFromUri, uploadName } from './incoming';

describe('statement kinds', () => {
  it('reads the kind from a file name or URL', () => {
    expect(kindFromName('GPay Sept.PDF')).toBe('pdf');
    expect(kindFromName('file:///tmp/hdfc.csv?x=1')).toBe('csv');
    expect(kindFromName('statement.xlsx')).toBe('xlsx');
    expect(kindFromName('statement.xls')).toBeNull();
    expect(kindFromName('statement')).toBeNull();
  });

  it('reads the kind from the picker MIME type', () => {
    expect(kindFromMime('application/pdf')).toBe('pdf');
    expect(kindFromMime('text/comma-separated-values')).toBe('csv');
    expect(kindFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'xlsx',
    );
    expect(kindFromMime('image/png')).toBeNull();
    expect(kindFromMime(undefined)).toBeNull();
  });

  it('gives the upload a safe name with the right extension', () => {
    expect(uploadName('Sept/../statement.txt', 'csv')).toBe('Sept_.._statement.csv');
    expect(uploadName('.pdf', 'pdf')).toBe('statement.pdf');
  });

  it('takes a readable name from a file or content URL', () => {
    expect(nameFromUri('file:///var/mobile/Inbox/GPay%20Sept.pdf')).toBe('GPay Sept.pdf');
    expect(nameFromUri('content://com.android.providers/document/42')).toBe('42');
    expect(nameFromUri('file:///bad%E0')).toBe('bad%E0');
  });
});

describe('files opened from another app', () => {
  it('routes file and content URLs to the import screen', () => {
    const url = 'content://downloads/statement.pdf';
    expect(incomingFileRoute(url)).toBe(`/imports?incoming=${encodeURIComponent(url)}`);
    expect(redirectSystemPath({ path: 'file:///a.csv', initial: true })).toMatch(
      /^\/imports\?incoming=/,
    );
  });

  it('leaves every other link to the router', () => {
    expect(incomingFileRoute('moneylens://transactions')).toBeNull();
    expect(redirectSystemPath({ path: '/insights', initial: false })).toBe('/insights');
  });
});
