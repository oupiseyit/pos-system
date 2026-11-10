// computeTotals per docs/03-architecture.md §3.1. Shared with the POS: no imports, no floats.
// Money in and out is a decimal string ("6.50"); internally everything is integer cents.

export interface LineInput {
  unitPrice: string;
  qty: number;
  discount: string;
  taxRate: string; // percent, "10.00" = 10 %
}

export interface Totals {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

/** "6.5" → 650, "12" → 1200. Splits the string, never parseFloat. Expects ≤ 2 decimals. */
export function toCents(s: string): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error(`Not a money string: ${s}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}

/** 650 → "6.50" */
export function fromCents(c: number): string {
  const abs = Math.abs(c);
  return `${c < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function computeTotals(items: LineInput[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  const lines = items.map((it) => {
    const gross = toCents(it.unitPrice) * it.qty;
    const disc = toCents(it.discount);
    const net = gross - disc;
    // half-up per line, integer only: rate "10.00" → 1000, so tax = net × 1000 / 10000
    const lineTax = Math.floor((net * toCents(it.taxRate) + 5000) / 10000);
    subtotal += gross;
    discount += disc;
    tax += lineTax;
    return { tax: fromCents(lineTax), lineTotal: fromCents(net + lineTax) };
  });
  const totals: Totals = {
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    tax: fromCents(tax),
    total: fromCents(subtotal - discount + tax),
  };
  return { lines, totals };
}
