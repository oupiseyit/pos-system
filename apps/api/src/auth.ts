// Auth per docs/07-roles-security.md §1, §3: bcrypt, HS256 JWT, user re-loaded on every request.
import type { Role, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { HttpError } from './http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth; only read it on routes mounted behind it. */
      user: User;
    }
  }
}

const rank = { CASHIER: 1, MANAGER: 2, ADMIN: 3 } as const;

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
};

export const hash = (plain: string) => bcrypt.hash(plain, 12);
export const verifyHash = (plain: string, hashed: string) => bcrypt.compare(plain, hashed);

export const signToken = (u: Pick<User, 'id' | 'role'>) =>
  jwt.sign({ role: u.role }, secret(), { subject: u.id, expiresIn: '12h', algorithm: 'HS256' });

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  let sub: string | undefined;
  try {
    sub = token ? jwt.verify(token, secret(), { algorithms: ['HS256'] }).sub?.toString() : undefined;
  } catch {
    // expired, bad signature or malformed: all 401
  }
  // Role and active flag come from the DB, not the token, so changes apply on the next request
  const user = sub ? await prisma.user.findUnique({ where: { id: sub } }) : null;
  if (!user?.active) throw new HttpError(401, 'Unauthorized');
  req.user = user;
  next();
};

export const requireRole =
  (min: Role): RequestHandler =>
  (req, _res, next) => {
    if (rank[req.user.role] < rank[min]) throw new HttpError(403, 'Forbidden');
    next();
  };
