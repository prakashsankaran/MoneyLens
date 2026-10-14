/**
 * Writes the database schema (models, fields, relations, unique keys) that
 * the on-device database needs, taken from the generated Prisma client so it
 * always matches apps/api/prisma/schema.prisma.
 *
 *   npm run generate:schema -w @moneylens/android
 *
 * Run it after changing the Prisma schema; a test fails while it is stale.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../api/package.json', import.meta.url));
const { Prisma } = require('@prisma/client');

export function buildSchema() {
  const models = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    models[model.name] = {
      fields: model.fields.map((f) => ({
        name: f.name,
        kind: f.kind,
        type: f.type,
        isList: f.isList,
        isRequired: f.isRequired,
        isId: f.isId,
        isUnique: f.isUnique,
        isUpdatedAt: f.isUpdatedAt,
        ...(f.hasDefaultValue ? { default: f.default } : {}),
        ...(f.relationName
          ? {
              relationName: f.relationName,
              relationFromFields: f.relationFromFields ?? [],
              relationToFields: f.relationToFields ?? [],
              ...(f.relationOnDelete ? { relationOnDelete: f.relationOnDelete } : {}),
            }
          : {}),
      })),
      uniqueFields: model.uniqueFields,
    };
  }
  return { models };
}

export const SCHEMA_PATH = fileURLToPath(
  new URL('../src/backend/prisma/schema.generated.json', import.meta.url),
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SCHEMA_PATH, `${JSON.stringify(buildSchema(), null, 2)}\n`);
  console.log(`Wrote ${SCHEMA_PATH}`);
}
