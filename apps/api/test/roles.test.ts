// Table-driven over 05 §12: the role just below the minimum gets 403, the minimum role does not.
import type { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, makeUser, resetDb, tokenFor } from './fixtures.js';

const x = randomUUID(); // ids that don't exist: past the role check we expect 400/404, never 403

const endpoints: [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, min: Role][] = [
  ['get', '/auth/me', 'CASHIER'],
  ['get', '/categories', 'CASHIER'],
  ['get', '/products', 'CASHIER'],
  ['get', `/products/${x}`, 'CASHIER'],
  ['get', '/customers', 'CASHIER'],
  ['post', '/customers', 'CASHIER'],
  ['post', '/sales', 'CASHIER'],
  ['get', '/sales', 'CASHIER'],
  ['get', `/sales/${x}`, 'CASHIER'],
  ['get', '/settings', 'CASHIER'],
  ['post', '/categories', 'MANAGER'],
  ['patch', `/categories/${x}`, 'MANAGER'],
  ['delete', `/categories/${x}`, 'MANAGER'],
  ['post', '/products', 'MANAGER'],
  ['patch', `/products/${x}`, 'MANAGER'],
  ['post', '/inventory/receive', 'MANAGER'],
  ['post', '/inventory/adjust', 'MANAGER'],
  ['get', '/inventory/movements', 'MANAGER'],
  ['get', `/customers/${x}`, 'MANAGER'],
  ['patch', `/customers/${x}`, 'MANAGER'],
  ['delete', `/customers/${x}`, 'MANAGER'],
  ['post', `/sales/${x}/void`, 'MANAGER'],
  ['get', '/reports/daily', 'MANAGER'],
  ['get', '/reports/products', 'MANAGER'],
  ['get', '/reports/cashiers', 'MANAGER'],
  ['get', '/reports/payments', 'MANAGER'],
  ['get', '/reports/low-stock', 'MANAGER'],
  ['get', '/reports/inventory-value', 'MANAGER'],
  ['put', '/settings', 'ADMIN'],
  ['get', '/users', 'ADMIN'],
  ['get', `/users/${x}`, 'ADMIN'],
  ['post', '/users', 'ADMIN'],
  ['patch', `/users/${x}`, 'ADMIN'],
];

const below: Record<Role, Role | null> = { CASHIER: null, MANAGER: 'CASHIER', ADMIN: 'MANAGER' };
const tokens = {} as Record<Role, string>;

beforeAll(async () => {
  await resetDb();
  for (const r of ['CASHIER', 'MANAGER', 'ADMIN'] as const) tokens[r] = tokenFor(await makeUser(r));
});

describe.each(endpoints)('%s %s (min %s)', (method, path, min) => {
  it('rejects anonymous with 401', async () => {
    expect((await api()[method](`/api${path}`)).status).toBe(401);
  });

  const lower = below[min];
  if (lower)
    it(`${lower} gets 403`, async () => {
      expect((await api()[method](`/api${path}`).set('Authorization', tokens[lower]).send({})).status).toBe(403);
    });

  it(`${min} is let through`, async () => {
    const res = await api()[method](`/api${path}`).set('Authorization', tokens[min]).send({});
    expect([401, 403]).not.toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
});
