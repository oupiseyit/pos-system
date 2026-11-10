import type { User } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeProduct, makeUser, prisma, resetDb, saleBody, tokenFor } from './fixtures.js';

// Shop in Phnom Penh (UTC+7, no DST): local midnight Nov 6 = 2026-11-05T17:00Z
let mgr: string;
let cashier: User;

const get = (path: string) => api().get(`/api/reports/${path}`).set('Authorization', mgr);

beforeAll(async () => {
  await resetDb('Asia/Phnom_Penh');
  cashier = await makeUser('CASHIER', { name: 'Sophea' });
  mgr = tokenFor(await makeUser('MANAGER'));
  const p = await makeProduct({ price: '10.00', taxRate: '10.00', cost: '4.00', stockQty: 50 });
  const sell = (createdAt: string, payments?: object[]) => {
    const body = saleBody(cashier.id, [{ productId: p.id, unitPrice: '10.00', qty: 1 }], { createdAt });
    return api()
      .post('/api/sales')
      .set('Authorization', tokenFor(cashier))
      .send(payments ? { ...body, payments } : body)
      .expect(201);
  };
  await sell('2026-11-04T17:30:00.000Z'); // Nov 5, 00:30 local
  await sell('2026-11-05T16:30:00.000Z', [{ method: 'CASH', amount: '11.00', tendered: '20.00' }]); // Nov 5, 23:30
  await sell('2026-11-05T17:30:00.000Z', [{ method: 'CARD', amount: '11.00' }]); // Nov 6, 00:30
});

describe('reports', () => {
  it('daily buckets sales on both sides of local midnight into the right days', async () => {
    const res = await get('daily?from=2026-11-05&to=2026-11-06');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { date: '2026-11-05', salesCount: 2, subtotal: '20.00', discount: '0.00', tax: '2.00', total: '22.00' },
      { date: '2026-11-06', salesCount: 1, subtotal: '10.00', discount: '0.00', tax: '1.00', total: '11.00' },
    ]);
    expect(res.body.totals).toEqual({
      salesCount: 3,
      subtotal: '30.00',
      discount: '0.00',
      tax: '3.00',
      total: '33.00',
    });
  });

  it('daily on an empty range returns zero totals; bad ranges → 400', async () => {
    const res = await get('daily?from=2020-01-01&to=2020-01-02');
    expect(res.body).toEqual({
      data: [],
      totals: { salesCount: 0, subtotal: '0.00', discount: '0.00', tax: '0.00', total: '0.00' },
    });
    expect((await get('daily')).status).toBe(400);
    expect((await get('daily?from=2026-11-06&to=2026-11-05')).status).toBe(400);
  });

  it('payments sums cash and card, with tendered/change for cash only', async () => {
    const res = await get('payments?from=2026-11-05&to=2026-11-06');
    expect(res.body.data).toEqual([
      { method: 'CASH', count: 2, amount: '22.00', tendered: '31.00', change: '9.00' },
      { method: 'CARD', count: 1, amount: '11.00' },
    ]);
  });

  it('products and cashiers', async () => {
    const products = await get('products?from=2026-11-05&to=2026-11-05');
    expect(products.body.data).toMatchObject([
      { qty: 2, net: '20.00', tax: '2.00', total: '22.00', cost: '8.00', margin: '12.00' },
    ]);
    const cashiers = await get('cashiers?from=2026-11-05&to=2026-11-06');
    expect(cashiers.body.data).toEqual([
      { cashierId: cashier.id, name: 'Sophea', salesCount: 3, total: '33.00', voidCount: 0 },
    ]);
  });

  it('low-stock lists active products at/below reorder level, negatives first', async () => {
    const neg = await makeProduct({ stockQty: 0 });
    await prisma.product.update({ where: { id: neg.id }, data: { stockQty: -3 } });
    const low = await makeProduct({ stockQty: 2 });
    const off = await makeProduct({ stockQty: 0 });
    await prisma.product.update({ where: { id: off.id }, data: { active: false } });
    const res = await get('low-stock');
    const ids = res.body.data.map((r: { productId: string }) => r.productId);
    expect(ids).toEqual([neg.id, low.id]);
    expect(res.body.data[0]).toMatchObject({ stockQty: -3, reorderLevel: 5 });
  });

  it('inventory-value counts negative stock as 0', async () => {
    const res = await get('inventory-value');
    // 47 × 4.00 from the sold product, 2 × 4.00 from `low`, the −3 product counts 0
    expect(res.body.totalValue).toBe('196.00');
    expect(res.body.items.find((i: { stockQty: number }) => i.stockQty === -3).value).toBe('0.00');
  });

  it('?format=csv returns text/csv with a header and a TOTAL row', async () => {
    const res = await get('daily?from=2026-11-05&to=2026-11-06&format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.text.trim().split('\n')).toEqual([
      'date,salesCount,subtotal,discount,tax,total',
      '2026-11-05,2,20.00,0.00,2.00,22.00',
      '2026-11-06,1,10.00,0.00,1.00,11.00',
      'TOTAL,3,30.00,0.00,3.00,33.00',
    ]);
    expect((await get('low-stock?format=csv')).headers['content-type']).toMatch(/^text\/csv/);
    expect((await get('low-stock?format=xml')).status).toBe(400);
    expect((await get('daily?from=2026-11-05&to=2026-11-06&format=xml')).status).toBe(400);
  });
});
