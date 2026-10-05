import type { PrismaClient } from '@prisma/client';
import type { MerchantOption } from '@moneylens/types';
import { AppError, notFound } from '../../lib/errors';
import { merchantKey } from '../imports/pipeline/merchants';

export class MerchantsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<MerchantOption[]> {
    const rows = await this.prisma.merchant.findMany({
      where: { userId },
      select: { id: true, name: true, _count: { select: { transactions: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((m) => ({ id: m.id, name: m.name, transactionCount: m._count.transactions }));
  }

  private async findOwned(userId: string, id: string) {
    const merchant = await this.prisma.merchant.findFirst({ where: { id, userId } });
    if (!merchant) throw notFound('Merchant not found');
    return merchant;
  }

  /**
   * Rename a merchant. The old name is kept as an alias so future statements
   * that use it still match, and rules keyed on the old name follow it.
   */
  async rename(userId: string, id: string, name: string): Promise<MerchantOption> {
    const merchant = await this.findOwned(userId, id);
    const normalizedName = merchantKey(name);
    const clash = await this.prisma.merchant.findFirst({
      where: { userId, normalizedName, id: { not: id } },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new AppError(
        'CONFLICT',
        `You already have a merchant called ${clash.name}. Merge the two instead.`,
        { merchantId: clash.id },
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.merchant.update({
        where: { id },
        data: { name, normalizedName },
        select: { id: true, name: true, _count: { select: { transactions: true } } },
      });
      await tx.merchantAlias.upsert({
        where: { merchantId_aliasKey: { merchantId: id, aliasKey: merchant.normalizedName } },
        update: {},
        create: {
          merchantId: id,
          alias: merchant.normalizedName,
          aliasKey: merchant.normalizedName,
        },
      });
      await tx.transaction.updateMany({
        where: { userId, merchantId: id },
        data: { merchantName: name },
      });
      await tx.userCategoryRule.updateMany({
        where: { userId, matchField: 'MERCHANT', pattern: merchant.normalizedName },
        data: { pattern: normalizedName },
      });
      return { id: updated.id, name: updated.name, transactionCount: updated._count.transactions };
    });
  }

  /**
   * Merge `id` into `intoId`: its transactions, aliases, rules and recurring
   * payments move to the kept merchant and `id` is deleted. The kept
   * merchant's own category choice wins.
   */
  async merge(userId: string, id: string, intoId: string): Promise<MerchantOption> {
    if (id === intoId) {
      throw new AppError('VALIDATION_ERROR', 'Choose a different merchant to merge into.', {
        fields: { intoId: 'Same merchant' },
      });
    }
    const [from, into] = await Promise.all([
      this.findOwned(userId, id),
      this.findOwned(userId, intoId),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const aliases = await tx.merchantAlias.findMany({
        where: { merchantId: id },
        select: { alias: true, aliasKey: true },
      });
      const keys = new Map(aliases.map((a) => [a.aliasKey, a.alias]));
      keys.set(from.normalizedName, from.normalizedName);
      await tx.merchantAlias.createMany({
        data: [...keys].map(([aliasKey, alias]) => ({ merchantId: intoId, alias, aliasKey })),
        skipDuplicates: true,
      });
      await tx.transaction.updateMany({
        where: { userId, merchantId: id },
        data: { merchantId: intoId, merchantName: into.name },
      });
      await tx.userCategoryRule.updateMany({
        where: { userId, matchField: 'MERCHANT', pattern: from.normalizedName },
        data: { pattern: into.normalizedName },
      });
      await tx.recurringPayment.updateMany({
        where: { userId, merchantId: id },
        data: { merchantId: intoId },
      });
      if (!into.userCategoryId && from.userCategoryId) {
        await tx.merchant.update({
          where: { id: intoId },
          data: { userCategoryId: from.userCategoryId },
        });
      }
      await tx.merchant.delete({ where: { id } });
      const kept = await tx.merchant.findUniqueOrThrow({
        where: { id: intoId },
        select: { id: true, name: true, _count: { select: { transactions: true } } },
      });
      return { id: kept.id, name: kept.name, transactionCount: kept._count.transactions };
    });
  }
}
