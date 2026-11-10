// Cart and payment arithmetic. All money math goes through computeTotals / integer cents.
import { computeTotals, fromCents, toCents } from '../../api/src/totals';
import type { Method, SaleBody } from './outbox';

export interface Line {
  productId: string;
  name: string;
  unitPrice: string;
  taxRate: string;
  qty: number;
  discount: string;
}

const gross = (l: Line) => toCents(l.unitPrice) * l.qty;
const clamp = (l: Line): Line => (toCents(l.discount) > gross(l) ? { ...l, discount: fromCents(gross(l)) } : l);

/** Add one of a product: increments an existing line, else appends. */
export function addProduct(lines: Line[], p: { id: string; name: string; price: string; taxRate: string }): Line[] {
  if (lines.some((l) => l.productId === p.id))
    return lines.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
  return [
    ...lines,
    { productId: p.id, name: p.name, unitPrice: p.price, taxRate: p.taxRate, qty: 1, discount: '0.00' },
  ];
}

/** qty < 1 removes the line; a discount bigger than the new line amount is cut down to it. */
export const setQty = (lines: Line[], id: string, qty: number) =>
  qty < 1 ? lines.filter((l) => l.productId !== id) : lines.map((l) => (l.productId === id ? clamp({ ...l, qty }) : l));

/** Discount as an amount ("1.00") or a percent of the line ("10%"); null when invalid or > line. */
export function discountCents(l: Line, input: string): number | null {
  const s = input.trim();
  const pct = s.endsWith('%');
  let c: number;
  try {
    c = toCents(pct ? s.slice(0, -1) : s || '0');
  } catch {
    return null;
  }
  if (c < 0) return null;
  // percent: c is basis points (10% → 1000); round half-up to cents
  const amount = pct ? Math.floor((gross(l) * c + 5000) / 10000) : c;
  return amount <= gross(l) ? amount : null;
}

export const setDiscount = (lines: Line[], id: string, cents: number) =>
  lines.map((l) => (l.productId === id ? { ...l, discount: fromCents(cents) } : l));

export const totals = (lines: Line[]) => computeTotals(lines).totals;

/* ---------- Payments (06 A5) ---------- */
export interface Payment {
  method: Method;
  amount: string;
  tendered?: string;
  reference?: string;
}

const parse = (s: string) => {
  try {
    return s.trim() ? toCents(s) : 0;
  } catch {
    return NaN;
  }
};

/**
 * State of the pay dialog. `input` is the cash tendered (Cash) or the amount (Card/Other).
 * `final` is the payment that Complete would add; Complete is possible only when it closes the bill.
 */
export function payState(dueCents: number, payments: Payment[], method: Method, input: string) {
  const paid = payments.reduce((s, p) => s + toCents(p.amount), 0);
  const remaining = dueCents - paid;
  const amt = parse(input);
  const out = {
    paid,
    remaining,
    change: 0,
    final: null as Payment | null,
    canComplete: remaining === 0 && payments.length > 0,
    canAdd: false,
    error: null as string | null,
  };
  if (remaining <= 0) return out;
  if (Number.isNaN(amt)) return { ...out, error: 'Enter an amount like 12.50' };
  out.canAdd = amt > 0 && amt < remaining;
  if (method === 'CASH') {
    if (amt >= remaining) {
      out.final = { method, amount: fromCents(remaining), tendered: fromCents(amt) };
      out.change = amt - remaining;
    } else if (amt > 0)
      out.error = `Less than the ${fromCents(remaining)} remaining. Add it as a part payment, or enter more.`;
  } else if (amt === remaining) out.final = { method, amount: fromCents(amt) };
  else if (amt > remaining) out.error = `Can’t be more than the ${fromCents(remaining)} remaining`;
  out.canComplete = !!out.final;
  return out;
}

/** Quick cash buttons: exact, the next whole unit, then common notes above the amount. */
export function quickCash(remaining: number): number[] {
  const next = Math.ceil(remaining / 100) * 100;
  const notes = [500, 1000, 2000, 5000, 10000].filter((n) => n > remaining);
  return [...new Set([remaining, next, ...notes])].slice(0, 5);
}

/** POST /sales body for a finished cart (05 §9). */
export function toSale(a: {
  id: string;
  receiptNo: string;
  deviceCode: string;
  cashierId: string;
  customerId: string | null;
  lines: Line[];
  payments: Payment[];
  now?: Date;
}): SaleBody {
  return {
    id: a.id,
    receiptNo: a.receiptNo,
    deviceCode: a.deviceCode,
    cashierId: a.cashierId,
    customerId: a.customerId,
    createdAt: (a.now ?? new Date()).toISOString(),
    items: a.lines.map((l) => ({
      productId: l.productId,
      nameSnapshot: l.name,
      unitPrice: l.unitPrice,
      qty: l.qty,
      discount: l.discount,
      taxRate: l.taxRate,
    })),
    totals: totals(a.lines),
    payments: a.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      ...(p.tendered && { tendered: p.tendered }),
      ...(p.reference && { reference: p.reference }),
    })),
  };
}

/** Change per payment, for receipts. */
export const changeOf = (p: { amount: string; tendered?: string | null }) =>
  p.tendered ? fromCents(toCents(p.tendered) - toCents(p.amount)) : null;
