import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeUser, PASSWORD, resetDb, tokenFor } from './fixtures.js';

let admin: string;
let adminId: string;
let cashier: string;

beforeAll(async () => {
  await resetDb();
  const a = await makeUser('ADMIN');
  admin = tokenFor(a);
  adminId = a.id;
  cashier = tokenFor(await makeUser('CASHIER'));
});

describe('users (ADMIN)', () => {
  it('creates a user without leaking hashes; duplicate email → 409', async () => {
    const res = await api()
      .post('/api/users')
      .set('Authorization', admin)
      .send({ name: 'Kim', email: 'Kim@Shop.com', role: 'CASHIER', password: 'longenough', pin: '4321' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'kim@shop.com', hasPin: true, active: true, lockedUntil: null });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('pinHash');
    const pin = await api().post('/api/auth/pin').send({ email: 'kim@shop.com', pin: '4321' });
    expect(pin.status).toBe(200);

    const dup = await api()
      .post('/api/users')
      .set('Authorization', admin)
      .send({ name: 'Kim 2', email: 'kim@shop.com', role: 'CASHIER', password: 'longenough' });
    expect([dup.status, dup.body.details]).toEqual([409, { field: 'email' }]);
  });

  it('validates password ≥ 8 and PIN 4–6 digits', async () => {
    const base = { name: 'X', email: 'x@shop.com', role: 'CASHIER' };
    expect(
      (
        await api()
          .post('/api/users')
          .set('Authorization', admin)
          .send({ ...base, password: 'short' })
      ).status,
    ).toBe(400);
    const pin = await api()
      .post('/api/users')
      .set('Authorization', admin)
      .send({ ...base, password: 'longenough', pin: '12' });
    expect(pin.status).toBe(400);
  });

  it('PATCH changes password, deactivates, and filters by active', async () => {
    const u = await makeUser('MANAGER');
    await api().patch(`/api/users/${u.id}`).set('Authorization', admin).send({ password: 'new-password' }).expect(200);
    expect((await api().post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: u.email, password: 'new-password' })).status).toBe(200);

    await api().patch(`/api/users/${u.id}`).set('Authorization', admin).send({ active: false }).expect(200);
    const inactive = await api().get('/api/users?active=false').set('Authorization', admin);
    expect(inactive.body.map((x: { id: string }) => x.id)).toEqual([u.id]);
    expect((await api().get(`/api/users/${u.id}`).set('Authorization', admin)).body.active).toBe(false);
  });

  it('an admin cannot demote or deactivate themselves', async () => {
    for (const body of [{ role: 'MANAGER' }, { active: false }]) {
      expect((await api().patch(`/api/users/${adminId}`).set('Authorization', admin).send(body)).status).toBe(400);
    }
    expect((await api().patch(`/api/users/${adminId}`).set('Authorization', admin).send({ name: 'Boss' })).status).toBe(
      200,
    );
  });
});

describe('settings', () => {
  const full = {
    shopName: 'Corner Shop',
    address: '1 Main St',
    phone: '012',
    taxId: 'TIN-1',
    currency: 'KHR',
    timezone: 'Asia/Phnom_Penh',
    receiptFooter: 'Thanks!',
  };

  it('ADMIN replaces the settings; a cashier can read them', async () => {
    const res = await api().put('/api/settings').set('Authorization', admin).send(full);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(full);
    const read = await api().get('/api/settings').set('Authorization', cashier);
    expect(read.body).toMatchObject(full);
    expect(read.body).not.toHaveProperty('id');
  });

  it('rejects an unknown timezone, a bad currency and a partial body', async () => {
    for (const body of [{ ...full, timezone: 'Mars/Base' }, { ...full, currency: 'usd' }, { shopName: 'x' }]) {
      expect((await api().put('/api/settings').set('Authorization', admin).send(body)).status).toBe(400);
    }
  });
});
