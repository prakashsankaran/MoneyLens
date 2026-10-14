/** Error classes matching the ones the API checks for (`instanceof`, `code`). */

const CLIENT_VERSION = 'moneylens-on-device';

export class PrismaClientKnownRequestError extends Error {
  readonly code: string;
  readonly meta?: Record<string, unknown>;
  readonly clientVersion = CLIENT_VERSION;

  constructor(message: string, opts: { code: string; meta?: Record<string, unknown> }) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = opts.code;
    if (opts.meta) this.meta = opts.meta;
  }
}

export class PrismaClientValidationError extends Error {
  readonly clientVersion = CLIENT_VERSION;

  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientValidationError';
  }
}

export const uniqueViolation = (model: string, fields: string[]) =>
  new PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (${fields.map((f) => `\`${f}\``).join(',')})`,
    { code: 'P2002', meta: { modelName: model, target: fields } },
  );

export const foreignKeyViolation = (model: string, field: string) =>
  new PrismaClientKnownRequestError(`Foreign key constraint violated on the field: ${field}`, {
    code: 'P2003',
    meta: { modelName: model, field_name: field },
  });

export const recordNotFound = (model: string, operation: string) =>
  new PrismaClientKnownRequestError(`No record was found for ${operation} on ${model}.`, {
    code: 'P2025',
    meta: { modelName: model, cause: 'Record not found' },
  });
