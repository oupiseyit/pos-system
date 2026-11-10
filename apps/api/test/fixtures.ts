// Test helpers per 08 §4: every file builds its own data, nothing depends on the seed.
import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { computeTotals } from '../src/totals.js';

export { prisma };
export const PASSWORD = 'password123';
export const PIN = '1234';

/** Fresh app per call: a new rate-limit counter too. */
export const api = () => request(createApp());

export async function resetDb(timezone = 'UTC') {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Payment", "SaleItem", "StockMovement", "Sale", "Customer", "Product", "Category", "User", "Setting" CASCADE',
  );
  await prisma.setting.create({ data: { id: 1, timezone } });
}

// bcrypt cost 4 keeps tests fast; compare() works with any cost
const fastHash = (s: string) => bcrypt.hash(s, 4);

export async function makeUser(role: Role, extra: { active?: boolean; name?: string } = {}) {
  const tag = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      name: extra.name ?? `${role} ${tag}`,
      email: `${role.toLowerCase()}-${tag}@test.local`,
      role,
      active: extra.active ?? true,
      passwordHash: await fastHash(PASSWORD),
      pinHash: await fastHash(PIN),
    },
  });
}

export const tokenFor = (u: { id: string; role: Role }) => `Bearer ${signToken(u)}`;

export async function makeProduct(extra: { price?: string; taxRate?: string; stockQty?: number; cost?: string } = {}) {
  const tag = randomUUID().slice(0, 8);
  const stockQty = extra.stockQty ?? 0;
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const product = await prisma.product.create({
    data: {
      sku: `SKU-${tag}`,
      barcode: `BC-${tag}`,
      name: `Product ${tag}`,
      price: extra.price ?? '6.50',
      cost: extra.cost ?? '4.00',
      taxRate: extra.taxRate ?? '10.00',
      reorderLevel: 5,
      stockQty,
    },
  });
  // Opening stock goes through the ledger, like the seed (invariant 1)
  if (stockQty) {
    const userId = admin?.id ?? (await makeUser('ADMIN')).id;
    await prisma.stockMovement.create({
      data: { productId: product.id, qtyChange: stockQty, reason: 'RECEIVE', userId },
    });
  }
  return product;
}

type Line = { productId: string; unitPrice: string; qty: number; discount?: string; taxRate?: string };

let receiptSeq = 0;

/** A valid POST /sales body; pays the exact total in cash unless payments are given. */
export function saleBody(cashierId: string, lines: Line[], extra: Record<string, unknown> = {}) {
  const items = lines.map((l) => ({
    productId: l.productId,
    nameSnapshot: 'Item',
    unitPrice: l.unitPrice,
    qty: l.qty,
    discount: l.discount ?? '0.00',
    taxRate: l.taxRate ?? '10.00',
  }));
  const { totals } = computeTotals(items);
  return {
    id: randomUUID(),
    receiptNo: `T1-${String(++receiptSeq).padStart(6, '0')}-${randomUUID().slice(0, 4)}`,
    deviceCode: 'T1',
    cashierId,
    customerId: null,
    createdAt: new Date().toISOString(),
    items,
    totals,
    payments: [{ method: 'CASH', amount: totals.total, tendered: totals.total }],
    ...extra,
  };
}
