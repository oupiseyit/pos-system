import type { User } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeProduct, makeUser, prisma, resetDb, saleBody, tokenFor } from './fixtures.js';

let cashier: User;
let mgr: User;

beforeAll(async () => {
  await resetDb();
  cashier = await makeUser('CASHIER');
  mgr = await makeUser('MANAGER');
});

const sell = async (productId: string, qty: number) => {
  const body = saleBody(cashier.id, [{ productId, unitPrice: '2.00', qty }]);
  await api().post('/api/sales').set('Authorization', tokenFor(cashier)).send(body).expect(201);
  return body;
};
const voidSale = (id: string, as: User, body: object = { reason: 'Wrong items rung up' }) =>
  api().post(`/api/sales/${id}/void`).set('Authorization', tokenFor(as)).send(body);

describe('POST /sales/:id/void', () => {
  it('restores stock with one RETURN movement per item and records who/why', async () => {
    const p = await makeProduct({ stockQty: 10 });
    const s = await sell(p.id, 3);
    const res = await voidSale(s.id, mgr);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Wrong items rung up',
      voidedById: mgr.id,
      voidedBy: { id: mgr.id, name: mgr.name },
    });
    expect(res.body.voidedAt).toBeTruthy();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(10);
    const ret = await prisma.stockMovement.findMany({ where: { saleId: s.id, reason: 'RETURN' } });
    expect(ret).toMatchObject([{ qtyChange: 3, userId: mgr.id }]);
  });

  it('a second void → 409 and stock is restored only once', async () => {
    const p = await makeProduct({ stockQty: 5 });
    const s = await sell(p.id, 2);
    await voidSale(s.id, mgr).expect(200);
    expect((await voidSale(s.id, mgr)).status).toBe(409);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty).toBe(5);
  });

  it('concurrent voids restore stock once', async () => {
    const p = await makeProduct({ stockQty: 5 });
    const s = await sell(p.id, 2);
    const codes = (await Promise.all([voidSale(s.id, mgr), voidSale(s.id, mgr)])).map((r) => r.status).sort();
    expect(codes).toEqual([200, 409]);
    expect(await prisma.stockMovement.count({ where: { saleId: s.id, reason: 'RETURN' } })).toBe(1);
  });

  it('cashier → 403, missing reason → 400, unknown sale → 404', async () => {
    const p = await makeProduct({ stockQty: 5 });
    const s = await sell(p.id, 1);
    expect((await voidSale(s.id, cashier)).status).toBe(403);
    expect((await voidSale(s.id, mgr, {})).status).toBe(400);
    expect((await voidSale(crypto.randomUUID(), mgr)).status).toBe(404);
  });

  it('a voided sale is excluded from /reports/daily', async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Payment", "SaleItem", "StockMovement", "Sale" CASCADE');
    const p = await makeProduct({ stockQty: 5 });
    await sell(p.id, 1);
    const s = await sell(p.id, 1);
    await voidSale(s.id, mgr).expect(200);
    const today = new Date().toISOString().slice(0, 10);
    const res = await api().get(`/api/reports/daily?from=${today}&to=${today}`).set('Authorization', tokenFor(mgr));
    expect(res.body.totals).toMatchObject({ salesCount: 1, total: '2.20' });
  });
});
