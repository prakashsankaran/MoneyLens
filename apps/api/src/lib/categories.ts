import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from './errors';

type Db = PrismaClient | Prisma.TransactionClient;

export interface CategoryAssignment {
  /** Top-level category. */
  categoryId: string | null;
  /** Subcategory, when the chosen category is a child. */
  subcategoryId: string | null;
}

/** Categories a user may assign: system categories and their own. */
export function visibleCategoryWhere(userId: string): Prisma.CategoryWhereInput {
  return { OR: [{ userId: null }, { userId }] };
}

/**
 * Turn a chosen category id (top level or subcategory) into the
 * categoryId/subcategoryId pair stored on transactions. Rejects categories the
 * user cannot see, so one user can never attach another user's category.
 */
export async function resolveCategoryAssignment(
  db: Db,
  userId: string,
  categoryId: string | null,
): Promise<CategoryAssignment> {
  if (categoryId === null) return { categoryId: null, subcategoryId: null };
  const category = await db.category.findFirst({
    where: { id: categoryId, ...visibleCategoryWhere(userId) },
    select: { id: true, parentId: true },
  });
  if (!category) {
    throw new AppError('VALIDATION_ERROR', 'That category does not exist', {
      fields: { categoryId: 'Unknown category' },
    });
  }
  return category.parentId
    ? { categoryId: category.parentId, subcategoryId: category.id }
    : { categoryId: category.id, subcategoryId: null };
}

/** System category ids keyed by "parent-slug/child-slug". */
export async function systemCategoryPaths(db: Db): Promise<Map<string, string>> {
  const rows = await db.category.findMany({
    where: { userId: null },
    select: { id: true, slug: true, parentId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const paths = new Map<string, string>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const parent = byId.get(row.parentId);
    if (parent) paths.set(`${parent.slug}/${row.slug}`, row.id);
  }
  return paths;
}
