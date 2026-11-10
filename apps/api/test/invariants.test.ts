// 04 §4: after a mixed scenario, every product's stockQty = Σ qtyChange, and money invariants hold.
import { beforeAll, expect, it } from 'vitest';
import { api, makeProduct, makeUser, prisma, resetDb, saleBody, tokenFor } from './fixtures.js';

beforeAll(() => resetDb());

it('stock and money invariants hold after receive, sales, void and adjust', async () => {
  const cashier = await makeUser('CASHIER');
  const mgr = tokenFor(await makeUser('MANAGER'));
  const as = (t: string) => ({ Authorization: t });
  const [a, b] = [
    await makeProduct({ stockQty: 5 }),
    await makeProduct({ stockQty: 0, price: '3.33', taxRate: '7.00' }),
  ];

  await api()
    .post('/api/inventory/receive')
    .set(as(mgr))
    .send({ items: [{ productId: b.id, qty: 12 }] })
    .expect(201);
  const s1 = saleBody(cashier.id, [
    { productId: a.id, unitPrice: '6.50', qty: 2, discount: '0.50' },
    { productId: b.id, unitPrice: '3.33', qty: 3, taxRate: '7.00' },
  ]);
  const s2 = saleBody(cashier.id, [{ productId: a.id, unitPrice: '6.50', qty: 7 }]); // drives a negative
  for (const s of [s1, s2, s1])
    await api()
      .post('/api/sales')
      .set(as(tokenFor(cashier)))
      .send(s)
      .expect((r) => expect([200, 201]).toContain(r.status));
  await api().post(`/api/sales/${s2.id}/void`).set(as(mgr)).send({ reason: 'test' }).expect(200);
  await api()
    .post('/api/inventory/adjust')
    .set(as(mgr))
    .send({ productId: b.id, countedQty: 4, note: 'count' })
    .expect(201);

  const drift = await prisma.$queryRaw<unknown[]>`
    SELECT p.id FROM "Product" p LEFT JOIN "StockMovement" m ON m."productId" = p.id
    GROUP BY p.id HAVING p."stockQty" <> coalesce(sum(m."qtyChange"), 0)`;
  expect(drift).toEqual([]);

  const badSales = await prisma.$queryRaw<unknown[]>`
    SELECT s.id FROM "Sale" s
    WHERE s.total <> s.subtotal - s.discount + s.tax
       OR s.total <> (SELECT sum(amount) FROM "Payment" WHERE "saleId" = s.id)
       OR s.total <> (SELECT sum("lineTotal") FROM "SaleItem" WHERE "saleId" = s.id)`;
  expect(badSales).toEqual([]);

  // A voided sale has exactly one RETURN per item
  const returns = await prisma.stockMovement.count({ where: { saleId: s2.id, reason: 'RETURN' } });
  expect(returns).toBe(s2.items.length);
});
