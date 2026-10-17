/**
 * Set a new password for an account, from the computer that runs MoneyLens.
 * For someone who has forgotten their password and has no recovery key.
 *
 *   npm run reset-password                    (from the repository folder)
 *   node dist/reset-password.js               (on a server, after the build)
 *
 * It asks for the email and the new password (typing is hidden). EMAIL and
 * NEW_PASSWORD in the environment skip the questions. Every device signed in
 * to that account is signed out.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import { emailSchema, passwordSchema } from '@moneylens/validation';
import { resetPasswordFromServer } from './modules/auth/auth.service';

// Echoes typing except while `hidden` is set, so the password stays off screen.
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!hidden) process.stdout.write(chunk);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
// Reading lines through the iterator keeps any that arrive before they are asked for.
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, secret = false): Promise<string> {
  process.stdout.write(question);
  hidden = secret;
  const answer = ((await lines.next()).value as string | undefined) ?? '';
  hidden = false;
  if (secret && process.stdin.isTTY) process.stdout.write('\n');
  return answer;
}

async function main(): Promise<number> {
  const email = emailSchema.safeParse(process.env.EMAIL ?? (await ask('Email of the account: ')));
  if (!email.success) {
    console.error(email.error.issues[0]?.message ?? 'Enter a valid email address');
    return 1;
  }

  let password = process.env.NEW_PASSWORD;
  if (password === undefined) {
    password = await ask('New password (at least 10 characters): ', true);
    if ((await ask('Type it again: ', true)) !== password) {
      console.error('The two passwords do not match. Nothing was changed.');
      return 1;
    }
  }
  const checked = passwordSchema.safeParse(password);
  if (!checked.success) {
    console.error(
      `${checked.error.issues[0]?.message ?? 'Password is not valid'}. Nothing was changed.`,
    );
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    if (!(await resetPasswordFromServer(prisma, email.data, checked.data))) {
      console.error(`There is no account for ${email.data}. Nothing was changed.`);
      return 1;
    }
    process.stdout.write(
      `Password changed for ${email.data}. Every device was signed out; sign in with the new password.\n`,
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main().finally(() => rl.close());
