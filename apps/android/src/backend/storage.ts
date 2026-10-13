import { MemDecimal } from './prisma/decimal';
import type { MemoryDatabase, Row } from './prisma/engine';

/**
 * Saves the on-device database in the app's private storage (IndexedDB inside
 * the app's WebView). Nothing is sent anywhere: uninstalling the app, or
 * clearing its storage in Android settings, deletes the data.
 */

const DB_NAME = 'moneylens';
const STORE = 'data';
const KEY = 'database';
export const FORMAT_VERSION = 1;

interface Snapshot {
  version: number;
  savedAt: string;
  tables: Record<string, Row[]>;
}

/** Dates as ISO text and decimals as fixed-point text, by column type. */
export function serialize(db: MemoryDatabase): string {
  const tables: Record<string, Row[]> = {};
  for (const [name, model] of db.models) {
    const dates = model.scalars.filter((f) => f.type === 'DateTime').map((f) => f.name);
    const decimals = model.scalars.filter((f) => f.type === 'Decimal').map((f) => f.name);
    tables[name] = [...db.table(name).values()].map((row) => {
      const out: Row = { ...row };
      for (const f of dates) if (out[f] instanceof Date) out[f] = (out[f] as Date).toISOString();
      for (const f of decimals)
        if (out[f] instanceof MemDecimal) out[f] = (out[f] as MemDecimal).toFixed(2);
      return out;
    });
  }
  const snapshot: Snapshot = { version: FORMAT_VERSION, savedAt: new Date().toISOString(), tables };
  return JSON.stringify(snapshot);
}

export function deserialize(db: MemoryDatabase, text: string): void {
  const snapshot = JSON.parse(text) as Snapshot;
  if (snapshot.version !== FORMAT_VERSION) {
    throw new Error(`Saved data has format ${snapshot.version}; this app reads ${FORMAT_VERSION}.`);
  }
  for (const [name, model] of db.models) {
    const table = db.table(name);
    table.clear();
    const fields = model.scalars;
    for (const saved of snapshot.tables[name] ?? []) {
      const row: Row = {};
      // Columns added to the schema since the data was saved start empty.
      for (const f of fields) {
        const value = saved[f.name];
        if (value === null || value === undefined) row[f.name] = f.isList ? [] : null;
        else if (f.type === 'DateTime') row[f.name] = new Date(value as string);
        else if (f.type === 'Decimal') row[f.name] = new MemDecimal(value as string);
        else row[f.name] = value;
      }
      table.set(row.id as string, row);
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSaved(): Promise<string | null> {
  const idb = await openDb();
  return new Promise((resolve, reject) => {
    const request = idb.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writeSaved(text: string): Promise<void> {
  const idb = await openDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(text, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Save after changes, at most every 250 ms, and immediately when asked (after
 * each request that changed something, and when the app goes to background).
 */
export function autoSave(db: MemoryDatabase) {
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!dirty) return saving;
    dirty = false;
    const text = serialize(db);
    saving = saving
      .then(() => writeSaved(text))
      .catch((err: unknown) => {
        dirty = true;
        console.error('MoneyLens could not save your data', err);
      });
    return saving;
  };

  db.onChange(() => {
    dirty = true;
    timer ??= setTimeout(() => void flush(), 250);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
  return { flush };
}
