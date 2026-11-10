// 80mm receipt as plain text, 42 monospace columns (06 §A6). Used by B6 Reprint and the B10 preview.
import { cents, dateTime, methodLabel, money, moneyCents } from './format';
import type { Sale, Settings } from './types';

export const W = 42;
const center = (s: string) =>
  s
    .split('\n')
    .map((l) => ' '.repeat(Math.max(0, (W - l.length) >> 1)) + l)
    .join('\n');
const lr = (a: string, b: string) => a + b.padStart(Math.max(1, W - a.length));
const rule = '-'.repeat(W);

export type ReceiptSale = Pick<
  Sale,
  'receiptNo' | 'createdAt' | 'status' | 'voidedAt' | 'voidReason' | 'subtotal' | 'discount' | 'tax' | 'total'
> & {
  cashier: { name: string };
  customer: { name: string } | null;
  items: Pick<Sale['items'][number], 'nameSnapshot' | 'unitPrice' | 'qty' | 'discount'>[];
  payments: Pick<Sale['payments'][number], 'method' | 'amount' | 'tendered' | 'change'>[];
};

export function renderReceipt(s: Settings, sale: ReceiptSale): string {
  const contact = [s.phone && `Tel ${s.phone}`, s.taxId && `VAT ${s.taxId}`].filter(Boolean).join(' · ');
  const out = [center(s.shopName.toUpperCase())];
  if (s.address) out.push(center(s.address));
  if (contact) out.push(center(contact));
  if (sale.status === 'VOIDED') {
    out.push('', center('*** VOID ***'));
    if (sale.voidedAt) out.push(center(dateTime(sale.voidedAt)));
    if (sale.voidReason) out.push(center(sale.voidReason));
  }
  out.push(rule, `Receipt: ${sale.receiptNo}`, `Date:    ${dateTime(sale.createdAt)}`, `Cashier: ${sale.cashier.name}`);
  if (sale.customer) out.push(`Customer: ${sale.customer.name}`);
  out.push(rule);
  for (const it of sale.items) {
    out.push(it.nameSnapshot.slice(0, W));
    out.push(lr(`  ${it.qty} x ${money(it.unitPrice)}`, moneyCents(cents(it.unitPrice) * it.qty)));
    if (cents(it.discount)) out.push(lr('  Discount', `-${money(it.discount)}`));
  }
  out.push(rule, lr('Subtotal', money(sale.subtotal)));
  if (cents(sale.discount)) out.push(lr('Discount', `-${money(sale.discount)}`));
  out.push(lr('Tax', money(sale.tax)), lr('TOTAL', `${s.currency} ${money(sale.total)}`), rule);
  for (const p of sale.payments) {
    out.push(lr(methodLabel(p.method), money(p.tendered ?? p.amount)));
    if (cents(p.change)) out.push(lr('Change', money(p.change)));
  }
  out.push(rule);
  if (s.receiptFooter) out.push(center(s.receiptFooter));
  return out.join('\n');
}

/** Sample sale for the settings preview. */
export const SAMPLE: ReceiptSale = {
  receiptNo: 'T1-000124',
  createdAt: '2026-11-05T09:30:00.000Z',
  status: 'COMPLETED',
  voidedAt: null,
  voidReason: null,
  cashier: { name: 'Sokha' },
  customer: null,
  items: [
    { nameSnapshot: 'Coffee beans 250g', unitPrice: '6.50', qty: 2, discount: '1.00' },
    { nameSnapshot: 'Water 500ml', unitPrice: '0.50', qty: 6, discount: '0.00' },
  ],
  subtotal: '16.00',
  discount: '1.00',
  tax: '1.50',
  total: '16.50',
  payments: [{ method: 'CASH', amount: '16.50', tendered: '20.00', change: '3.50' }],
};
