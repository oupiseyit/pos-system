// 05 §8 Customers
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../db.js';
import { HttpError, idParam, optText, pageArgs, pageQuery } from '../http.js';
import { summaryInclude, toSummary } from './sales.js';

export const createBody = z.object({
  name: z.string().trim().min(1).max(200),
  phone: optText,
  email: optText.pipe(z.email().nullable()),
  notes: optText,
});
export const listQuery = pageQuery.extend({
  search: z.string().trim().min(1).optional(),
  updatedSince: z.coerce.date().optional(),
});

export const customersRouter = Router();

customersRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Prisma.CustomerWhereInput = {
    ...(q.updatedSince && { updatedAt: { gte: q.updatedSince } }),
    ...(q.search && {
      OR: ['name', 'phone', 'email'].map((f) => ({ [f]: { contains: q.search, mode: 'insensitive' } })),
    }),
  };
  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pageArgs(q) }),
    prisma.customer.count({ where }),
  ]);
  res.json({ data, page: q.page, limit: q.limit, total });
});

customersRouter.post('/', async (req, res) => {
  res.status(201).json(await prisma.customer.create({ data: createBody.parse(req.body) }));
});

customersRouter.get('/:id', requireRole('MANAGER'), async (req, res) => {
  const customerId = idParam(req);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const completed = { customerId, status: 'COMPLETED' } as const;
  const [agg, recent] = await Promise.all([
    prisma.sale.aggregate({ where: completed, _count: true, _sum: { total: true }, _max: { createdAt: true } }),
    prisma.sale.findMany({ where: { customerId }, include: summaryInclude, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  res.json({
    ...customer,
    stats: { salesCount: agg._count, totalSpent: agg._sum.total ?? '0.00', lastSaleAt: agg._max.createdAt },
    recentSales: recent.map(toSummary),
  });
});

customersRouter.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  res.json(await prisma.customer.update({ where: { id: idParam(req) }, data: createBody.partial().parse(req.body) }));
});

customersRouter.delete('/:id', requireRole('MANAGER'), async (req, res) => {
  const customerId = idParam(req);
  if (await prisma.sale.count({ where: { customerId } })) throw new HttpError(409, 'Customer has sales');
  await prisma.customer.delete({ where: { id: customerId } });
  res.status(204).end();
});
