import type { Product, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeProduct, makeUser, prisma, resetDb, saleBody, tokenFor } from './fixtures.js';

let cashier: User;
let other: User;
let mgr: string;
let p: Product;

beforeAll(async () => {
  await resetDb();
  cashier = await makeUser('CASHIER');
  other = await makeUser('CASHIER');
  mgr = tokenFor(await makeUser('MANAGER'));
});

const post = (body: object, as: User = cashier) =>
  api().post('/api/sales').set('Authorization', tokenFor(as)).send(body);
const stock = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty;
const counts = async () => [await prisma.sale.count(), await prisma.stockMovement.count({ where: { reason: 'SALE' } })];

describe('POST /sales', () => {
  beforeAll(async () => {
    p = await makeProduct({ price: '6.50', taxRate: '10.00', stockQty: 10 });
  });

  it('happy path: 201, stock decremented, SALE movements, change computed', async () => {
    const body = saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 2, discount: '1.00' }], {
      payments: [{ method: 'CASH', amount: '13.20', tendered: '20.00' }],
    });
    expect(body.totals).toEqual({ subtotal: '13.00', discount: '1.00', tax: '1.20', total: '13.20' });
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: body.id,
      receiptNo: body.receiptNo,
      status: 'COMPLETED',
      total: '13.20',
      syncedById: cashier.id,
      cashier: { id: cashier.id, name: cashier.name },
    });
    expect(res.body.items[0]).toMatchObject({
      unitPrice: '6.50',
      qty: 2,
      discount: '1.00',
      tax: '1.20',
      lineTotal: '13.20',
    });
    expect(res.body.payments[0]).toMatchObject({ method: 'CASH', amount: '13.20', tendered: '20.00', change: '6.80' });
    expect(await stock(p.id)).toBe(8);
    const mv = await prisma.stockMovement.findMany({ where: { saleId: body.id } });
    expect(mv).toMatchObject([{ reason: 'SALE', qtyChange: -2, productId: p.id, userId: cashier.id }]);
  });

  it('idempotent: same id twice → one sale, one decrement, second returns 200', async () => {
    const body = saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]);
    const before = await stock(p.id);
    expect((await post(body)).status).toBe(201);
    const [sales, moves] = await counts();
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(body.id);
    expect(await counts()).toEqual([sales, moves]);
    expect(await stock(p.id)).toBe(before - 1);
  });

  it('concurrent duplicates still make one sale', async () => {
    const body = saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]);
    const before = await stock(p.id);
    const codes = (await Promise.all([post(body), post(body), post(body)])).map((r) => r.status).sort();
    expect(codes).toEqual([200, 200, 201]);
    expect(await prisma.sale.count({ where: { id: body.id } })).toBe(1);
    expect(await stock(p.id)).toBe(before - 1);
  });

  it('totals mismatch → 400 with both values, nothing written', async () => {
    const body = saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]);
    body.totals = { ...body.totals, total: '1.00' };
    body.payments = [{ method: 'CASH', amount: '1.00', tendered: '1.00' }];
    const [sales] = await counts();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Totals mismatch');
    expect(res.body.details.expected.total).toBe('7.15');
    expect(res.body.details.received.total).toBe('1.00');
    expect((await counts())[0]).toBe(sales);
  });

  it('payments ≠ total → 400; split payments that add up → 201', async () => {
    const lines = [{ productId: p.id, unitPrice: '15.00', qty: 1, taxRate: '10.00' }]; // total 16.50
    const short = saleBody(cashier.id, lines, { payments: [{ method: 'CARD', amount: '16.00' }] });
    expect((await post(short)).status).toBe(400);
    const split = saleBody(cashier.id, lines, {
      payments: [
        { method: 'CASH', amount: '10.00', tendered: '10.00' },
        { method: 'CARD', amount: '6.50', reference: 'auth-123' },
      ],
    });
    const res = await post(split);
    expect(res.status).toBe(201);
    expect(res.body.payments.find((x: { method: string }) => x.method === 'CARD').change).toBeNull();
  });

  it('cash tendered < amount → 400', async () => {
    const body = saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]);
    body.payments = [{ method: 'CASH', amount: body.totals.total, tendered: '5.00' }];
    expect((await post(body)).status).toBe(400);
  });

  it('shape rules: no items, qty 0, discount > line, zero payment, numeric money → 400', async () => {
    const ok = () => saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]);
    const bads = [
      { ...ok(), items: [] },
      { ...ok(), items: [{ ...ok().items[0], qty: 0 }] },
      { ...ok(), items: [{ ...ok().items[0], discount: '6.51' }] },
      { ...ok(), payments: [{ method: 'CASH', amount: '0.00' }] },
      { ...ok(), payments: [] },
      { ...ok(), items: [{ ...ok().items[0], unitPrice: 6.5 }] },
    ];
    for (const b of bads) expect((await post(b)).status).toBe(400);
  });

  it('unknown product / customer / cashier → 400 listing the ids', async () => {
    const ghost = randomUUID();
    const body = saleBody(ghost, [{ productId: ghost, unitPrice: '1.00', qty: 1 }], { customerId: ghost });
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({ cashierId: ghost, customerId: ghost, productIds: [ghost] });
  });

  it('same receiptNo with a different id → 409, nothing written', async () => {
    const first = saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]);
    await post(first).expect(201);
    const before = await stock(p.id);
    const clash = {
      ...saleBody(cashier.id, [{ productId: p.id, unitPrice: '6.50', qty: 1 }]),
      receiptNo: first.receiptNo,
    };
    const res = await post(clash);
    expect(res.status).toBe(409);
    expect(await prisma.sale.findUnique({ where: { id: clash.id } })).toBeNull();
    expect(await stock(p.id)).toBe(before);
  });

  it('negative stock is allowed', async () => {
    const low = await makeProduct({ stockQty: 1 });
    await post(saleBody(cashier.id, [{ productId: low.id, unitPrice: '6.50', qty: 3 }])).expect(201);
    expect(await stock(low.id)).toBe(-2);
  });

  it("accepts a deactivated cashier's offline sale (synced by someone else) and an inactive product", async () => {
    const gone = await makeUser('CASHIER', { active: false });
    const retired = await makeProduct();
    await prisma.product.update({ where: { id: retired.id }, data: { active: false } });
    const body = saleBody(gone.id, [{ productId: retired.id, unitPrice: '2.00', qty: 1 }], {
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    const res = await post(body, other);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cashierId: gone.id, syncedById: other.id, createdAt: '2026-01-02T03:04:05.000Z' });
  });

  it('charges the till price, not the current catalog price', async () => {
    const res = await post(saleBody(cashier.id, [{ productId: p.id, unitPrice: '5.00', qty: 1 }]));
    expect([res.status, res.body.items[0].unitPrice]).toEqual([201, '5.00']);
  });
});

