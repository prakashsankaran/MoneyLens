import { Prisma, type PrismaClient } from '@prisma/client';
import type { CategoryNode } from '@moneylens/types';
import type { CreateCategoryInput, UpdateCategoryInput } from '@moneylens/validation';
import { visibleCategoryWhere } from '../../lib/categories';
import { AppError, notFound } from '../../lib/errors';

/** Keeps a single account from creating an unbounded category list. */
export const MAX_CUSTOM_CATEGORIES = 100;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 48) || 'category';
}

const select = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  color: true,
  icon: true,
  userId: true,
} as const;

export class CategoriesService {
  constructor(private readonly prisma: PrismaClient) {}

  /** System categories plus the user's own, as a two-level tree. */
  async tree(userId: string): Promise<CategoryNode[]> {
    const all = await this.prisma.category.findMany({
      where: visibleCategoryWhere(userId),
      select,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const node = ({ userId: owner, ...c }: (typeof all)[number]) => ({
      ...c,
      isSystem: owner === null,
    });
    return all
      .filter((c) => c.parentId === null)
      .map((parent) => ({
        ...node(parent),
        children: all.filter((c) => c.parentId === parent.id).map(node),
      }));
  }

  async create(userId: string, input: CreateCategoryInput): Promise<CategoryNode> {
    const parentId = input.parentId ?? null;
    if (parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: parentId, ...visibleCategoryWhere(userId) },
        select: { parentId: true },
      });
      if (!parent) {
        throw new AppError('VALIDATION_ERROR', 'That parent category does not exist', {
          fields: { parentId: 'Unknown category' },
        });
      }
      if (parent.parentId) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Subcategories cannot have their own subcategories',
          {
            fields: { parentId: 'Choose a top-level category' },
          },
        );
      }
    }

    const count = await this.prisma.category.count({ where: { userId } });
    if (count >= MAX_CUSTOM_CATEGORIES) {
      throw new AppError('CONFLICT', `You can create up to ${MAX_CUSTOM_CATEGORIES} categories.`);
    }

    const slug = slugify(input.name);
    await this.assertNameFree(userId, parentId, slug);
    try {
      const created = await this.prisma.category.create({
        data: { userId, parentId, name: input.name, slug, sortOrder: 1000 },
        select,
      });
      const { userId: _owner, ...rest } = created;
      return { ...rest, isSystem: false, children: [] };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw duplicateName();
      }
      throw err;
    }
  }

  async rename(userId: string, id: string, input: UpdateCategoryInput): Promise<void> {
    const category = await this.findOwned(userId, id);
    const slug = slugify(input.name);
    if (slug !== category.slug) await this.assertNameFree(userId, category.parentId, slug);
    try {
      await this.prisma.category.update({ where: { id }, data: { name: input.name, slug } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw duplicateName();
      }
      throw err;
    }
  }

  /**
   * Delete one of the user's categories (and its subcategories). Transactions
   * keep their data and simply lose that category assignment.
   */
  async remove(userId: string, id: string): Promise<{ uncategorized: number }> {
    const category = await this.findOwned(userId, id);
    return this.prisma.$transaction(async (tx) => {
      const ids = [
        id,
        ...(await tx.category.findMany({ where: { parentId: id }, select: { id: true } })).map(
          (c) => c.id,
        ),
      ];
      const affected = await tx.transaction.count({
        where: {
          userId,
          OR: category.parentId
            ? [{ subcategoryId: id }]
            : [{ categoryId: { in: ids } }, { subcategoryId: { in: ids } }],
        },
      });
      await tx.category.delete({ where: { id } });
      return { uncategorized: affected };
    });
  }

  private async findOwned(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, ...visibleCategoryWhere(userId) },
      select: { id: true, userId: true, parentId: true, slug: true },
    });
    if (!category) throw notFound('Category not found');
    if (category.userId === null) {
      throw new AppError(
        'FORBIDDEN',
        'Built-in categories cannot be changed. Create your own instead.',
      );
    }
    return category;
  }

  /** A name must be unique among its siblings, including built-in ones. */
  private async assertNameFree(
    userId: string,
    parentId: string | null,
    slug: string,
  ): Promise<void> {
    const clash = await this.prisma.category.findFirst({
      where: { parentId, slug, ...visibleCategoryWhere(userId) },
      select: { id: true },
    });
    if (clash) throw duplicateName();
  }
}

function duplicateName() {
  return new AppError('CONFLICT', 'A category with this name already exists here', {
    fields: { name: 'Already exists' },
  });
}
