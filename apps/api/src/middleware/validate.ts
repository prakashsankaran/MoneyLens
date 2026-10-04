import type { z } from 'zod';
import { AppError } from '../lib/errors';

/** Parse untrusted input with a Zod schema, throwing a 400 on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new AppError('VALIDATION_ERROR', 'Some fields are invalid', { fields });
  }
  return result.data;
}
