// E2E database: pos_e2e (never the dev or unit-test database). Migrate, wipe, then run the dev seed so
// every run starts from the same shop: Owner (admin), manager@shop.local, cashier@shop.local (PIN 1234).
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '';
if (!url.includes('pos_e2e')) throw new Error(`refusing to wipe ${url}: E2E runs on pos_e2e only`);

execSync('npx prisma migrate deploy --schema prisma/schema.prisma', { stdio: 'inherit' });
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(
  'TRUNCATE "Payment", "SaleItem", "StockMovement", "Sale", "Customer", "Product", "Category", "User", "Setting" CASCADE',
);
await prisma.$disconnect();
execSync('npx tsx apps/api/src/seed.ts', { stdio: 'inherit' });
