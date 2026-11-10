// 05 §11 Settings
import type { Setting } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../db.js';

const text = z.string().trim().max(500);
const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const body = z.object({
  shopName: text.min(1),
  address: text,
  phone: text,
  taxId: text,
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code'),
  timezone: z.string().refine(isTimeZone, 'Unknown IANA timezone'),
  receiptFooter: text,
});

const toSettings = ({ id: _id, ...s }: Setting) => s;

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  // The seed creates the row; upsert keeps a fresh database working too
  res.json(toSettings(await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })));
});

settingsRouter.put('/', requireRole('ADMIN'), async (req, res) => {
  const data = body.parse(req.body);
  res.json(toSettings(await prisma.setting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })));
});
