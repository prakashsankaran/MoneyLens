/**
 * Copy everything from one MoneyLens account to another on this computer,
 * for example statements imported while signed in to the demo account.
 *
 *   npm run move-data                       (from the repository folder)
 *   node dist/move-data.js                  (on a server, after the build)
 *
 * It lists the accounts, asks which to copy from and to, and asks you to type
 * COPY (or REPLACE, when the destination already has transactions) before
 * changing anything. FROM_EMAIL, TO_EMAIL and CONFIRM in the environment skip
 * the questions. The account copied from is left as it was.
 */
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import { emailSchema } from '@moneylens/validation';
import { AnalyticsDataSource } from './lib/analytics-data';
import { AppError } from './lib/errors';
import { copyAccountData, planAccountCopy } from './modules/backup/backup.service';
import { RecurringService } from './modules/recurring/recurring.service';

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function email(envValue: string | undefined, question: string): Promise<string | null> {
  const parsed = emailSchema.safeParse(envValue ?? (await rl.question(question)));
  if (!parsed.success) {
    console.error(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
    return null;
  }
  return parsed.data;
}

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.user.findMany({
      select: { email: true, _count: { select: { transactions: true } } },
      orderBy: { createdAt: 'asc' },
    });
    process.stdout.write('Accounts on this computer:\n');
    for (const a of accounts) {
      process.stdout.write(`  ${a.email}  (${a._count.transactions} transactions)\n`);
    }

    const from = await email(process.env.FROM_EMAIL, 'Copy from (email): ');
    if (!from) return 1;
    const to = await email(process.env.TO_EMAIL, 'Copy to (email): ');
    if (!to) return 1;

    const plan = await planAccountCopy(prisma, from, to);
    const replace = plan.to.transactions > 0 || plan.to.imports > 0;
    const word = replace ? 'REPLACE' : 'COPY';
    process.stdout.write(
      `\nThis copies ${plan.from.transactions} transactions, with their merchants, categories, rules, budgets and money plan, from ${from} to ${to}.\n` +
        (replace
          ? `${to} already has ${plan.to.transactions} transactions. They will be deleted and replaced.\n`
          : '') +
        `${from} is not changed.\n`,
    );
    const answer = process.env.CONFIRM ?? (await rl.question(`Type ${word} to go ahead: `));
    if (answer.trim() !== word) {
      console.error('Nothing was changed.');
      return 1;
    }

    const recurring = new RecurringService(prisma, new AnalyticsDataSource(prisma));
    const result = await copyAccountData(prisma, from, to, {
      replace,
      onChange: (userId) => recurring.refresh(userId),
    });
    process.stdout.write(
      `Done. ${result.transactions} transactions and ${result.merchants} merchants are now in ${to}. Sign in as ${to} to see them.\n`,
    );
    return 0;
  } catch (err) {
    if (err instanceof AppError) {
      console.error(`${err.message} Nothing was changed.`);
      return 1;
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main().finally(() => rl.close());
