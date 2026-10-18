import type { Prisma, PrismaClient } from '@prisma/client';
import type { BackupStatus, RestoreResult } from '@moneylens/types';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from '@moneylens/validation';
import { AppError, notFound } from '../../lib/errors';
import { ignoreChanges, type TransactionsChanged } from '../../lib/change-hooks';

type Tx = Prisma.TransactionClient;

/** Rows written per createMany call, so a large restore stays within query limits. */
const CHUNK = 1000;
/** A restore of a long history can take longer than Prisma's 5 second default. */
const RESTORE_TIMEOUT_MS = 120_000;

const amountText = (v: { toFixed(digits: number): string }) => v.toFixed(2);
const optionalAmount = (v: { toFixed(digits: number): string } | null) =>
  v === null ? null : amountText(v);

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

interface CategoryRow {
  id: string;
  userId: string | null;
  parentId: string | null;
  slug: string;
}

/**
 * Category references that survive a move to another database. System
 * categories have different ids on every install (the Mac, each phone), so
 * they are written by slug; the owner's own categories by their backup id.
 */
function categoryRefs(rows: CategoryRow[]): (id: string | null) => string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (id) => {
    if (!id) return null;
    const row = byId.get(id);
    if (!row) return null;
    if (row.userId) return `custom:${row.id}`;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    return parent ? `system:${parent.slug}/${row.slug}` : `system:${row.slug}`;
  };
}

/**
 * Backup and restore of everything a person entered or imported: the file
 * moves their history to another account, another phone or a hosted server.
 * Sign-in data (password, sessions, recovery key) and MoneyLens AI chats are
 * left out; insights and the money plan figures are recalculated after a
 * restore.
 */
