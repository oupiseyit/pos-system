// E2E (08 §2): real browser → Vite → API → Postgres, isolated from dev on its own ports and the pos_e2e database.
// Run: npm run e2e (Postgres from `docker compose up -d postgres` must be up).
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env'); // DATABASE_URL credentials; CI sets variables instead
} catch {
  // no .env
}
const db = (process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? '').replace(/\/[^/?]+(\?|$)/, '/pos_e2e$1');
export const ADMIN = { email: 'owner@e2e.test', password: 'e2e-password' };
const api = {
  DATABASE_URL: db,
  PORT: '3100',
  JWT_SECRET: 'e2e-secret-at-least-32-bytes-long!!!',
  NODE_ENV: 'development', // the seed adds the sample shop only outside production
  AUTH_RATE_LIMIT: '1000',
  SEED_ADMIN_EMAIL: ADMIN.email,
  SEED_ADMIN_PASSWORD: ADMIN.password,
};
const front = { API_URL: 'http://localhost:3100' };

export default defineConfig({
  testDir: 'e2e',
  // One shared database and one seeded shop: specs run in order, never in parallel
  workers: 1,
  fullyParallel: false,
  retries: 0, // a retry re-posts the same device's receipt numbers on the same pos_e2e (409), so it can't pass
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 860 },
    timezoneId: 'Asia/Phnom_Penh',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/prepare-db.mjs && npx tsx apps/api/src/index.ts',
      url: 'http://localhost:3100/api/health',
      env: api,
      timeout: 120_000,
      reuseExistingServer: false, // always a freshly seeded database
    },
    {
      command: 'npm run dev -w apps/pos -- --port 5183',
      url: 'http://localhost:5183',
      env: front,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w apps/backoffice -- --port 5184',
      url: 'http://localhost:5184',
      env: front,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'pos', testMatch: 'pos.spec.ts', use: { baseURL: 'http://localhost:5183' } },
    { name: 'backoffice', testMatch: 'backoffice.spec.ts', use: { baseURL: 'http://localhost:5184' } },
  ],
});
