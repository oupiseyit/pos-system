// 05 §5 Categories
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../db.js';
import { HttpError, idParam } from '../http.js';

export const body = z.object({ name: z.string().trim().min(1).max(100) });

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  // productCount lets the back office disable Delete on categories in use (B4)
  const rows = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  res.json(rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })));
});

categoriesRouter.post('/', requireRole('MANAGER'), async (req, res) => {
  res.status(201).json(await prisma.category.create({ data: body.parse(req.body) }));
});

categoriesRouter.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  res.json(await prisma.category.update({ where: { id: idParam(req) }, data: body.parse(req.body) }));
});

categoriesRouter.delete('/:id', requireRole('MANAGER'), async (req, res) => {
  const categoryId = idParam(req);
  // ponytail: count-then-delete; the FK (RESTRICT) still blocks a product added in between
  if (await prisma.product.count({ where: { categoryId } })) throw new HttpError(409, 'Category is used by products');
  await prisma.category.delete({ where: { id: categoryId } });
  res.status(204).end();
});
