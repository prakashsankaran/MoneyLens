import { MemDecimal } from './decimal';
import {
  PrismaClientValidationError,
  foreignKeyViolation,
  recordNotFound,
  uniqueViolation,
} from './errors';
import schemaJson from './schema.generated.json';

/**
 * An in-memory database that answers the subset of the Prisma Client API the
 * MoneyLens API uses, so its services run unchanged on the phone. Models,
 * relations, defaults, unique keys and delete rules come from the Prisma
 * schema (schema.generated.json). Anything outside the supported subset throws
 * instead of guessing, so a new query shape fails loudly in the tests.
 */

export interface FieldDef {
  name: string;
  kind: 'scalar' | 'object' | 'enum';
  type: string;
  isList: boolean;
  isRequired: boolean;
  isId: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;
  default?: unknown;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  relationOnDelete?: string;
}

interface InboundRelation {
  model: ModelDef;
  field: FieldDef;
}

export interface ModelDef {
  name: string;
  fields: FieldDef[];
  byName: Map<string, FieldDef>;
  scalars: FieldDef[];
  /** Every unique key: the id, single unique fields and @@unique groups. */
  uniques: string[][];
  /** "userId_normalizedName" -> ["userId", "normalizedName"] */
  compound: Map<string, string[]>;
  /** Relations on other models whose foreign key points at this model. */
  inbound: InboundRelation[];
}

export type Row = Record<string, unknown>;
type Args = Record<string, unknown>;
type Where = Record<string, unknown> | undefined;

export function loadModels(
  schema: {
    models: Record<string, { fields: FieldDef[]; uniqueFields: string[][] }>;
  } = schemaJson as never,
): Map<string, ModelDef> {
  const models = new Map<string, ModelDef>();
  for (const [name, def] of Object.entries(schema.models)) {
    const byName = new Map(def.fields.map((f) => [f.name, f]));
    const scalars = def.fields.filter((f) => f.kind !== 'object');
    const uniques = [
      ...def.fields.filter((f) => f.isId || f.isUnique).map((f) => [f.name]),
      ...def.uniqueFields,
    ];
    const compound = new Map(def.uniqueFields.map((u) => [u.join('_'), u]));
    models.set(name, { name, fields: def.fields, byName, scalars, uniques, compound, inbound: [] });
  }
  for (const model of models.values()) {
    for (const field of model.fields) {
      if (field.kind === 'object' && field.relationFromFields?.length) {
        models.get(field.type)?.inbound.push({ model, field });
      }
    }
  }
  return models;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  !(v instanceof Date) &&
  !(v instanceof MemDecimal);

const cloneJson = (v: unknown): unknown =>
  v === undefined ? undefined : JSON.parse(JSON.stringify(v));

/** Convert an input value to how a column of this type is stored. */
function coerce(field: FieldDef, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (field.isList) {
    if (!Array.isArray(value)) throw invalid(`${field.name} must be a list`);
    return value.map((v) => coerce({ ...field, isList: false }, v));
  }
  switch (field.type) {
    case 'DateTime': {
      const d = value instanceof Date ? new Date(value.getTime()) : new Date(value as string);
      if (Number.isNaN(d.getTime())) throw invalid(`${field.name} is not a valid date`);
      return d;
    }
    case 'Decimal':
      return new MemDecimal(value as string);
    case 'Json':
      return cloneJson(value);
    case 'Int':
    case 'Float':
      if (typeof value !== 'number') throw invalid(`${field.name} must be a number`);
      return field.type === 'Int' ? Math.trunc(value) : value;
    case 'Boolean':
      if (typeof value !== 'boolean') throw invalid(`${field.name} must be true or false`);
      return value;
    default:
      if (typeof value !== 'string') throw invalid(`${field.name} must be text`);
      return value;
  }
}

/** A comparable form of a stored value (dates and decimals become numbers). */
function key(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value instanceof MemDecimal) return value.paise;
  return value;
}

/** Output copy, so callers can never change stored rows. */
function cloneOut(field: FieldDef, value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (field.isList) return (value as unknown[]).map((v) => (v instanceof Date ? new Date(v) : v));
  if (value instanceof Date) return new Date(value.getTime());
  if (field.type === 'Json') return cloneJson(value);
  return value;
}

const collator = new Intl.Collator('en', { sensitivity: 'variant', numeric: false });

