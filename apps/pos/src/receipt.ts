// Receipt text for a sale that may exist only on this till (outbox), via the shared 80mm renderer.
import type { ReceiptSale } from '../../backoffice/src/receipt';
import { changeOf } from './cart';
import type { Entry } from './outbox';

export function entryReceipt(e: Pick<Entry, 'sale' | 'cashierName' | 'customerName'>): ReceiptSale {
  const s = e.sale;
  return {
    receiptNo: s.receiptNo,
    createdAt: s.createdAt,
    status: 'COMPLETED',
    voidedAt: null,
    voidReason: null,
    cashier: { name: e.cashierName },
    customer: e.customerName ? { name: e.customerName } : null,
    items: s.items,
    ...s.totals,
    payments: s.payments.map((p) => ({ ...p, tendered: p.tendered ?? null, change: changeOf(p) })),
  };
}