describe('GET /sales', () => {
  it('a cashier sees only their own sales from today, whatever the filters', async () => {
    const q = await makeProduct();
    const mine = saleBody(other.id, [{ productId: q.id, unitPrice: '1.00', qty: 1 }]);
    const old = saleBody(other.id, [{ productId: q.id, unitPrice: '1.00', qty: 1 }], {
      createdAt: '2020-01-01T10:00:00.000Z',
    });
    await post(mine, other).expect(201);
    await post(old, other).expect(201);
    const res = await api()
      .get(`/api/sales?cashierId=${cashier.id}&from=2020-01-01`)
      .set('Authorization', tokenFor(other));
    const ids = res.body.data.map((s: { id: string }) => s.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(old.id);
    expect(res.body.data.every((s: { cashierName: string }) => s.cashierName === other.name)).toBe(true);
    expect(res.body.data[0]).toMatchObject({ paymentMethods: ['CASH'], status: 'COMPLETED' });
  });

  it('a manager sees all sales and can filter', async () => {
    const all = await api().get('/api/sales?limit=200').set('Authorization', mgr);
    expect(all.body.total).toBe(await prisma.sale.count());
    const byCashier = await api().get(`/api/sales?cashierId=${other.id}&limit=200`).set('Authorization', mgr);
    expect(byCashier.body.total).toBe(await prisma.sale.count({ where: { cashierId: other.id } }));
    const old = await api().get('/api/sales?from=2020-01-01&to=2020-01-01').set('Authorization', mgr);
    expect(old.body.total).toBe(1);
  });

  it('deviceCode filters to one till, newest receipt number first', async () => {
    const q = await makeProduct();
    for (const n of ['000009', '000011', '000010'])
      await post(
        saleBody(other.id, [{ productId: q.id, unitPrice: '1.00', qty: 1 }], {
          receiptNo: `Z7-${n}`,
          deviceCode: 'Z7',
        }),
        other,
      ).expect(201);
    const res = await api().get('/api/sales?deviceCode=Z7&limit=1').set('Authorization', mgr);
    expect(res.body.total).toBe(3);
    expect(res.body.data.map((s: { receiptNo: string }) => s.receiptNo)).toEqual(['Z7-000011']);
  });

  it('GET /sales/:id: own sale ok, someone else’s → 404 for a cashier, any for a manager', async () => {
    const s = await prisma.sale.findFirstOrThrow({ where: { cashierId: cashier.id } });
    expect((await api().get(`/api/sales/${s.id}`).set('Authorization', tokenFor(cashier))).status).toBe(200);
    expect((await api().get(`/api/sales/${s.id}`).set('Authorization', tokenFor(other))).status).toBe(404);
    expect((await api().get(`/api/sales/${s.id}`).set('Authorization', mgr)).status).toBe(200);
  });
});
