import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeProduct, makeUser, resetDb, saleBody, tokenFor } from './fixtures.js';

let mgr: string;
let cashier: string;
let cashierId: string;

beforeAll(async () => {
  await resetDb();
  mgr = tokenFor(await makeUser('MANAGER'));
  const c = await makeUser('CASHIER');
  cashier = tokenFor(c);
  cashierId = c.id;
});

describe('customers', () => {
  it('a cashier can create and search; duplicate phone → 409; blanks become null', async () => {
    const res = await api()
      .post('/api/customers')
      .set('Authorization', cashier)
      .send({ name: 'Sokha Chan', phone: '+85512345678', email: '', notes: 'VIP' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Sokha Chan', email: null });
    const dup = await api()
      .post('/api/customers')
      .set('Authorization', cashier)
      .send({ name: 'Other', phone: '+85512345678' });
    expect([dup.status, dup.body.details]).toEqual([409, { field: 'phone' }]);
    // two customers without phones don't collide
    await api().post('/api/customers').set('Authorization', cashier).send({ name: 'A', phone: '' }).expect(201);
    await api().post('/api/customers').set('Authorization', cashier).send({ name: 'B', phone: '' }).expect(201);

    const found = await api().get('/api/customers?search=sokha').set('Authorization', cashier);
    expect(found.body).toMatchObject({ total: 1, page: 1, limit: 50 });
    const byPhone = await api().get('/api/customers?search=12345').set('Authorization', cashier);
    expect(byPhone.body.data[0].id).toBe(res.body.id);
  });

  it('rejects a bad email', async () => {
    const res = await api().post('/api/customers').set('Authorization', cashier).send({ name: 'X', email: 'nope' });
    expect(res.status).toBe(400);
  });

  it('detail has stats and recent sales; DELETE → 409 with sales, 204 without', async () => {
    const cust = (await api().post('/api/customers').set('Authorization', cashier).send({ name: 'Dara' })).body;
    const p = await makeProduct();
    const sale = saleBody(cashierId, [{ productId: p.id, unitPrice: '6.50', qty: 2 }], { customerId: cust.id });
    await api().post('/api/sales').set('Authorization', cashier).send(sale).expect(201);

    const res = await api().get(`/api/customers/${cust.id}`).set('Authorization', mgr);
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ salesCount: 1, totalSpent: '14.30' });
    expect(res.body.recentSales[0]).toMatchObject({ receiptNo: sale.receiptNo, customerName: 'Dara', total: '14.30' });
    const list = await api().get('/api/customers?search=Dara').set('Authorization', mgr);
    expect(list.body.data[0]).toMatchObject({ id: cust.id, salesCount: 1, totalSpent: '14.30' });

    const patched = await api().patch(`/api/customers/${cust.id}`).set('Authorization', mgr).send({ notes: 'Regular' });
    expect(patched.body.notes).toBe('Regular');
    expect((await api().delete(`/api/customers/${cust.id}`).set('Authorization', mgr)).status).toBe(409);

    const empty = (await api().post('/api/customers').set('Authorization', cashier).send({ name: 'Temp' })).body;
    expect((await api().delete(`/api/customers/${empty.id}`).set('Authorization', mgr)).status).toBe(204);
    expect((await api().get(`/api/customers/${empty.id}`).set('Authorization', mgr)).status).toBe(404);
  });
});
