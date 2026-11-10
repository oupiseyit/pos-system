import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeProduct, makeUser, prisma, resetDb, tokenFor } from './fixtures.js';

let mgr: string;
let cashier: string;

beforeAll(async () => {
  await resetDb();
  mgr = tokenFor(await makeUser('MANAGER'));
  cashier = tokenFor(await makeUser('CASHIER'));
});

const create = (body: object) => api().post('/api/products').set('Authorization', mgr).send(body);

describe('products', () => {
  it('creates with stockQty 0 and money as 2-decimal strings', async () => {
    const res = await create({ sku: 'COF-250', barcode: '885000', name: 'Coffee beans', price: '6.5', taxRate: '10' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sku: 'COF-250', price: '6.50', cost: '0.00', taxRate: '10.00', stockQty: 0 });
  });

  it('rejects numbers for money and tax > 100', async () => {
    expect((await create({ sku: 'N1', name: 'n', price: 6.5 })).status).toBe(400);
    const res = await create({ sku: 'N2', name: 'n', price: '1.00', taxRate: '100.01' });
    expect(res.status).toBe(400);
    expect(res.body.details.taxRate).toBeDefined();
  });

  it('409 on duplicate SKU and barcode, naming the field', async () => {
    await create({ sku: 'DUP-1', barcode: 'DUP-BC', name: 'a', price: '1.00' });
    const sku = await create({ sku: 'DUP-1', name: 'b', price: '1.00' });
    expect([sku.status, sku.body.details]).toEqual([409, { field: 'sku' }]);
    const bc = await create({ sku: 'DUP-2', barcode: 'DUP-BC', name: 'c', price: '1.00' });
    expect([bc.status, bc.body.details]).toEqual([409, { field: 'barcode' }]);
  });

  it('PATCH ignores stockQty', async () => {
    const p = await makeProduct({ stockQty: 5 });
    const res = await api()
      .patch(`/api/products/${p.id}`)
      .set('Authorization', mgr)
      .send({ name: 'Renamed', stockQty: 999 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed', stockQty: 5 });
  });

  it('search matches name/SKU/barcode case-insensitively; inactive hidden by default', async () => {
    const p = await makeProduct();
    const off = await makeProduct();
    await prisma.product.update({ where: { id: off.id }, data: { active: false } });
    const bySku = await api().get(`/api/products?search=${p.sku.toLowerCase()}`).set('Authorization', cashier);
    expect(bySku.body.data.map((x: { id: string }) => x.id)).toEqual([p.id]);
    const byBarcode = await api().get(`/api/products?search=${off.barcode}`).set('Authorization', cashier);
    expect(byBarcode.body.total).toBe(0);
    const all = await api().get(`/api/products?search=${off.barcode}&active=all`).set('Authorization', cashier);
    expect(all.body.total).toBe(1);
  });

  it('updatedSince returns changed and deactivated products, paginated', async () => {
    const since = new Date();
    await new Promise((r) => setTimeout(r, 5));
    const changed = await makeProduct();
    const deactivated = await makeProduct();
    await api().patch(`/api/products/${deactivated.id}`).set('Authorization', mgr).send({ active: false });
    const res = await api()
      .get(`/api/products?updatedSince=${since.toISOString()}&limit=1`)
      .set('Authorization', cashier);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 1, total: 2 });
    const page2 = await api()
      .get(`/api/products?updatedSince=${since.toISOString()}&limit=1&page=2`)
      .set('Authorization', cashier);
    const ids = [...res.body.data, ...page2.body.data].map((x: { id: string }) => x.id);
    expect(ids.sort()).toEqual([changed.id, deactivated.id].sort());
  });

  it('404 for an unknown id, 400 for a malformed one, limit capped at 200', async () => {
    expect(
      (await api().get('/api/products/6f1c2c5e-6f0b-4a43-9f3a-3c8b7c1b2a10').set('Authorization', cashier)).status,
    ).toBe(404);
    expect((await api().get('/api/products/nope').set('Authorization', cashier)).status).toBe(400);
    expect((await api().get('/api/products?limit=201').set('Authorization', cashier)).status).toBe(400);
  });
});

describe('categories', () => {
  it('CRUD, and DELETE → 409 while products use it', async () => {
    const c = await api().post('/api/categories').set('Authorization', mgr).send({ name: 'Drinks' });
    expect(c.status).toBe(201);
    expect((await api().post('/api/categories').set('Authorization', mgr).send({ name: 'Drinks' })).status).toBe(409);
    const ren = await api()
      .patch(`/api/categories/${c.body.id}`)
      .set('Authorization', mgr)
      .send({ name: 'Cold drinks' });
    expect(ren.body.name).toBe('Cold drinks');

    const p = await create({ sku: 'CAT-1', name: 'x', price: '1.00', categoryId: c.body.id });
    expect((await api().delete(`/api/categories/${c.body.id}`).set('Authorization', mgr)).status).toBe(409);
    const listed = await api().get('/api/categories').set('Authorization', cashier);
    expect(listed.body.find((x: { id: string }) => x.id === c.body.id).productCount).toBe(1);
    await api().patch(`/api/products/${p.body.id}`).set('Authorization', mgr).send({ categoryId: null });
    expect((await api().delete(`/api/categories/${c.body.id}`).set('Authorization', mgr)).status).toBe(204);
    expect((await api().get('/api/categories').set('Authorization', cashier)).body).toEqual([]);
  });

  it('400 when a product references a missing category', async () => {
    const res = await create({ sku: 'CAT-2', name: 'x', price: '1.00', categoryId: crypto.randomUUID() });
    expect(res.status).toBe(400);
  });
});