function compareValues(a: unknown, b: unknown): number {
  const ka = key(a);
  const kb = key(b);
  if (typeof ka === 'string' && typeof kb === 'string') return collator.compare(ka, kb);
  if (typeof ka === 'boolean' && typeof kb === 'boolean') return Number(ka) - Number(kb);
  return (ka as number) < (kb as number) ? -1 : (ka as number) > (kb as number) ? 1 : 0;
}

function invalid(message: string) {
  return new PrismaClientValidationError(message);
}

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

let idCounter = 0;
/** A collision-resistant id in the spirit of cuid ("c" + time + counter + random). */
export function newId(): string {
  idCounter = (idCounter + 1) % 1_679_616;
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    (b % 36).toString(36),
  ).join('');
  return `c${Date.now().toString(36)}${idCounter.toString(36).padStart(4, '0')}${random}`;
}

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

export type RawHandler = (values: unknown[], db: MemoryDatabase) => unknown;

export class MemoryDatabase {
  readonly models: Map<string, ModelDef>;
  /** model name -> id -> row. Rows are replaced, never mutated, so a shallow copy is a snapshot. */
  tables = new Map<string, Map<string, Row>>();
  private listeners = new Set<() => void>();

  constructor(models = loadModels()) {
    this.models = models;
    for (const name of models.keys()) this.tables.set(name, new Map());
  }

  model(name: string): ModelDef {
    const m = this.models.get(name);
    if (!m) throw invalid(`Unknown model ${name}`);
    return m;
  }

  table(name: string): Map<string, Row> {
    return this.tables.get(name) as Map<string, Row>;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    for (const l of this.listeners) l();
  }

  snapshot(): Map<string, Map<string, Row>> {
    return new Map([...this.tables].map(([k, v]) => [k, new Map(v)]));
  }

  restore(snapshot: Map<string, Map<string, Row>>): void {
    this.tables = snapshot;
  }

  // ---- reading ------------------------------------------------------------

  /** Rows of `model` matching `where`. */
  filter(model: ModelDef, where: Where): Row[] {
    const table = this.table(model.name);
    // Fast path: lookups by id.
    if (where && typeof where.id === 'string') {
      const row = table.get(where.id);
      return row && this.matches(model, row, where) ? [row] : [];
    }
    const out: Row[] = [];
    for (const row of table.values()) if (this.matches(model, row, where)) out.push(row);
    return out;
  }

