import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { api, makeUser, PASSWORD, PIN, prisma, resetDb, tokenFor } from './fixtures.js';

beforeAll(() => resetDb());

describe('POST /auth/login', () => {
  it('returns a token and user on good credentials (email case-insensitive)', async () => {
    const u = await makeUser('MANAGER');
    const res = await api().post('/api/auth/login').send({ email: u.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: u.id, name: u.name, email: u.email, role: 'MANAGER' });
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body).toEqual(res.body.user);
  });

  it('401 on a bad password, an unknown email and an inactive user', async () => {
    const u = await makeUser('MANAGER');
    const off = await makeUser('MANAGER', { active: false });
    for (const body of [
      { email: u.email, password: 'wrong-password' },
      { email: 'nobody@test.local', password: PASSWORD },
      { email: off.email, password: PASSWORD },
    ]) {
      const res = await api().post('/api/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid email or password' });
    }
  });

  it('400 with zod field errors on a bad body', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('429 after 10 auth requests per minute from one IP', async () => {
    const app = api();
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await app.post('/api/auth/login').send({})).status);
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('AUTH_RATE_LIMIT', () => {
  const withLimit = (v: string, fn: () => unknown) => {
    const old = process.env.AUTH_RATE_LIMIT;
    process.env.AUTH_RATE_LIMIT = v;
    try {
      return fn();
    } finally {
      process.env.AUTH_RATE_LIMIT = old;
    }
  };

  it('sets the per-minute limit', async () => {
    const app = withLimit('3', () => api()) as ReturnType<typeof api>;
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await app.post('/api/auth/login').send({})).status);
    expect(codes).toEqual([400, 400, 400, 429]);
  });

  it('rejects a value that is not a whole number ≥ 1', () => {
    for (const v of ['0', 'abc', '2.5']) expect(() => withLimit(v, () => createApp())).toThrow(/AUTH_RATE_LIMIT/);
  });
});

describe('rate limit scope', () => {
  it('a spoofed X-Forwarded-For does not reset the limit, and /auth/me is not limited', async () => {
    const app = api();
    for (let i = 0; i < 10; i++) await app.post('/api/auth/login').send({});
    const spoofed = await app.post('/api/auth/login').set('X-Forwarded-For', '203.0.113.9').send({});
    expect(spoofed.status).toBe(429);
    const u = await makeUser('CASHIER');
    expect((await app.get('/api/auth/me').set('Authorization', tokenFor(u))).status).toBe(200);
  });
});

describe('POST /auth/pin', () => {
  it('logs in with the right PIN', async () => {
    const u = await makeUser('CASHIER');
    const res = await api().post('/api/auth/pin').send({ email: u.email, pin: PIN });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('CASHIER');
  });

  it('locks after 5 failures (423), stays locked, and an admin unlock works', async () => {
    const u = await makeUser('CASHIER');
    const admin = await makeUser('ADMIN');
    const codes = [];
    for (let i = 0; i < 5; i++)
      codes.push((await api().post('/api/auth/pin').send({ email: u.email, pin: '9999' })).status);
    expect(codes).toEqual([401, 401, 401, 401, 423]);

    const locked = await api().post('/api/auth/pin').send({ email: u.email, pin: PIN });
    expect(locked.status).toBe(423);
    expect(locked.body.error).toBe('Locked');
    expect(new Date(locked.body.details.lockedUntil).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);

    const unlock = await api().patch(`/api/users/${u.id}`).set('Authorization', tokenFor(admin)).send({ unlock: true });
    expect(unlock.status).toBe(200);
    expect(unlock.body.lockedUntil).toBeNull();
    expect((await api().post('/api/auth/pin').send({ email: u.email, pin: PIN })).status).toBe(200);
  });

  it('a successful PIN resets the failure counter', async () => {
    const u = await makeUser('CASHIER');
    for (let i = 0; i < 4; i++) await api().post('/api/auth/pin').send({ email: u.email, pin: '9999' });
    await api().post('/api/auth/pin').send({ email: u.email, pin: PIN });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedPinAttempts).toBe(0);
  });
});

describe('requireAuth', () => {
  it('401 without a token, with garbage and with an expired token', async () => {
    const u = await makeUser('CASHIER');
    const expired = jwt.sign({ role: u.role }, process.env.JWT_SECRET ?? '', { subject: u.id, expiresIn: -10 });
    for (const auth of [undefined, 'Bearer nonsense', `Bearer ${expired}`]) {
      const req = api().get('/api/auth/me');
      const res = await (auth ? req.set('Authorization', auth) : req);
      expect(res.status).toBe(401);
    }
  });

  it('401 for a deactivated user holding a valid token', async () => {
    const u = await makeUser('CASHIER');
    const token = tokenFor(u);
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect((await api().get('/api/auth/me').set('Authorization', token)).status).toBe(401);
  });

  it('reads the role from the DB, so a demotion applies immediately', async () => {
    const u = await makeUser('MANAGER');
    const token = tokenFor(u);
    await prisma.user.update({ where: { id: u.id }, data: { role: 'CASHIER' } });
    expect((await api().get('/api/inventory/movements').set('Authorization', token)).status).toBe(403);
  });
});

describe('health + security headers', () => {
  it('GET /health is public and reports the db', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: true });
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
