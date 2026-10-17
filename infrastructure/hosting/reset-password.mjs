// Sets a new password for one account and signs it out everywhere, for a
// friend who lost both their password and their recovery key. Newer images
// also have `node dist/reset-password.js`, which asks instead. Run on the server:
//
//   docker compose exec -T -e EMAIL=friend@example.com -e NEW_PASSWORD='a long new phrase' \
//     api node --input-type=module < reset-password.mjs
//
// Same hashing settings as apps/api/src/modules/auth/password.ts.
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const email = process.env.EMAIL?.trim().toLowerCase();
const password = process.env.NEW_PASSWORD ?? '';
if (!email || password.length < 10) {
  console.error('Set EMAIL and a NEW_PASSWORD of at least 10 characters.');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.update({ where: { email }, data: { passwordHash } });
  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Password changed for ${email}; ${count} session(s) signed out.`);
} catch (err) {
  console.error(err?.code === 'P2025' ? `No account for ${email}.` : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
