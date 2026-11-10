// 05 §6 Products
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../db.js';
import { id, idParam, money, optText, pageArgs, pageQuery, qty, rate } from '../http.js';

export const createBody = z.object({
  sku: z.string().trim().min(1).max(64),
  barcode: optText,
  name: z.string().trim().min(1).max(200),
  categoryId: id.nullish(),
  price: money,
  cost: money.optional(),
  taxRate: rate.optional(),
  reorderLevel: qty.optional(),
  active: z.boolean().optional(),
});
// stockQty is not a field here, so zod strips it: stock changes only through /inventory
export const patchBody = createBody.partial();

export const listQuery = pageQuery.extend({
  search: z.string().trim().min(1).optional(),
  categoryId: id.optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  updatedSince: z.coerce.date().optional(),
});

export const productsRouter = Router();

productsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.ProductWhereInput = {
    categoryId: q.categoryId,
    // With updatedSince, inactive products are included so the POS can drop them
    ...(q.updatedSince
      ? { updatedAt: { gte: q.updatedSince } }
      : q.active !== 'all' && { active: q.active === 'true' }),
    ...(q.search && {
      OR: ['name', 'sku', 'barcode'].map((f) => ({ [f]: { contains: q.search, mode: 'insensitive' } })),
    }),
  };
  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: q.updatedSince ? [{ updatedAt: 'asc' }, { id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }],
      ...pageArgs(q),
    }),
    prisma.product.count({ where }),
  ]);
  res.json({ data, page: q.page, limit: q.limit, total });
});

productsRouter.get('/:id', async (req, res) => {
  res.json(await prisma.product.findUniqueOrThrow({ where: { id: idParam(req) } }));
});

productsRouter.post('/', requireRole('MANAGER'), async (req, res) => {
  res.status(201).json(await prisma.product.create({ data: createBody.parse(req.body) }));
});

productsRouter.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  res.json(await prisma.product.update({ where: { id: idParam(req) }, data: patchBody.parse(req.body) }));
});