export class BackupService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly onChange: TransactionsChanged = ignoreChanges,
  ) {}

  async status(userId: string): Promise<BackupStatus> {
    const [transactions, imports] = await Promise.all([
      this.prisma.transaction.count({ where: { userId } }),
      this.prisma.import.count({ where: { userId } }),
    ]);
    return { transactions, imports };
  }

  async export(userId: string, now = new Date()): Promise<BackupFile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) throw notFound('Account not found');

    const [categories, merchants, rules, transactions, budgets, profile, plans, dismissed] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { OR: [{ userId: null }, { userId }] },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.merchant.findMany({
          where: { userId },
          include: { aliases: { select: { aliasKey: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.userCategoryRule.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.transaction.findMany({
          where: { userId },
          orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.budget.findMany({ where: { userId }, orderBy: { month: 'asc' } }),
        this.prisma.financialProfile.findUnique({ where: { userId } }),
        this.prisma.moneyPlan.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.recurringPayment.findMany({
          where: { userId, dismissedAt: { not: null } },
          select: { key: true },
        }),
      ]);
    const ref = categoryRefs(categories);
    const own = categories.filter((c) => c.userId === userId);

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      account: { name: user.name },
      // In creation order; a restore puts parents before children itself.
      categories: own.map((c) => ({
        id: c.id,
        parent: ref(c.parentId),
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        color: c.color,
        sortOrder: c.sortOrder,
      })),
      merchants: merchants.map((m) => ({
        id: m.id,
        name: m.name,
        normalizedName: m.normalizedName,
        defaultCategory: ref(m.defaultCategoryId),
        userCategory: ref(m.userCategoryId),
        confidence: m.confidence,
        aliases: m.aliases.map((a) => a.aliasKey),
      })),
      rules: rules.flatMap((r) => {
        const category = ref(r.categoryId);
        return category
          ? [{ matchField: r.matchField, pattern: r.pattern, category, priority: r.priority }]
          : [];
      }),
      transactions: transactions.map((t) => ({
        date: t.transactionDate.toISOString(),
        amount: amountText(t.amount),
        currency: t.currency,
        type: t.transactionType,
        flow: t.flow,
        merchantId: t.merchantId,
        merchantName: t.merchantName,
        description: t.description,
        category: ref(t.categoryId),
        subcategory: ref(t.subcategoryId),
        paymentMethod: t.paymentMethod,
        upiId: t.upiId,
        reference: t.transactionReference,
        source: t.source,
        status: t.status,
        categoryConfidence: t.categoryConfidence,
        notes: t.notes,
      })),
      budgets: budgets.flatMap((b) => {
        const category = ref(b.categoryId);
        return category
          ? [{ category, month: b.month.toISOString().slice(0, 10), amount: amountText(b.amount) }]
          : [];
      }),
      financialProfile: profile
        ? {
            monthlyIncome: optionalAmount(profile.monthlyIncome),
            fixedExpenses: optionalAmount(profile.fixedExpenses),
            emis: optionalAmount(profile.emis),
            insurance: optionalAmount(profile.insurance),
            investments: optionalAmount(profile.investments),
            savingsTarget: optionalAmount(profile.savingsTarget),
            emergencyFundTarget: optionalAmount(profile.emergencyFundTarget),
            emergencyFundCurrent: optionalAmount(profile.emergencyFundCurrent),
            upcomingExpenses: Array.isArray(profile.upcomingExpenses)
              ? (profile.upcomingExpenses as { label: string; amount: string; dueMonth: string }[])
              : null,
          }
        : null,
      moneyPlans: plans.map((p) => ({
        name: p.name,
        inputs: p.inputs,
        allocation: p.allocation,
        schemaVersion: p.schemaVersion,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
      })),
      dismissedRecurring: dismissed.map((d) => d.key),
    };
  }

  /**
   * Load a backup into the account. An account that already has
   * transactions or imports is only overwritten when `replace` is set; its
   * earlier money data is deleted first, in the same database transaction,
   * so a failed restore leaves it as it was.
   */
  async restore(
    userId: string,
    backup: BackupFile,
    opts: { replace: boolean },
  ): Promise<RestoreResult> {
    const existing = await this.status(userId);
    const hasData = existing.transactions > 0 || existing.imports > 0;
    if (hasData && !opts.replace) {
      throw new AppError(
        'CONFLICT',
        `This account already has ${existing.transactions} transactions. Restoring replaces them with the backup.`,
        { reason: 'HAS_DATA', ...existing },
      );
    }

    const merchantIds = await this.prisma.$transaction(
      async (tx) => {
        if (opts.replace) await this.clear(tx, userId);
        return this.load(tx, userId, backup);
      },
      { timeout: RESTORE_TIMEOUT_MS, maxWait: 10_000 },
    );

    await this.onChange(userId);
    // Detection has re-created the recurring series; keep the ones the
    // owner had dismissed hidden. Keys start with the merchant id.
    const keys = backup.dismissedRecurring.map((key) => {
      const [first, ...rest] = key.split('|');
      const mapped = first ? merchantIds.get(first) : undefined;
      return mapped ? [mapped, ...rest].join('|') : key;
    });
    if (keys.length > 0) {
      await this.prisma.recurringPayment.updateMany({
        where: { userId, key: { in: keys }, dismissedAt: null },
        data: { dismissedAt: new Date() },
      });
    }

    return {
      transactions: backup.transactions.length,
      merchants: backup.merchants.length,
      categories: backup.categories.length,
      rules: backup.rules.length,
      budgets: backup.budgets.length,
      replaced: opts.replace && hasData,
    };
  }

  /** Delete the account's money data, keeping the account and its sign-in. */
  private async clear(tx: Tx, userId: string): Promise<void> {
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.import.deleteMany({ where: { userId } });
    await tx.recurringPayment.deleteMany({ where: { userId } });
    await tx.insight.deleteMany({ where: { userId } });
    await tx.aIConversation.deleteMany({ where: { userId } });
    await tx.budget.deleteMany({ where: { userId } });
    await tx.moneyPlan.deleteMany({ where: { userId } });
    await tx.financialProfile.deleteMany({ where: { userId } });
    await tx.userCategoryRule.deleteMany({ where: { userId } });
    await tx.merchant.deleteMany({ where: { userId } });
    // Children first: deleting a parent would cascade, but keep it explicit.
    await tx.category.deleteMany({ where: { userId, parentId: { not: null } } });
    await tx.category.deleteMany({ where: { userId } });
  }

  /** Write the backup's rows; returns backup merchant id -> new merchant id. */
  private async load(tx: Tx, userId: string, backup: BackupFile): Promise<Map<string, string>> {
    // System categories by slug path.
    const system = await tx.category.findMany({
      where: { userId: null },
      select: { id: true, slug: true, parentId: true },
    });
    const systemById = new Map(system.map((c) => [c.id, c]));
    const categoryIds = new Map<string, string>();
    for (const c of system) {
      const parent = c.parentId ? systemById.get(c.parentId) : undefined;
      categoryIds.set(parent ? `system:${parent.slug}/${c.slug}` : `system:${c.slug}`, c.id);
    }
    // A category this install does not have (an older or newer app) is left out.
    const category = (ref: string | null) => (ref ? (categoryIds.get(ref) ?? null) : null);

    // The owner's categories, parents before children.
    const pending = [...backup.categories];
    while (pending.length > 0) {
      const ready = pending.findIndex((c) => !c.parent || categoryIds.has(c.parent));
      // A parent that never appears: attach to the top level instead.
      const next = pending.splice(ready >= 0 ? ready : 0, 1)[0] as BackupFile['categories'][number];
      const parentId = category(next.parent);
      const created = await tx.category.create({
        data: {
          userId,
          parentId,
          name: next.name,
          slug: next.slug,
          icon: next.icon,
          color: next.color,
          sortOrder: next.sortOrder,
        },
        select: { id: true },
      });
      categoryIds.set(`custom:${next.id}`, created.id);
    }

    const merchantIds = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const m of backup.merchants) {
      const same = byName.get(m.normalizedName);
      if (same) {
        merchantIds.set(m.id, same);
        continue;
      }
      const aliases = [...new Set(m.aliases)];
      const created = await tx.merchant.create({
        data: {
          userId,
          name: m.name,
          normalizedName: m.normalizedName,
          defaultCategoryId: category(m.defaultCategory),
          userCategoryId: category(m.userCategory),
          confidence: m.confidence,
          aliases: { create: aliases.map((alias) => ({ alias, aliasKey: alias })) },
        },
        select: { id: true },
      });
      merchantIds.set(m.id, created.id);
      byName.set(m.normalizedName, created.id);
    }

    const rules = new Map<string, BackupFile['rules'][number]>();
    for (const r of backup.rules) rules.set(`${r.matchField}|${r.pattern}`, r);
    const ruleRows = [...rules.values()].flatMap((r) => {
      const categoryId = category(r.category);
      return categoryId
        ? [
            {
              userId,
              matchField: r.matchField,
              pattern: r.pattern,
              categoryId,
              priority: r.priority,
            },
          ]
        : [];
    });
    if (ruleRows.length > 0) await tx.userCategoryRule.createMany({ data: ruleRows });

    for (const part of chunks(backup.transactions)) {
      await tx.transaction.createMany({
        data: part.map((t) => ({
          userId,
          transactionDate: new Date(t.date),
          amount: t.amount,
          currency: t.currency,
          transactionType: t.type,
          flow: t.flow,
          merchantId: t.merchantId ? (merchantIds.get(t.merchantId) ?? null) : null,
          merchantName: t.merchantName,
          description: t.description,
          categoryId: category(t.category),
          subcategoryId: category(t.subcategory),
          paymentMethod: t.paymentMethod,
          upiId: t.upiId,
          transactionReference: t.reference,
          source: t.source,
          status: t.status,
          categoryConfidence: t.categoryConfidence,
          notes: t.notes,
        })),
      });
    }

    const budgets = new Map<string, { categoryId: string; month: string; amount: string }>();
    for (const b of backup.budgets) {
      const categoryId = category(b.category);
      if (categoryId)
        budgets.set(`${categoryId}|${b.month}`, { categoryId, month: b.month, amount: b.amount });
    }
    if (budgets.size > 0) {
      await tx.budget.createMany({
        data: [...budgets.values()].map((b) => ({
          userId,
          categoryId: b.categoryId,
          month: new Date(`${b.month}T00:00:00.000Z`),
          amount: b.amount,
        })),
      });
    }

    if (backup.financialProfile) {
      const { upcomingExpenses, ...amounts } = backup.financialProfile;
      await tx.financialProfile.create({
        data: { userId, ...amounts, upcomingExpenses: upcomingExpenses ?? [] },
      });
    }
    if (backup.moneyPlans.length > 0) {
      await tx.moneyPlan.createMany({
        data: backup.moneyPlans.map((p) => ({
          userId,
          name: p.name,
          inputs: (p.inputs ?? {}) as Prisma.InputJsonValue,
          allocation: (p.allocation ?? {}) as Prisma.InputJsonValue,
          schemaVersion: p.schemaVersion,
          isActive: p.isActive,
          createdAt: new Date(p.createdAt),
        })),
      });
    }

    return merchantIds;
  }
}

/** What `copyAccountData` would do, before anything is changed. */
export interface CopyPlan {
  from: { email: string; transactions: number };
  to: { email: string; transactions: number; imports: number };
}

/**
 * Copy one account's money data into another account on the same server,
 * for example from the demo account to your own (`npm run move-data`). It is
 * a backup and a restore in one step; the source account is left unchanged.
 */
export async function planAccountCopy(
  prisma: PrismaClient,
  fromEmail: string,
  toEmail: string,
): Promise<CopyPlan> {
  if (fromEmail === toEmail) {
    throw new AppError('VALIDATION_ERROR', 'Choose two different accounts.');
  }
  const [from, to] = await Promise.all([
    prisma.user.findUnique({ where: { email: fromEmail }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: toEmail }, select: { id: true } }),
  ]);
  if (!from) throw notFound(`There is no account for ${fromEmail}.`);
  if (!to) throw notFound(`There is no account for ${toEmail}.`);
  const service = new BackupService(prisma);
  const [source, target] = await Promise.all([service.status(from.id), service.status(to.id)]);
  return {
    from: { email: fromEmail, transactions: source.transactions },
    to: { email: toEmail, ...target },
  };
}

export async function copyAccountData(
  prisma: PrismaClient,
  fromEmail: string,
  toEmail: string,
  opts: { replace: boolean; onChange?: TransactionsChanged },
): Promise<RestoreResult> {
  await planAccountCopy(prisma, fromEmail, toEmail);
  const [from, to] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: fromEmail }, select: { id: true } }),
    prisma.user.findUniqueOrThrow({ where: { email: toEmail }, select: { id: true } }),
  ]);
  const service = new BackupService(prisma, opts.onChange);
  return service.restore(to.id, await service.export(from.id), { replace: opts.replace });
}
