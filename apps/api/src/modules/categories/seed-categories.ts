import type { PrismaClient } from '@prisma/client';
import { SYSTEM_CATEGORIES } from './system-categories';

/** Upsert the system category tree; returns "parent/child" slug -> ids. */
export async function seedCategories(
  prisma: PrismaClient,
): Promise<Map<string, { categoryId: string; subcategoryId: string }>> {
  const paths = new Map<string, { categoryId: string; subcategoryId: string }>();

  for (const [index, def] of SYSTEM_CATEGORIES.entries()) {
    const parent =
      (await prisma.category.findFirst({
        where: { userId: null, parentId: null, slug: def.slug },
      })) ??
      (await prisma.category.create({
        data: { slug: def.slug, name: def.name, icon: def.icon, isSystem: true, sortOrder: index },
      }));

    for (const [childIndex, child] of def.children.entries()) {
      const existing = await prisma.category.findFirst({
        where: { userId: null, parentId: parent.id, slug: child.slug },
      });
      const sub =
        existing ??
        (await prisma.category.create({
          data: {
            slug: child.slug,
            name: child.name,
            parentId: parent.id,
            isSystem: true,
            sortOrder: childIndex,
          },
        }));
      paths.set(`${def.slug}/${child.slug}`, { categoryId: parent.id, subcategoryId: sub.id });
    }
  }
  return paths;
}
