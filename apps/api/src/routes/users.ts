// 05 §4 Users — ADMIN only (guard applied where the router is mounted)
import { Role, type User } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { hash } from '../auth.js';
import { prisma } from '../db.js';
import { email, HttpError, idParam } from '../http.js';

const toUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  hasPin: u.pinHash !== null,
  lockedUntil: u.lockedUntil,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

const fields = {
  name: z.string().trim().min(1).max(100),
  email,
  role: z.enum(Role),
  password: z.string().min(8).max(200),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
};
export const createBody = z.object({ ...fields, pin: fields.pin.optional() });
export const patchBody = z.object({ ...fields, active: z.boolean(), unlock: z.literal(true) }).partial();

export const listQuery = z.object({ active: z.stringbool().optional() });

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  const { active } = listQuery.parse(req.query);
  const users = await prisma.user.findMany({ where: { active }, orderBy: { name: 'asc' } });
  res.json(users.map(toUser));
});

usersRouter.get('/:id', async (req, res) => {
  res.json(toUser(await prisma.user.findUniqueOrThrow({ where: { id: idParam(req) } })));
});

usersRouter.post('/', async (req, res) => {
  const { password, pin, ...rest } = createBody.parse(req.body);
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await hash(password), pinHash: pin ? await hash(pin) : null },
  });
  res.status(201).json(toUser(user));
});

usersRouter.patch('/:id', async (req, res) => {
  const userId = idParam(req);
  const { password, pin, unlock, ...rest } = patchBody.parse(req.body);
  if (userId === req.user.id && ((rest.role && rest.role !== Role.ADMIN) || rest.active === false))
    throw new HttpError(400, 'You cannot demote or deactivate yourself');
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(password && { passwordHash: await hash(password) }),
      ...(pin && { pinHash: await hash(pin) }),
      ...(unlock && { failedPinAttempts: 0, lockedUntil: null }),
    },
  });
  res.json(toUser(user));
});
