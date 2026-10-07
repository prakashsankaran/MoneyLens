export type StatementKind = 'pdf' | 'csv' | 'xlsx';

export const KIND_MIME: Record<StatementKind, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const KIND_LABEL: Record<StatementKind, string> = {
  pdf: 'Google Pay PDF',
  csv: 'Bank CSV',
  xlsx: 'Excel (.xlsx)',
};

/** The statement kind from a file name or URL, or null when it cannot be told. */
export function kindFromName(name: string): StatementKind | null {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(name)?.[1]?.toLowerCase();
  return ext === 'pdf' || ext === 'csv' || ext === 'xlsx' ? ext : null;
}

/** The kind from a MIME type reported by the document picker. */
export function kindFromMime(mime: string | null | undefined): StatementKind | null {
  if (!mime) return null;
  const found = (Object.keys(KIND_MIME) as StatementKind[]).find((k) => KIND_MIME[k] === mime);
  if (found) return found;
  return mime === 'text/comma-separated-values' ? 'csv' : null;
}

/**
 * A file name the API accepts. The API checks the bytes as well as the
 * extension, so the extension only has to match what the file really is.
 */
export function uploadName(name: string, kind: StatementKind): string {
  const base = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\w .()-]+/g, '_')
    .slice(0, 80);
  return `${base || 'statement'}.${kind}`;
}

/** Last path segment of a file or content URL, decoded. */
export function nameFromUri(uri: string): string {
  const last = uri.split(/[/\\]/).pop() ?? '';
  try {
    return decodeURIComponent(last.split('?')[0] ?? '') || 'statement';
  } catch {
    return last || 'statement';
  }
}

/**
 * Route for a file opened in MoneyLens from another app (file:// on iOS,
 * content:// on Android), or null for any other URL.
 */
export function incomingFileRoute(path: string): string | null {
  if (!/^(file|content):\/\//i.test(path)) return null;
  return `/imports?incoming=${encodeURIComponent(path)}`;
}
