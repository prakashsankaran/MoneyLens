/**
 * Seeds system categories and a demo user with six months of realistic,
 * fictional Indian transactions so the dashboard is useful immediately.
 *
 *   npm run db:seed
 *
 * Re-running is safe: categories are upserted and the demo user is recreated.
 * Refuses to run in production.
 */
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { addMonths, monthKeyOf, paiseToRupeeString } from '@moneylens/shared';
import { AnalyticsDataSource } from '../src/lib/analytics-data';
import { hashPassword } from '../src/modules/auth/password';
import { SYSTEM_CATEGORIES } from '../src/modules/categories/system-categories';
import { RecurringService } from '../src/modules/recurring/recurring.service';
import { DEMO_MERCHANTS, generateDemoTransactions } from './demo/demo-data';

export const DEMO_EMAIL = 'demo@moneylens.app';
export const DEMO_PASSWORD = 'moneylens-demo';

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

export async function seedDemoUser(
  prisma: PrismaClient,
  opts: { endMonth: string; email?: string },
): Promise<{ userId: string; transactionCount: number }> {
  const email = opts.email ?? DEMO_EMAIL;
  const categoryPaths = await seedCategories(prisma);

  // Cascades remove all of the previous demo user's data.
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: { email, name: 'Aarav (Demo)', passwordHash: await hashPassword(DEMO_PASSWORD) },
  });

  const merchantIds = new Map<string, string>();
  for (const m of DEMO_MERCHANTS) {
    const path = categoryPaths.get(m.category);
    if (!path) throw new Error(`Demo merchant ${m.key} uses unknown category ${m.category}`);
    const merchant = await prisma.merchant.create({
      data: {
        userId: user.id,
        name: m.name,
        normalizedName: m.name.toUpperCase(),
        defaultCategoryId: path.subcategoryId,
        confidence: 0.95,
        aliases: {
          create: m.aliases.map((alias) => ({
            alias,
            aliasKey: alias.toUpperCase().replace(/\s+/g, ' ').trim(),
          })),
        },
      },
    });
    merchantIds.set(m.key, merchant.id);
  }

  const merchantByKey = new Map(DEMO_MERCHANTS.map((m) => [m.key, m]));
  const transactions = generateDemoTransactions({ endMonth: opts.endMonth });

  await prisma.transaction.createMany({
    data: transactions.map((tx) => {
      const merchant = merchantByKey.get(tx.merchantKey);
      const path = merchant ? categoryPaths.get(merchant.category) : undefined;
      return {
        userId: user.id,
        transactionDate: tx.date,
        amount: paiseToRupeeString(tx.amountPaise),
        transactionType: tx.type,
        flow: tx.flow,
        merchantId: merchantIds.get(tx.merchantKey) ?? null,
        merchantName: merchant?.name ?? null,
        description: tx.description,
        categoryId: path?.categoryId ?? null,
        subcategoryId: path?.subcategoryId ?? null,
        paymentMethod: tx.paymentMethod,
        upiId: tx.upiId,
        transactionReference: tx.reference,
        source: 'MANUAL' as const,
        status: 'CONFIRMED' as const,
        categoryConfidence: 0.95,
      };
    }),
  });

  // Detect and store recurring payments, as an import would.
  await new RecurringService(prisma, new AnalyticsDataSource(prisma)).refresh(user.id);

  return { userId: user.id, transactionCount: transactions.length };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }
  const prisma = new PrismaClient();
  try {
    // The most recent complete month, so the demo always looks current.
    const endMonth = addMonths(monthKeyOf(new Date()), -1);
    const { transactionCount } = await seedDemoUser(prisma, { endMonth });
    console.log(
      `Seeded ${transactionCount} demo transactions ending ${endMonth}.\n` +
        `Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly (tests import the functions above).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
