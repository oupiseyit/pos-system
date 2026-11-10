// 05 §9 Sales
import { PaymentMethod, Prisma, SaleStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../db.js';
import {
  HttpError,
  id,
  idParam,
  localDate,
  localDays,
  money,
  optText,
  pageArgs,
  pageQuery,
  qty,
  rate,
} from '../http.js';
import { computeTotals, fromCents, toCents } from '../totals.js';

const positive = money.refine((s) => toCents(s) > 0, 'Must be > 0');

export const saleBody = z.object({
  id,
  receiptNo: z.string().trim().min(1).max(40),
  deviceCode: z.string().trim().min(1).max(20),
  cashierId: id,
  customerId: id.nullish(),
  createdAt: z.iso.datetime().transform((s) => new Date(s)),
  items: z
    .array(
      z
        .object({
          productId: id,
          nameSnapshot: z.string().trim().min(1).max(200),
          unitPrice: money,
          qty: qty.positive(),
          discount: money.default('0'),
          taxRate: rate,
        })
        .refine((it) => toCents(it.discount) <= toCents(it.unitPrice) * it.qty, {
          message: 'Discount exceeds the line amount',
          path: ['discount'],
        }),
    )
    .min(1),
  totals: z.object({ subtotal: money, discount: money, tax: money, total: money }),
  payments: z
    .array(
      z.object({ method: z.enum(PaymentMethod), amount: positive, tendered: money.optional(), reference: optText }),
    )
    .min(1),
});

export const listQuery = pageQuery.extend({
  from: localDate.optional(),
  to: localDate.optional(),
  cashierId: id.optional(),
  customerId: id.optional(),
  status: z.enum(SaleStatus).optional(),
  receiptNo: z.string().trim().min(1).optional(),
  deviceCode: z.string().trim().min(1).max(20).optional(),
});

export const voidBody = z.object({ reason: z.string().trim().min(1).max(500) });

const fullInclude = {
  items: true,
  payments: true,
  cashier: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
  syncedBy: { select: { id: true, name: true } },
  customer: true,
} satisfies Prisma.SaleInclude;

export const summaryInclude = {
  cashier: { select: { name: true } },
  customer: { select: { name: true } },
  payments: { select: { method: true } },
} satisfies Prisma.SaleInclude;

type SummaryRow = Prisma.SaleGetPayload<{ include: typeof summaryInclude }>;

export const toSummary = (s: SummaryRow) => ({
  id: s.id,
  receiptNo: s.receiptNo,
  createdAt: s.createdAt,
  cashierName: s.cashier.name,
  customerName: s.customer?.name ?? null,
  total: s.total,
  status: s.status,
  paymentMethods: [...new Set(s.payments.map((p) => p.method))],
});

async function fullSale(saleId: string) {
  const s = await prisma.sale.findUniqueOrThrow({ where: { id: saleId }, include: fullInclude });
  return {
    ...s,
    payments: s.payments.map((p) => ({
      ...p,
      change: p.tendered && fromCents(toCents(p.tendered.toFixed(2)) - toCents(p.amount.toFixed(2))),
    })),
  };
}

export const salesRouter = Router();

salesRouter.post('/', async (req, res) => {
  // 1. shape
  const body = saleBody.parse(req.body);

  // 2. idempotency: a replay gets the stored sale and changes nothing
  if (await prisma.sale.findUnique({ where: { id: body.id }, select: { id: true } }))
    return res.status(200).json(await fullSale(body.id));

  // 3. totals arithmetic
  const computed = computeTotals(body.items);
  const t = computed.totals;
  if ((['subtotal', 'discount', 'tax', 'total'] as const).some((k) => toCents(body.totals[k]) !== toCents(t[k])))
    throw new HttpError(400, 'Totals mismatch', { expected: t, received: body.totals });

  // 4. payments
  const paid = body.payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  if (paid !== toCents(t.total))
    throw new HttpError(400, 'Payments must add up to the total', { paid: fromCents(paid), total: t.total });
  if (body.payments.some((p) => p.method === 'CASH' && p.tendered && toCents(p.tendered) < toCents(p.amount)))
    throw new HttpError(400, 'Cash tendered is less than the amount');

  // 5. references (inactive users/products are fine: offline sales may predate the change)
  const productIds = [...new Set(body.items.map((i) => i.productId))];
  const [cashier, customer, products] = await Promise.all([
    prisma.user.findUnique({ where: { id: body.cashierId }, select: { id: true } }),
    body.customerId ? prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } }) : true,
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } }),
  ]);
  const found = new Set(products.map((p) => p.id));
  const unknown = {
    ...(!cashier && { cashierId: body.cashierId }),
    ...(!customer && { customerId: body.customerId }),
    productIds: productIds.filter((p) => !found.has(p)),
  };
  if (!cashier || !customer || unknown.productIds.length) throw new HttpError(400, 'Unknown references', unknown);

  // 6. write everything or nothing
  const created = await prisma.$transaction(async (tx) => {
    // ON CONFLICT DO NOTHING: a simultaneous duplicate (id or receiptNo) inserts 0 rows
    const { count } = await tx.sale.createMany({
      data: {
        id: body.id,
        receiptNo: body.receiptNo,
        deviceCode: body.deviceCode,
        cashierId: body.cashierId,
        customerId: body.customerId ?? null,
        ...t,
        createdAt: body.createdAt,
        syncedById: req.user.id,
      },
      skipDuplicates: true,
    });
    if (!count) return false;
    await tx.saleItem.createMany({
      data: body.items.map((it, i) => ({ saleId: body.id, ...it, ...computed.lines[i] })),
    });
    await tx.payment.createMany({ data: body.payments.map((p) => ({ saleId: body.id, ...p })) });
    // Update products in id order so concurrent sales/voids lock rows the same way (no deadlock)
    for (const it of [...body.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      // No floor: stock may go negative (offline sales can't be refused)
      await tx.product.update({ where: { id: it.productId }, data: { stockQty: { decrement: it.qty } } });
      await tx.stockMovement.create({
        data: { productId: it.productId, qtyChange: -it.qty, reason: 'SALE', saleId: body.id, userId: body.cashierId },
      });
    }
    return true;
  });

  if (!created) {
    if (await prisma.sale.findUnique({ where: { id: body.id }, select: { id: true } }))
      return res.status(200).json(await fullSale(body.id));
    throw new HttpError(409, 'Receipt number already used by another sale', { field: 'receiptNo' });
  }
  // 7.
  res.status(201).json(await fullSale(body.id));
});

salesRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  let where: Prisma.SaleWhereInput;
  if (req.user.role === 'CASHIER') {
    // A cashier only ever sees their own sales from today; other filters are ignored
    const today = await localDays();
    where = { cashierId: req.user.id, createdAt: { gte: today.gte, lt: today.lt } };
  } else {
    const days = q.from || q.to ? await localDays(q.from, q.to) : undefined;
    where = {
      cashierId: q.cashierId,
      customerId: q.customerId,
      status: q.status,
      receiptNo: q.receiptNo,
      deviceCode: q.deviceCode,
      createdAt: days && { ...(q.from && { gte: days.gte }), ...(q.to && { lt: days.lt }) },
    };
  }
  const [rows, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: summaryInclude,
      // One till's sales: newest receipt number first (zero-padded, so it sorts like the counter),
      // which is what a re-set-up till continues from. Otherwise newest first by time.
      orderBy: q.deviceCode ? [{ receiptNo: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageArgs(q),
    }),
    prisma.sale.count({ where }),
  ]);
  res.json({ data: rows.map(toSummary), page: q.page, limit: q.limit, total });
});

salesRouter.get('/:id', async (req, res) => {
  const saleId = idParam(req);
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { cashierId: true } });
  if (!sale || (req.user.role === 'CASHIER' && sale.cashierId !== req.user.id)) throw new HttpError(404, 'Not found');
  res.json(await fullSale(saleId));
});

salesRouter.post('/:id/void', requireRole('MANAGER'), async (req, res) => {
  const saleId = idParam(req);
  const { reason } = voidBody.parse(req.body);
  await prisma.$transaction(async (tx) => {
    // Conditional update: only one concurrent void can flip COMPLETED → VOIDED
    const { count } = await tx.sale.updateMany({
      where: { id: saleId, status: 'COMPLETED' },
      data: { status: 'VOIDED', voidedById: req.user.id, voidedAt: new Date(), voidReason: reason },
    });
    if (!count) {
      const exists = await tx.sale.findUnique({ where: { id: saleId }, select: { id: true } });
      throw exists ? new HttpError(409, 'Sale is already voided') : new HttpError(404, 'Not found');
    }
    for (const it of await tx.saleItem.findMany({ where: { saleId }, orderBy: { productId: 'asc' } })) {
      await tx.product.update({ where: { id: it.productId }, data: { stockQty: { increment: it.qty } } });
      await tx.stockMovement.create({
        data: { productId: it.productId, qtyChange: it.qty, reason: 'RETURN', saleId, userId: req.user.id },
      });
    }
  });
  res.json(await fullSale(saleId));
});
