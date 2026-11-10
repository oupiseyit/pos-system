// Create (if missing) and reset the pos_test database used by API tests: migrations only, no seed.
// URL: TEST_DATABASE_URL, else DATABASE_URL with the database name swapped for pos_test.
import { execSync } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, '/pos_test$1');
if (!url?.includes('pos_test')) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) to reach Postgres');

execSync('npx prisma migrate reset --force --skip-seed', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
