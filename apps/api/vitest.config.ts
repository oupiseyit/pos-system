// API tests run against the pos_test database only (08 §4). URL: TEST_DATABASE_URL, else DATABASE_URL → pos_test.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); // never overrides variables already set (e.g. by CI)
} catch {
  // no .env: rely on the environment
}

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, '/pos_test$1') ?? '';
// Tests truncate tables: refuse anything that isn't the test database
if (!url.includes('pos_test')) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) to reach Postgres');
process.env.TEST_DATABASE_URL = url;

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    // One shared database: files run one at a time, each truncating at start
    fileParallelism: false,
    env: { DATABASE_URL: url, JWT_SECRET: 'test-secret-at-least-32-bytes-long!!', NODE_ENV: 'test' },
  },
});
