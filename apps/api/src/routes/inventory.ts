// 05 §7 Inventory — MANAGER (guard applied where the router is mounted)
import { StockReason } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, id, localDate, localDays, money, optText, pageArgs, pageQuery, qty } from '../http.js';

export const receiveBody = z.object({
  note: optText,
  items: z.array(z.object({ productId: id, qty: qty.positive(), cost: money.optional() })).min(1),
});
export const adjustBody = z.object({ productId: id, countedQty: qty, note: z.string().trim().min(1).max(500) });
export const movementsQuery = pageQuery.extend({
  productId: id.optional(),
  reason: z.enum(StockReason).optional(),
  from: localDate.optional(),
  to: localDate.optional(),
});

export const inventoryRouter = Router();

inventoryRouter.post('/receive', async (req, res) => {
  const { note, items } = receiveBody.parse(req.body);
  const movements = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const it of items) {
      await tx.product.update({
        where: { id: it.productId },
        data: { stockQty: { increment: it.qty }, ...(it.cost && { cost: it.cost }) },
      });
      out.push(
        await tx.stockMovement.create({
          data: { productId: it.productId, qtyChange: it.qty, reason: 'RECEIVE', userId: req.user.id, note },
        }),
      );
    }
    return out;
  });
  res.status(201).json({ movements });
});

inventoryRouter.post('/adjust', async (req, res) => {
  const { productId, countedQty, note } = adjustBody.parse(req.body);
  const movement = await prisma.$transaction(async (tx) => {
    // Lock the row so a sale landing mid-count can't skew qtyChange
    const [p] = await tx.$queryRaw<{ stockQty: number }[]>`
      SELECT "stockQty" FROM "Product" WHERE id = ${productId}::uuid FOR UPDATE`;
    if (!p) throw new HttpError(404, 'Product not found');
    const qtyChange = countedQty - p.stockQty;
    if (qtyChange === 0) return null;
    await tx.product.update({ where: { id: productId }, data: { stockQty: countedQty } });
    return tx.stockMovement.create({ data: { productId, qtyChange, reason: 'ADJUST', userId: req.user.id, note } });
  });
  res.status(movement ? 201 : 200).json({ movement });
});

inventoryRouter.get('/movements', async (req, res) => {
  const q = movementsQuery.parse(req.query);
  const days = q.from || q.to ? await localDays(q.from, q.to) : undefined;
  const where = {
    productId: q.productId,
    reason: q.reason,
    createdAt: days && { ...(q.from && { gte: days.gte }), ...(q.to && { lt: days.lt }) },
  };
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { name: true } }, user: { select: { name: true } }, sale: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(q),
    }),
    prisma.stockMovement.count({ where }),
  ]);
  const data = rows.map(({ product, user, sale, ...m }) => ({
    ...m,
    productName: product.name,
    receiptNo: sale?.receiptNo ?? null,
    userName: user.name,
  }));
  res.json({ data, page: q.page, limit: q.limit, total });
});
