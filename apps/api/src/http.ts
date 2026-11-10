// Shared request helpers: errors, zod building blocks, pagination, shop-local day bounds, CSV.
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { toCents } from './totals.js';

/** Thrown from handlers; the central error handler turns it into `{ error, details }`. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// ponytail: one money ceiling for every field, 999,999.99, which fits the smallest column (Decimal(8,2))
export const money = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, 'Money: a string with up to 2 decimals');
export const rate = money.refine((s) => toCents(s) <= 10000, 'Rate must be 0–100');
export const id = z.guid();
/** Stock quantities: far below the int4 column limit, so overflow is a 400 not a 500. */
export const qty = z.int().min(0).max(1_000_000);
/** Optional text: trimmed, '' becomes null so unique columns (phone, barcode) don't collide on blanks. */
export const optText = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((s) => s || null);
export const email = z.string().trim().toLowerCase().pipe(z.email());
/** Shop-local calendar date, YYYY-MM-DD. */
export const localDate = z.iso.date();

export const idParam = (req: Request) => id.parse(req.params.id);

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const pageArgs = ({ page, limit }: z.infer<typeof pageQuery>) => ({ skip: (page - 1) * limit, take: limit });

/**
 * UTC bounds for shop-local days `from`..`to` (inclusive), bucketed in Setting.timezone by Postgres.
 * A missing side defaults to today in the shop's timezone.
 */
export async function localDays(from?: string, to?: string) {
  const [r] = await prisma.$queryRaw<{ gte: Date; lt: Date }[]>`
    WITH s AS (SELECT coalesce((SELECT timezone FROM "Setting" WHERE id = 1), 'UTC') AS tz)
    SELECT (coalesce(${from ?? null}::date, (now() AT TIME ZONE tz)::date)::timestamp AT TIME ZONE tz) AS gte,
           ((coalesce(${to ?? null}::date, (now() AT TIME ZONE tz)::date) + 1)::timestamp AT TIME ZONE tz) AS lt
    FROM s`;
  return r;
}

const cell = (v: unknown) => {
  const s = v instanceof Prisma.Decimal ? v.toFixed(2) : v instanceof Date ? v.toISOString() : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Send rows as CSV (header from the first row's keys). */
export function sendCsv(res: Response, name: string, rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const body = [keys, ...rows.map((r) => keys.map((k) => r[k]))].map((r) => r.map(cell).join(',')).join('\n');
  res
    .type('text/csv')
    .attachment(`${name}.csv`)
    .send(body + '\n');
}