  matches(model: ModelDef, row: Row, where: Where): boolean {
    if (!where) return true;
    for (const [name, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (name === 'AND') {
        if (!asArray(cond as Where[]).every((w) => this.matches(model, row, w))) return false;
        continue;
      }
      if (name === 'OR') {
        if (!(cond as Where[]).some((w) => this.matches(model, row, w))) return false;
        continue;
      }
      if (name === 'NOT') {
        if (asArray(cond as Where[]).some((w) => this.matches(model, row, w))) return false;
        continue;
      }
      const field = model.byName.get(name);
      if (!field) {
        const fields = model.compound.get(name);
        if (!fields || !isPlainObject(cond)) throw invalid(`Unknown filter ${model.name}.${name}`);
        for (const f of fields) {
          if (!this.scalarMatches(model.byName.get(f) as FieldDef, row[f], cond[f])) return false;
        }
        continue;
      }
      if (field.kind === 'object') {
        if (!this.relationMatches(row, field, cond)) return false;
      } else if (!this.scalarMatches(field, row[name], cond)) {
        return false;
      }
    }
    return true;
  }

  private scalarMatches(field: FieldDef, value: unknown, cond: unknown): boolean {
    if (cond === null) return value === null || value === undefined;
    if (!isPlainObject(cond) || field.type === 'Json') {
      if (field.type === 'Json') {
        if (isPlainObject(cond) && 'equals' in cond) cond = cond.equals;
        return JSON.stringify(value) === JSON.stringify(cond);
      }
      return value !== null && value !== undefined && key(value) === key(coerce(field, cond));
    }
    const insensitive = cond.mode === 'insensitive';
    const text = (v: unknown) => {
      const s = String(v);
      return insensitive ? s.toLowerCase() : s;
    };
    for (const [op, arg] of Object.entries(cond)) {
      if (arg === undefined || op === 'mode') continue;
      const present = value !== null && value !== undefined;
      switch (op) {
        case 'equals':
          if (arg === null ? present : !present || !this.equal(field, value, arg, insensitive))
            return false;
          break;
        case 'not':
          if (arg === null) {
            if (!present) return false;
          } else if (isPlainObject(arg)) {
            if (this.scalarMatches(field, value, arg)) return false;
          } else if (!present || this.equal(field, value, arg, insensitive)) {
            return false;
          }
          break;
        case 'in':
          if (!present || !(arg as unknown[]).some((a) => this.equal(field, value, a, insensitive)))
            return false;
          break;
        case 'notIn':
          if (!present || (arg as unknown[]).some((a) => this.equal(field, value, a, insensitive)))
            return false;
          break;
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte': {
          if (!present || arg === null) return false;
          const c = compareValues(value, coerce(field, arg));
          if (op === 'lt' ? c >= 0 : op === 'lte' ? c > 0 : op === 'gt' ? c <= 0 : c < 0)
            return false;
          break;
        }
        case 'contains':
          if (!present || !text(value).includes(text(arg))) return false;
          break;
        case 'startsWith':
          if (!present || !text(value).startsWith(text(arg))) return false;
          break;
        case 'endsWith':
          if (!present || !text(value).endsWith(text(arg))) return false;
          break;
        case 'has':
          if (!present || !(value as unknown[]).includes(arg)) return false;
          break;
        case 'hasSome':
          if (!present || !(arg as unknown[]).some((a) => (value as unknown[]).includes(a)))
            return false;
          break;
        case 'hasEvery':
          if (!present || !(arg as unknown[]).every((a) => (value as unknown[]).includes(a)))
            return false;
          break;
        case 'isEmpty':
          if (!present || ((value as unknown[]).length === 0) !== arg) return false;
          break;
        default:
          throw invalid(`Unsupported filter ${op} on ${field.name}`);
      }
    }
    return true;
  }

  private equal(field: FieldDef, value: unknown, arg: unknown, insensitive: boolean): boolean {
    if (arg === null || arg === undefined) return false;
    if (insensitive) return String(value).toLowerCase() === String(arg).toLowerCase();
    return key(value) === key(coerce(field, arg));
  }

  private relationMatches(row: Row, field: FieldDef, cond: unknown): boolean {
    const related = this.related(row, field);
    const target = this.model(field.type);
    if (field.isList) {
      if (!isPlainObject(cond)) throw invalid(`Invalid list filter on ${field.name}`);
      for (const [op, w] of Object.entries(cond)) {
        if (w === undefined) continue;
        const where = w as Where;
        if (op === 'some' && !related.some((r) => this.matches(target, r, where))) return false;
        if (op === 'none' && related.some((r) => this.matches(target, r, where))) return false;
        if (op === 'every' && !related.every((r) => this.matches(target, r, where))) return false;
        if (!['some', 'none', 'every'].includes(op)) throw invalid(`Unsupported filter ${op}`);
      }
      return true;
    }
    const one = related[0];
    if (cond === null) return !one;
    if (isPlainObject(cond) && ('is' in cond || 'isNot' in cond)) {
      if ('is' in cond && cond.is !== undefined) {
        if (cond.is === null ? !!one : !one || !this.matches(target, one, cond.is as Where))
          return false;
      }
      if ('isNot' in cond && cond.isNot !== undefined) {
        if (cond.isNot === null ? !one : !!one && this.matches(target, one, cond.isNot as Where))
          return false;
      }
      return true;
    }
    return !!one && this.matches(target, one, cond as Where);
  }

  /** Rows on the other side of a relation field. */
  related(row: Row, field: FieldDef): Row[] {
    const target = this.model(field.type);
    const from = field.relationFromFields ?? [];
    if (from.length) {
      const to = field.relationToFields ?? [];
      const values = from.map((f) => row[f]);
      if (values.some((v) => v === null || v === undefined)) return [];
      if (to.length === 1 && to[0] === 'id') {
        const hit = this.table(target.name).get(values[0] as string);
        return hit ? [hit] : [];
      }
      return [...this.table(target.name).values()].filter((r) =>
        to.every((t, i) => key(r[t]) === key(values[i])),
      );
    }
    // The foreign key lives on the other model.
    const back = target.fields.find(
      (f) => f.relationName === field.relationName && f.relationFromFields?.length,
    );
    if (!back) throw invalid(`Relation ${field.name} has no foreign key`);
    const fk = back.relationFromFields as string[];
    const refs = (back.relationToFields as string[]).map((t) => row[t]);
    return [...this.table(target.name).values()].filter((r) =>
      fk.every((f, i) => r[f] !== null && key(r[f]) === key(refs[i])),
    );
  }

