// Seed per docs/04-database-schema.md §7. Idempotent: safe to run again.
// Always: the Setting row and the first admin from env. Dev only: sample data.
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const hash = (s: string) => bcrypt.hash(s, 12);

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');

  await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Owner', email, passwordHash: await hash(password), role: Role.ADMIN },
  });
  console.log(`Seeded settings + admin ${email}`);

  if (process.env.NODE_ENV === 'production') return;

  // ponytail: dev staff share the admin's password; PIN 1234 per 04 §7
  const pinHash = await hash('1234');
  for (const [name, role] of [
    ['Manager', Role.MANAGER],
    ['Cashier', Role.CASHIER],
  ] as const) {
    const staffEmail = `${role.toLowerCase()}@shop.local`;
    await prisma.user.upsert({
      where: { email: staffEmail },
      update: {},
      create: { name, email: staffEmail, passwordHash: await hash(password), pinHash, role },
    });
  }

  const drinks = await prisma.category.upsert({ where: { name: 'Drinks' }, update: {}, create: { name: 'Drinks' } });
  const snacks = await prisma.category.upsert({ where: { name: 'Snacks' }, update: {}, create: { name: 'Snacks' } });

  // [sku, barcode (EAN-13), name, category, price, cost, taxRate, stock]
  const products = [
    ['DRK-001', '8850999320014', 'Water 500ml', drinks.id, '0.50', '0.20', '10.00', 120],
    ['DRK-002', '8851959132012', 'Cola 330ml', drinks.id, '0.90', '0.45', '10.00', 96],
    ['DRK-003', '8850250011106', 'Iced Coffee 250ml', drinks.id, '1.25', '0.60', '10.00', 48],
    ['DRK-004', '8851028002109', 'Green Tea 500ml', drinks.id, '1.00', '0.50', '10.00', 60],
    ['DRK-005', '8858998581016', 'Energy Drink 250ml', drinks.id, '1.50', '0.80', '10.00', 36],
    ['SNK-001', '8850718801015', 'Potato Chips 50g', snacks.id, '1.20', '0.55', '10.00', 40],
    ['SNK-002', '8850157400019', 'Chocolate Bar', snacks.id, '1.00', '0.45', '10.00', 50],
    ['SNK-003', '8851123212021', 'Peanuts 100g', snacks.id, '0.80', '0.35', '10.00', 30],
    ['SNK-004', '8850329113014', 'Cookies 120g', snacks.id, '1.75', '0.90', '10.00', 25],
    ['SNK-005', '8852052110018', 'Instant Noodles', snacks.id, '0.60', '0.25', '0.00', 3],
  ] as const;

  const admin = await prisma.user.findUniqueOrThrow({ where: { email } });
  for (const [sku, barcode, name, categoryId, price, cost, taxRate, stock] of products) {
    if (await prisma.product.findUnique({ where: { sku } })) continue;
    // Invariant 1: stockQty changes only alongside a StockMovement
    await prisma.product.create({
      data: {
        sku,
        barcode,
        name,
        categoryId,
        price,
        cost,
        taxRate,
        stockQty: stock,
        reorderLevel: 10,
        stockMovements: {
          create: { qtyChange: stock, reason: 'RECEIVE', userId: admin.id, note: 'Opening stock (seed)' },
        },
      },
    });
  }

  const customers = [
    ['Sokha Chan', '+85512345678', 'sokha@example.com'],
    ['Dara Kim', '+85598765432', null],
    ['Maly Sok', null, 'maly@example.com'],
  ] as const;
  for (const [name, phone, custEmail] of customers) {
    if (await prisma.customer.findFirst({ where: { name } })) continue;
    await prisma.customer.create({ data: { name, phone, email: custEmail } });
  }

  console.log('Seeded dev data: manager + cashier, 2 categories, 10 products, 3 customers');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
