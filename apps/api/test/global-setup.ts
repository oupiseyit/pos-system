// Bring pos_test up to the latest migration once per run. `migrate deploy` creates the database if
// missing and never drops data; each test file truncates what it needs (fixtures.resetDb).
import { execSync } from 'node:child_process';

export default function setup() {
  execSync('npx prisma migrate deploy --schema ../../prisma/schema.prisma', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