  sort(model: ModelDef, rows: Row[], orderBy: unknown): Row[] {
    const specs = asArray(orderBy as Record<string, unknown>[]).flatMap((o) =>
      Object.entries(o).filter(([, v]) => v !== undefined),
    );
    if (!specs.length) return rows;
    const compareBy = (m: ModelDef, a: Row, b: Row, name: string, spec: unknown): number => {
      const field = m.byName.get(name);
      if (!field) throw invalid(`Cannot order by ${m.name}.${name}`);
      if (field.kind === 'object') {
        if (field.isList) throw invalid(`Cannot order by list relation ${name}`);
        const target = this.model(field.type);
        const ra = this.related(a, field)[0];
        const rb = this.related(b, field)[0];
        for (const [n, s] of Object.entries(spec as Record<string, unknown>)) {
          const c = ra && rb ? compareBy(target, ra, rb, n, s) : ra ? -1 : rb ? 1 : 0;
          if (c) return c;
        }
        return 0;
      }
      const dir = typeof spec === 'string' ? spec : (spec as { sort: string }).sort;
      const nulls =
        (typeof spec === 'object' && (spec as { nulls?: string }).nulls) ||
        (dir === 'asc' ? 'last' : 'first');
      const va = a[name];
      const vb = b[name];
      const na = va === null || va === undefined;
      const nb = vb === null || vb === undefined;
      if (na || nb) {
        if (na && nb) return 0;
        return (na ? 1 : -1) * (nulls === 'last' ? 1 : -1);
      }
      const c = compareValues(va, vb);
      return dir === 'desc' ? -c : c;
    };
    return [...rows].sort((a, b) => {
      for (const [name, spec] of specs) {
        const c = compareBy(model, a, b, name, spec);
        if (c) return c;
      }
      return 0;
    });
  }

  /** Shape a row for output according to select/include. */
  project(model: ModelDef, row: Row, args: Args = {}): Row {
    const out: Row = {};
    const select = args.select as Record<string, unknown> | undefined;
    const include = args.include as Record<string, unknown> | undefined;
    if (select && include) throw invalid('Use either select or include, not both');
    if (!select) for (const f of model.scalars) out[f.name] = cloneOut(f, row[f.name]);
    for (const [name, spec] of Object.entries(select ?? include ?? {})) {
      if (!spec) continue;
      if (name === '_count') {
        out._count = this.counts(model, row, spec);
        continue;
      }
      const field = model.byName.get(name);
      if (!field) throw invalid(`Unknown field ${model.name}.${name}`);
      if (field.kind !== 'object') {
        out[name] = cloneOut(field, row[name]);
        continue;
      }
      const nested = spec === true ? {} : (spec as Args);
      const target = this.model(field.type);
      let rows = this.related(row, field).filter((r) =>
        this.matches(target, r, nested.where as Where),
      );
      if (field.isList) {
        rows = this.page(target, rows, nested);
        out[name] = rows.map((r) => this.project(target, r, nested));
      } else {
        out[name] = rows[0] ? this.project(target, rows[0], nested) : null;
      }
    }
    return out;
  }

  private counts(model: ModelDef, row: Row, spec: unknown): Record<string, number> {
    const wanted =
      spec === true
        ? Object.fromEntries(
            model.fields.filter((f) => f.isList && f.kind === 'object').map((f) => [f.name, true]),
          )
        : ((spec as { select: Record<string, unknown> }).select ?? {});
    const out: Record<string, number> = {};
    for (const [name, s] of Object.entries(wanted)) {
      if (!s) continue;
      const field = model.byName.get(name) as FieldDef;
      const where = s === true ? undefined : ((s as Args).where as Where);
      const target = this.model(field.type);
      out[name] = this.related(row, field).filter((r) => this.matches(target, r, where)).length;
    }
    return out;
  }

