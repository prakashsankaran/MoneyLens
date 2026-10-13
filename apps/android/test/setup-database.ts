import { PrismaClient } from '@prisma/client';
import { seedCategories } from '../../api/src/modules/categories/seed-categories';

// Each test file gets a fresh in-memory database; give it the built-in
// categories, as `prisma migrate deploy` + seed do for Postgres.
await seedCategories(new PrismaClient());
