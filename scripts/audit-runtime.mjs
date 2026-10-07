// Fails when a package that ships with the API or the web app has a high or
// critical advisory, unless the advisory is listed below with a reason and a
// review date. Development tooling (Expo CLI, Jest, build tools) is reported
// by `npm audit` but does not run in production, so it is not checked here.
import { execFileSync } from 'node:child_process';

/** Advisories reviewed and accepted, with the reason. Each one expires. */
const ACCEPTED = {
  'GHSA-ggr8-5vv4-36mx': {
    reason:
      'deepmerge-ts inside the Prisma CLI config loader. It only merges our own prisma config, never request data. Prisma pins 7.x, and forcing 8.x breaks the CLI.',
    reviewBy: '2027-01-31',
  },
};

let raw;
try {
  raw = execFileSync(
    'npm',
    ['audit', '--omit=dev', '--json', '-w', '@moneylens/api', '-w', '@moneylens/web'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout;
}
const report = JSON.parse(raw);

const today = new Date().toISOString().slice(0, 10);
const problems = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue; // a parent of a vulnerable package
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = via.url?.split('/').pop();
    const accepted = id && ACCEPTED[id];
    if (accepted && accepted.reviewBy >= today) {
      console.log(`accepted ${id} in ${name}: ${accepted.reason}`);
      continue;
    }
    problems.push(
      `${via.severity} ${name}: ${via.title} (${via.url})${accepted ? ' — acceptance expired' : ''}`,
    );
  }
}

if (problems.length) {
  console.error('Runtime dependencies with high or critical advisories:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('No unaccepted high or critical advisories in runtime dependencies.');