  /** orderBy, distinct, skip and take. */
  page(model: ModelDef, rows: Row[], args: Args): Row[] {
    let out = this.sort(model, rows, args.orderBy);
    if (args.cursor) throw invalid('Cursor pagination is not supported on the device');
    if (args.distinct) {
      const fields = asArray(args.distinct as string[]);
      const seen = new Set<string>();
      out = out.filter((r) => {
        const k = JSON.stringify(fields.map((f) => key(r[f])));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    const skip = (args.skip as number | undefined) ?? 0;
    const take = args.take as number | undefined;
    if (take !== undefined && take < 0) throw invalid('Negative take is not supported');
    return out.slice(skip, take === undefined ? undefined : skip + take);
  }

  // ---- writing ------------------------------------------------------------

  /** Insert a row from create data, including nested creates of related rows. */
  createRow(model: ModelDef, data: Args): Row {
    const nested: [FieldDef, Args[]][] = [];
    const row = this.buildRow(model, data, nested);
    this.checkConstraints(model, row);
    this.insert(model, row);
    for (const [field, items] of nested) {
      const target = this.model(field.type);
      const back = target.fields.find(
        (f) => f.relationName === field.relationName && f.relationFromFields?.length,
      ) as FieldDef;
      const link = Object.fromEntries(
        (back.relationFromFields as string[]).map((f, i) => [
          f,
          row[(back.relationToFields as string[])[i] as string],
        ]),
      );
      for (const item of items) this.createRow(target, { ...item, ...link });
    }
    return row;
  }

  /** Build a new row from create data, applying defaults. */
  buildRow(model: ModelDef, data: Args, nested?: [FieldDef, Args[]][]): Row {
    const row: Row = {};
    const now = new Date();
    for (const [name, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const field = model.byName.get(name);
      if (!field) throw invalid(`Unknown argument ${name} for ${model.name}`);
      if (field.kind === 'object') {
        if (nested && field.isList && isPlainObject(value) && (value.create || value.createMany)) {
          const items = value.create
            ? asArray(value.create as Args | Args[])
            : asArray((value.createMany as { data: Args | Args[] }).data);
          nested.push([field, items]);
          continue;
        }
        this.applyRelationWrite(model, row, field, value);
        continue;
      }
      row[name] = coerce(field, value);
    }
    for (const field of model.scalars) {
      if (row[field.name] !== undefined) continue;
      if (field.isUpdatedAt) row[field.name] = new Date(now);
      else if (field.default !== undefined) row[field.name] = this.defaultValue(field, now);
      else if (field.isList) row[field.name] = [];
      else if (field.isRequired)
        throw invalid(`Argument ${field.name} is missing for ${model.name}`);
      else row[field.name] = null;
    }
    return row;
  }

  private defaultValue(field: FieldDef, now: Date): unknown {
    const d = field.default;
    if (isPlainObject(d) && typeof d.name === 'string') {
      switch (d.name) {
        case 'cuid':
          return newId();
        case 'uuid':
          return crypto.randomUUID();
        case 'now':
          return new Date(now);
        default:
          throw invalid(`Unsupported default ${d.name} on ${field.name}`);
      }
    }
    return coerce(field, d);
  }

  private applyRelationWrite(model: ModelDef, row: Row, field: FieldDef, value: unknown): void {
    if (field.isList || !field.relationFromFields?.length || !isPlainObject(value)) {
      throw invalid(`Nested writes to ${model.name}.${field.name} are not supported on the device`);
    }
    const from = field.relationFromFields;
    const to = field.relationToFields as string[];
    if (isPlainObject(value.connect)) {
      const connect = value.connect;
      from.forEach((f, i) => (row[f] = connect[to[i] as string]));
    } else if (value.disconnect === true) {
      from.forEach((f) => (row[f] = null));
    } else {
      throw invalid(`Nested writes to ${model.name}.${field.name} are not supported on the device`);
    }
  }

  /** Apply update data to a copy of `row`. */
  updatedRow(model: ModelDef, row: Row, data: Args): Row {
    const next: Row = { ...row };
    let touchedUpdatedAt = false;
    for (const [name, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const field = model.byName.get(name);
      if (!field) throw invalid(`Unknown argument ${name} for ${model.name}`);
      if (field.kind === 'object') {
        this.applyRelationWrite(model, next, field, value);
        continue;
      }
      if (field.isUpdatedAt) touchedUpdatedAt = true;
      if (field.type === 'Json' || field.isList || !isPlainObject(value)) {
        if (field.isList && isPlainObject(value)) {
          if ('set' in value) next[name] = coerce(field, value.set);
          else if ('push' in value)
            next[name] = [...(next[name] as unknown[]), ...asArray(value.push as unknown[])];
          else throw invalid(`Unsupported list update on ${name}`);
        } else {
          next[name] = coerce(field, value);
        }
        continue;
      }
      const [[op, arg]] = Object.entries(value) as [[string, unknown]];
      const current = next[name];
      const num = (v: unknown) => (v instanceof MemDecimal ? v.paise / 100 : (v as number));
      switch (op) {
        case 'set':
          next[name] = coerce(field, arg);
          break;
        case 'increment':
        case 'decrement':
        case 'multiply':
        case 'divide': {
          if (current === null || current === undefined) break;
          const a = num(current);
          const b = num(coerce(field, arg));
          const r =
            op === 'increment'
              ? a + b
              : op === 'decrement'
                ? a - b
                : op === 'multiply'
                  ? a * b
                  : a / b;
          next[name] = field.type === 'Decimal' ? new MemDecimal(r) : coerce(field, r);
          break;
        }
        default:
          throw invalid(`Unsupported update ${op} on ${name}`);
      }
    }
    for (const f of model.scalars) {
      if (f.isUpdatedAt && !touchedUpdatedAt) next[f.name] = new Date();
      if (f.isRequired && (next[f.name] === null || next[f.name] === undefined)) {
        throw invalid(`${model.name}.${f.name} cannot be null`);
      }
    }
    return next;
  }

  /** Unique keys and foreign keys, as the database would enforce them. */
  checkConstraints(model: ModelDef, row: Row, ignoreId?: string): void {
    const table = this.table(model.name);
    for (const fields of model.uniques) {
      const values = fields.map((f) => key(row[f]));
      // NULLs never collide in a Postgres unique index.
      if (values.some((v) => v === null || v === undefined)) continue;
      if (fields.length === 1 && fields[0] === 'id') {
        const clash = table.get(row.id as string);
        if (clash && clash.id !== ignoreId) throw uniqueViolation(model.name, fields);
        continue;
      }
      for (const other of table.values()) {
        if (other.id === ignoreId) continue;
        if (fields.every((f, i) => key(other[f]) === values[i])) {
          throw uniqueViolation(model.name, fields);
        }
      }
    }
    this.checkForeignKeys(model, row);
  }

  checkForeignKeys(model: ModelDef, row: Row): void {
    for (const field of model.fields) {
      if (field.kind !== 'object' || !field.relationFromFields?.length) continue;
      const from = field.relationFromFields;
      if (from.some((f) => row[f] === null || row[f] === undefined)) continue;
      if (this.related(row, field).length === 0) {
        throw foreignKeyViolation(model.name, from.join(','));
      }
    }
  }

  insert(model: ModelDef, row: Row): void {
    this.table(model.name).set(row.id as string, row);
  }

  replace(model: ModelDef, row: Row): void {
    this.table(model.name).set(row.id as string, row);
  }

  /** Delete a row, applying each inbound relation's onDelete rule. */
  remove(model: ModelDef, row: Row): void {
    const table = this.table(model.name);
    if (!table.has(row.id as string)) return;
    table.delete(row.id as string);
    for (const { model: other, field } of model.inbound) {
      const from = field.relationFromFields as string[];
      const to = field.relationToFields as string[];
      const dependents = [...this.table(other.name).values()].filter((r) =>
        from.every((f, i) => r[f] !== null && key(r[f]) === key(row[to[i] as string])),
      );
      if (!dependents.length) continue;
      const required = from.some((f) => other.byName.get(f)?.isRequired);
      const rule = field.relationOnDelete ?? (required ? 'Restrict' : 'SetNull');
      for (const dep of dependents) {
        if (rule === 'Cascade') this.remove(other, dep);
        else if (rule === 'SetNull') {
          const next = { ...dep };
          for (const f of from) next[f] = null;
          this.replace(other, next);
        } else {
          table.set(row.id as string, row);
          throw foreignKeyViolation(other.name, from.join(','));
        }
      }
    }
  }

  notFound(model: ModelDef, operation: string) {
    return recordNotFound(model.name, operation);
  }
}
