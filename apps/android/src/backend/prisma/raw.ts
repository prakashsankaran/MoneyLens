import { monthKeyOf } from '@moneylens/shared';
import type { RawHandler } from './engine';

/**
 * The API's hand-written SQL statements, answered in JavaScript. Each key is
 * the statement's text with `?` for its parameters and whitespace collapsed;
 * test/raw-sql.test.ts checks that every statement in apps/api/src has one.
 */
export const RAW_HANDLERS = new Map<string, RawHandler>([
  ['SELECT 1', () => [{ '?column?': 1 }]],

  // AnalyticsDataSource.monthsWithData: IST months with confirmed transactions.
  [
    `SELECT DISTINCT to_char("transactionDate" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month FROM "Transaction" WHERE "userId" = ? AND "status" = 'CONFIRMED' ORDER BY month ASC`,
    ([userId], db) => {
      const months = new Set<string>();
      for (const t of db.table('Transaction').values()) {
        if (t.userId === userId && t.status === 'CONFIRMED') {
          months.add(monthKeyOf(t.transactionDate as Date));
        }
      }
      return [...months].sort().map((month) => ({ month }));
    },
  ],

  // ImportsService.confirm: link each staged row to the transaction it became.
  [
    `UPDATE "ImportTransaction" AS r SET "committedId" = v.tid FROM unnest(?::text[], ?::text[]) AS v(rid, tid) WHERE r.id = v.rid`,
    ([rowIds, txIds], db) => {
      const table = db.table('ImportTransaction');
      let count = 0;
      (rowIds as string[]).forEach((rid, i) => {
        const row = table.get(rid);
        if (!row) return;
        table.set(rid, { ...row, committedId: (txIds as string[])[i] ?? null });
        count += 1;
      });
      return count;
    },
  ],
]);
