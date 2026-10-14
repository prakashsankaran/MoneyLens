import { MemoryDatabase, type ModelDef, type RawHandler, type Row } from './engine';

type Args = Record<string, unknown>;

/** Normalised text of a tagged-template SQL statement, used to look up its handler. */
export function sqlKey(strings: readonly string[]): string {
  return strings.join('?').replace(/\s+/g, ' ').trim();
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The Prisma Client stand-in: one delegate per model (`prisma.transaction`),
 * `$transaction` with rollback, and `$queryRaw`/`$executeRaw` for the few
 * statements the API writes by hand (see raw.ts).
 */
export class MemoryPrismaClient {
  readonly $db: MemoryDatabase;
  private readonly raw: Map<string, RawHandler>;
  private lock: Promise<void> = Promise.resolve();
  [delegate: string]: unknown;

  constructor(opts: { db?: MemoryDatabase; raw?: Map<string, RawHandler> } = {}) {
    this.$db = opts.db ?? new MemoryDatabase();
    this.raw = opts.raw ?? new Map();
    for (const model of this.$db.models.values()) {
      this[lowerFirst(model.name)] = createDelegate(this.$db, model);
    }
  }

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}

  /**
   * Interactive transactions run one at a time and restore the previous
   * state when the callback throws. The array form runs its (already
   * started) operations in order.
   */
  async $transaction<T>(arg: ((tx: this) => Promise<T>) | Promise<unknown>[]): Promise<unknown> {
    if (Array.isArray(arg)) return Promise.all(arg);
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => (release = resolve));
    await previous;
    const snapshot = this.$db.snapshot();
    try {
      return await arg(this);
    } catch (err) {
      this.$db.restore(snapshot);
      this.$db.changed();
      throw err;
    } finally {
      release();
    }
  }

  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> {
    return this.runRaw(strings, values);
  }

  async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> {
    const result = this.runRaw(strings, values);
    this.$db.changed();
    return result;
  }

  private runRaw(strings: TemplateStringsArray, values: unknown[]): unknown {
    const handler = this.raw.get(sqlKey(strings));
    if (!handler) throw new Error(`SQL not supported on the device: ${sqlKey(strings)}`);
    return handler(values, this.$db);
  }
}

function createDelegate(db: MemoryDatabase, model: ModelDef) {
  const findMany = (args: Args = {}): Row[] => {
    const rows = db.page(model, db.filter(model, args.where as Args), args);
    return rows.map((r) => db.project(model, r, args));
  };
  const findFirst = (args: Args = {}): Row | null => findMany({ ...args, take: 1 })[0] ?? null;
  const findOne = (where: Args, operation: string): Row => {
    const row = db.filter(model, where)[0];
    if (!row) throw db.notFound(model, operation);
    return row;
  };
  const create = (args: Args): Row => db.createRow(model, args.data as Args);
  const update = (row: Row, data: Args): Row => {
    const next = db.updatedRow(model, row, data);
    db.checkConstraints(model, next, row.id as string);
    db.replace(model, next);
    return next;
  };
  const write = <T>(fn: () => T): Promise<T> => {
    try {
      const result = fn();
      db.changed();
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  };
  const read = <T>(fn: () => T): Promise<T> => {
    try {
      return Promise.resolve(fn());
    } catch (err) {
      return Promise.reject(err);
    }
  };

  return {
    findMany: (args?: Args) => read(() => findMany(args)),
    findFirst: (args?: Args) => read(() => findFirst(args)),
    findUnique: (args: Args) => read(() => findFirst(args)),
    findFirstOrThrow: (args?: Args) =>
      read(
        () =>
          findFirst(args) ??
          (() => {
            throw db.notFound(model, 'findFirstOrThrow');
          })(),
      ),
    findUniqueOrThrow: (args: Args) =>
      read(
        () =>
          findFirst(args) ??
          (() => {
            throw db.notFound(model, 'findUniqueOrThrow');
          })(),
      ),
    count: (args: Args = {}) => {
      if (args.select) return Promise.reject(new Error('count with select is not supported'));
      return read(() => db.page(model, db.filter(model, args.where as Args), args).length);
    },
    create: (args: Args) => write(() => db.project(model, create(args), args)),
    createMany: (args: Args) =>
      write(() => {
        let count = 0;
        for (const data of args.data as Args[]) {
          const row = db.buildRow(model, data);
          try {
            db.checkConstraints(model, row);
          } catch (err) {
            if (args.skipDuplicates && (err as { code?: string }).code === 'P2002') continue;
            throw err;
          }
          db.insert(model, row);
          count += 1;
        }
        return { count };
      }),
    update: (args: Args) =>
      write(() =>
        db.project(model, update(findOne(args.where as Args, 'update'), args.data as Args), args),
      ),
    updateMany: (args: Args) =>
      write(() => {
        const rows = db.filter(model, args.where as Args);
        for (const row of rows) update(row, args.data as Args);
        return { count: rows.length };
      }),
    upsert: (args: Args) =>
      write(() => {
        const existing = db.filter(model, args.where as Args)[0];
        const row = existing
          ? update(existing, args.update as Args)
          : create({ data: args.create });
        return db.project(model, row, args);
      }),
    delete: (args: Args) =>
      write(() => {
        const row = findOne(args.where as Args, 'delete');
        const out = db.project(model, row, args);
        db.remove(model, row);
        return out;
      }),
    deleteMany: (args: Args = {}) =>
      write(() => {
        const rows = db.filter(model, args.where as Args);
        for (const row of rows) db.remove(model, row);
        return { count: rows.length };
      }),
    aggregate: () => Promise.reject(new Error('aggregate is not supported on the device')),
    groupBy: () => Promise.reject(new Error('groupBy is not supported on the device')),
  };
}
