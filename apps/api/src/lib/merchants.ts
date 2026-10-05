import type { Prisma, PrismaClient } from '@prisma/client';
import { merchantKey } from '../modules/imports/pipeline/merchants';

type Db = PrismaClient | Prisma.TransactionClient;

/** Upper-cased, whitespace-collapsed form used for alias matching. */
export function aliasKeyOf(text: string): string {
  return merchantKey(text);
}

/**
 * Find the user's merchant for a display name, creating it if needed, and
 * remember `rawAlias` (e.g. the statement narration's merchant text) so future
 * imports match it directly.
 */
export async function findOrCreateMerchant(
  db: Db,
  userId: string,
  name: string,
  opts: { rawAlias?: string; defaultCategoryId?: string | null; confidence?: number } = {},
): Promise<{ id: string; name: string }> {
  const normalizedName = merchantKey(name);
  const merchant =
    (await db.merchant.findUnique({
      where: { userId_normalizedName: { userId, normalizedName } },
      select: { id: true, name: true },
    })) ??
    (await db.merchant.create({
      data: {
        userId,
        name,
        normalizedName,
        defaultCategoryId: opts.defaultCategoryId ?? null,
        confidence: opts.confidence ?? 0,
      },
      select: { id: true, name: true },
    }));

  const keys = new Set([normalizedName, ...(opts.rawAlias ? [aliasKeyOf(opts.rawAlias)] : [])]);
  for (const aliasKey of keys) {
    if (!aliasKey) continue;
    await db.merchantAlias.upsert({
      where: { merchantId_aliasKey: { merchantId: merchant.id, aliasKey } },
      update: {},
      create: { merchantId: merchant.id, alias: aliasKey, aliasKey },
    });
  }
  return merchant;
}

/** All of the user's merchants keyed by alias and normalised name. */
export async function merchantsByKey(
  db: Db,
  userId: string,
): Promise<Map<string, { id: string; name: string; categoryId: string | null }>> {
  const merchants = await db.merchant.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      normalizedName: true,
      userCategoryId: true,
      defaultCategoryId: true,
      aliases: { select: { aliasKey: true } },
    },
  });
  const map = new Map<string, { id: string; name: string; categoryId: string | null }>();
  for (const m of merchants) {
    const value = { id: m.id, name: m.name, categoryId: m.userCategoryId ?? m.defaultCategoryId };
    map.set(m.normalizedName, value);
    for (const a of m.aliases) if (!map.has(a.aliasKey)) map.set(a.aliasKey, value);
  }
  return map;
}
