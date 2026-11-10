import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeProduct, makeUser, prisma, resetDb, tokenFor } from './fixtures.js';

let mgr: string;
let mgrName: string;

beforeAll(async () => {
  await resetDb();
  const m = await makeUser('MANAGER', { name: 'Mona' });
  mgr = tokenFor(m);
  mgrName = m.name;
});

const stock = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty;

describe('inventory', () => {
  it('receive increases stock, writes RECEIVE movements and updates cost', async () => {
    const a = await makeProduct({ stockQty: 2 });
    const b = await makeProduct();
    const res = await api()
      .post('/api/inventory/receive')
      .set('Authorization', mgr)
      .send({
        note: 'Invoice #4411',
        items: [
          { productId: a.id, qty: 24, cost: '3.90' },
          { productId: b.id, qty: 6 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.movements).toHaveLength(2);
    expect(res.body.movements[0]).toMatchObject({ reason: 'RECEIVE', qtyChange: 24, note: 'Invoice #4411' });
    expect([await stock(a.id), await stock(b.id)]).toEqual([26, 6]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).cost.toFixed(2)).toBe('3.90');
  });

  it('receive is all-or-nothing and rejects qty ≤ 0', async () => {
    const a = await makeProduct({ stockQty: 1 });
    const bad = await api()
      .post('/api/inventory/receive')
      .set('Authorization', mgr)
      .send({
        items: [
          { productId: a.id, qty: 5 },
          { productId: crypto.randomUUID(), qty: 1 },
        ],
      });
    expect(bad.status).toBe(404);
    expect(await stock(a.id)).toBe(1);
    const zero = await api()
      .post('/api/inventory/receive')
      .set('Authorization', mgr)
      .send({ items: [{ productId: a.id, qty: 0 }] });
    expect(zero.status).toBe(400);
  });

  it('oversized quantities are a 400, not a DB overflow 500', async () => {
    const p = await makeProduct({ stockQty: 1 });
    const big = 99999999999;
    const adj = await api()
      .post('/api/inventory/adjust')
      .set('Authorization', mgr)
      .send({ productId: p.id, countedQty: big, note: 'n' });
    const rec = await api()
      .post('/api/inventory/receive')
      .set('Authorization', mgr)
      .send({ items: [{ productId: p.id, qty: big }] });
    expect([adj.status, rec.status]).toEqual([400, 400]);
  });

  it('count 10 → 8 writes ADJUST −2', async () => {
    const p = await makeProduct({ stockQty: 10 });
    const res = await api()
      .post('/api/inventory/adjust')
      .set('Authorization', mgr)
      .send({ productId: p.id, countedQty: 8, note: 'Monthly count' });
    expect(res.status).toBe(201);
    expect(res.body.movement).toMatchObject({ reason: 'ADJUST', qtyChange: -2, note: 'Monthly count' });
    expect(await stock(p.id)).toBe(8);
  });

  it('count with no change writes nothing (200, movement null)', async () => {
    const p = await makeProduct({ stockQty: 4 });
    const before = await prisma.stockMovement.count();
    const res = await api()
      .post('/api/inventory/adjust')
      .set('Authorization', mgr)
      .send({ productId: p.id, countedQty: 4, note: 'Count' });
    expect([res.status, res.body]).toEqual([200, { movement: null }]);
    expect(await prisma.stockMovement.count()).toBe(before);
  });

  it('adjust without a note → 400', async () => {
    const p = await makeProduct({ stockQty: 4 });
    const res = await api()
      .post('/api/inventory/adjust')
      .set('Authorization', mgr)
      .send({ productId: p.id, countedQty: 1 });
    expect(res.status).toBe(400);
    expect(res.body.details.note).toBeDefined();
  });

  it('movements are newest first with product and user names, filterable', async () => {
    const p = await makeProduct({ stockQty: 3 });
    await api()
      .post('/api/inventory/adjust')
      .set('Authorization', mgr)
      .send({ productId: p.id, countedQty: 1, note: 'n' });
    const res = await api().get(`/api/inventory/movements?productId=${p.id}`).set('Authorization', mgr);
    expect(res.body.total).toBe(2);
    expect(res.body.data.map((m: { reason: string }) => m.reason)).toEqual(['ADJUST', 'RECEIVE']);
    expect(res.body.data[0]).toMatchObject({ productName: p.name, userName: mgrName, receiptNo: null });
    const adj = await api().get(`/api/inventory/movements?productId=${p.id}&reason=ADJUST`).set('Authorization', mgr);
    expect(adj.body.total).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    const dated = await api()
      .get(`/api/inventory/movements?productId=${p.id}&from=${today}&to=${today}`)
      .set('Authorization', mgr);
    expect(dated.body.total).toBe(2);
  });
});
