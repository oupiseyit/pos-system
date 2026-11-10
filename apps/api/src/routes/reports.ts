// 05 §10 Reports — MANAGER (guard applied where the router is mounted).
// Sums happen in Postgres numeric, so no JS money arithmetic. VOIDED sales are excluded.
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { id, localDate, localDays, sendCsv } from '../http.js';

export const rangeQuery = z
  .object({ from: localDate, to: localDate, format: z.enum(['json', 'csv']).default('json') })
  .refine((q) => q.from <= q.to, { message: '`from` must be on or before `to`', path: ['from'] });

export const productsQuery = z.object({ categoryId: id.optional() });

const range = async (req: Request) => {
  const q = rangeQuery.parse(req.query);
  return { ...q, ...(await localDays(q.from, q.to)) };
};
export const csvQuery = z.object({ format: z.enum(['json', 'csv']).default('json') });
const isCsv = (req: Request) => csvQuery.parse(req.query).format === 'csv';
const tz = Prisma.sql`coalesce((SELECT timezone FROM "Setting" WHERE id = 1), 'UTC')`;

type Row = Record<string, unknown>;

export const reportsRouter = Router();

reportsRouter.get('/daily', async (req, res) => {
  const r = await range(req);
  // ROLLUP adds the grand-total row (date = NULL); it exists even when there are no sales
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT to_char(("createdAt" AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS date,
           count(*)::int AS "salesCount",
           coalesce(sum(subtotal), 0)::numeric(12,2) AS subtotal,
           coalesce(sum(discount), 0)::numeric(12,2) AS discount,
           coalesce(sum(tax), 0)::numeric(12,2) AS tax,
           coalesce(sum(total), 0)::numeric(12,2) AS total
    FROM "Sale"
    WHERE status = 'COMPLETED' AND "createdAt" >= ${r.gte} AND "createdAt" < ${r.lt}
    GROUP BY ROLLUP (1) ORDER BY 1 NULLS LAST`;
  const totals = rows.pop() ?? {};
  delete totals.date;
  if (r.format === 'csv') return sendCsv(res, `daily-${r.from}-${r.to}`, [...rows, { date: 'TOTAL', ...totals }]);
  res.json({ data: rows, totals });
});

reportsRouter.get('/products', async (req, res) => {
  const r = await range(req);
  const { categoryId } = productsQuery.parse(req.query);
  // Margin uses the product's current cost (cost isn't snapshotted per sale in v1)
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT p.id AS "productId", p.sku, p.name,
           sum(i.qty)::int AS qty,
           sum(i."unitPrice" * i.qty - i.discount)::numeric(12,2) AS net,
           sum(i.tax)::numeric(12,2) AS tax,
           sum(i."lineTotal")::numeric(12,2) AS total,
           sum(i.qty * p.cost)::numeric(12,2) AS cost,
           sum(i."unitPrice" * i.qty - i.discount - i.qty * p.cost)::numeric(12,2) AS margin
    FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId" JOIN "Product" p ON p.id = i."productId"
    WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${r.gte} AND s."createdAt" < ${r.lt}
      AND (${categoryId ?? null}::uuid IS NULL OR p."categoryId" = ${categoryId ?? null}::uuid)
    GROUP BY p.id ORDER BY total DESC, p.name`;
  if (r.format === 'csv') return sendCsv(res, `products-${r.from}-${r.to}`, rows);
  res.json({ data: rows });
});

reportsRouter.get('/cashiers', async (req, res) => {
  const r = await range(req);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u.id AS "cashierId", u.name,
           count(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "salesCount",
           coalesce(sum(s.total) FILTER (WHERE s.status = 'COMPLETED'), 0)::numeric(12,2) AS total,
           count(*) FILTER (WHERE s.status = 'VOIDED')::int AS "voidCount"
    FROM "Sale" s JOIN "User" u ON u.id = s."cashierId"
    WHERE s."createdAt" >= ${r.gte} AND s."createdAt" < ${r.lt}
    GROUP BY u.id ORDER BY total DESC, u.name`;
  if (r.format === 'csv') return sendCsv(res, `cashiers-${r.from}-${r.to}`, rows);
  res.json({ data: rows });
});

reportsRouter.get('/payments', async (req, res) => {
  const r = await range(req);
  // Cash without `tendered` was exact, so tendered = amount and change = 0
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT p.method::text AS method, count(*)::int AS count,
           sum(p.amount)::numeric(12,2) AS amount,
           sum(coalesce(p.tendered, p.amount))::numeric(12,2) AS tendered,
           sum(coalesce(p.tendered, p.amount) - p.amount)::numeric(12,2) AS change
    FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId"
    WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${r.gte} AND s."createdAt" < ${r.lt}
    GROUP BY p.method ORDER BY p.method`;
  const data = rows.map(({ tendered, change, ...row }) => (row.method === 'CASH' ? { ...row, tendered, change } : row));
  if (r.format === 'csv') return sendCsv(res, `payments-${r.from}-${r.to}`, data);
  res.json({ data });
});

reportsRouter.get('/low-stock', async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { active: true, stockQty: { lte: prisma.product.fields.reorderLevel } },
    select: { id: true, sku: true, name: true, stockQty: true, reorderLevel: true },
    orderBy: [{ stockQty: 'asc' }, { name: 'asc' }],
  });
  const data = rows.map(({ id: productId, ...p }) => ({ productId, ...p }));
  if (isCsv(req)) return sendCsv(res, 'low-stock', data);
  res.json({ data });
});

reportsRouter.get('/inventory-value', async (req, res) => {
  const items = await prisma.$queryRaw<Row[]>`
    SELECT id AS "productId", sku, name, "stockQty", cost,
           (greatest("stockQty", 0) * cost)::numeric(12,2) AS value
    FROM "Product" ORDER BY name`;
  const [{ totalValue }] = await prisma.$queryRaw<{ totalValue: Prisma.Decimal }[]>`
    SELECT coalesce(sum(greatest("stockQty", 0) * cost), 0)::numeric(12,2) AS "totalValue" FROM "Product"`;
  if (isCsv(req)) return sendCsv(res, 'inventory-value', [...items, { name: 'TOTAL', value: totalValue }]);
  res.json({ items, totalValue });
});
