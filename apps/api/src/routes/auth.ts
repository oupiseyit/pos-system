// 05 §3 Auth
import type { User } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, signToken, verifyHash } from '../auth.js';
import { prisma } from '../db.js';
import { email, HttpError } from '../http.js';

const MAX_PIN_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

// Compared against when the email is unknown, so every login costs one bcrypt compare
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Q5d7b0p3dYrW8cZt0iYQxQjN3cVY1a';

const me = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const session = (u: User) => ({ token: signToken(u), user: me(u) });

export const loginBody = z.object({ email, password: z.string().min(1) });
export const pinBody = z.object({ email, pin: z.string().regex(/^\d{4,6}$/) });

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Generic error on any failure, so the response doesn't reveal which emails exist
  const ok = await verifyHash(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.active || !ok) throw new HttpError(401, 'Invalid email or password');
  res.json(session(user));
});

authRouter.post('/pin', async (req, res) => {
  const body = pinBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user?.active || !user.pinHash) {
    await verifyHash(body.pin, DUMMY_HASH);
    throw new HttpError(401, 'Invalid email or PIN');
  }
  const locked = () => new HttpError(423, 'Locked', { lockedUntil: user.lockedUntil });
  if (user.lockedUntil && user.lockedUntil > new Date()) throw locked();

  if (await verifyHash(body.pin, user.pinHash)) {
    const fresh = await prisma.user.update({
      where: { id: user.id },
      data: { failedPinAttempts: 0, lockedUntil: null },
    });
    return res.json(session(fresh));
  }

  const { failedPinAttempts } = await prisma.user.update({
    where: { id: user.id },
    data: { failedPinAttempts: { increment: 1 } },
  });
  if (failedPinAttempts >= MAX_PIN_ATTEMPTS) {
    // The 5th consecutive failure locks; the counter restarts for after the lock expires
    user.lockedUntil = new Date(Date.now() + LOCK_MS);
    await prisma.user.update({ where: { id: user.id }, data: { failedPinAttempts: 0, lockedUntil: user.lockedUntil } });
    throw locked();
  }
  throw new HttpError(401, 'Invalid email or PIN');
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(me(req.user));
});
