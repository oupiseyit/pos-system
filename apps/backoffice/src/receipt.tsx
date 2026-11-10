// The 80mm receipt (06 §A6), shared by POS A6/A7, back-office reprint (B6) and the settings preview (B10).
// receiptModel() is the testable part; <Receipt> only lays it out. Print CSS lives in mockups/v2/styles.css.
import { createPortal } from 'react-dom';
import { code128 } from './code128';
import { cents, dateTime, methodLabel, money, moneyCents } from './format';
import type { Sale, Settings } from './types';

export type ReceiptSale = Pick<
  Sale,
  'receiptNo' | 'createdAt' | 'status' | 'voidedAt' | 'voidReason' | 'subtotal' | 'discount' | 'tax' | 'total'
> & {
  cashier: { name: string };
  customer: { name: string } | null;
  items: Pick<Sale['items'][number], 'nameSnapshot' | 'unitPrice' | 'qty' | 'discount'>[];
  payments: Pick<Sale['payments'][number], 'method' | 'amount' | 'tendered' | 'change'>[];
};

type Row = [string, string];

/** "USD 16.50" → "$16.50" where the browser knows the currency; else "USD 16.50". */
function currency(code: string, amount: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(cents(amount) / 100);
  } catch {
    return `${code} ${money(amount)}`;
  }
}

export function receiptModel(s: Settings, sale: ReceiptSale) {
  const discount = cents(sale.discount);
  return {
    shop: s.shopName,
    /** Under the shop name: the address, then "Tel … · VAT …" */
    header: [s.address, [s.phone && `Tel ${s.phone}`, s.taxId && `VAT ${s.taxId}`].filter(Boolean).join(' · ')].filter(
      Boolean,
    ),
    voided:
      sale.status === 'VOIDED'
        ? [sale.voidedAt && dateTime(sale.voidedAt), sale.voidReason].filter(Boolean).join(' · ')
        : null,
    meta: [
      [sale.receiptNo, dateTime(sale.createdAt)],
      ['Cashier', sale.cashier.name],
      ...(sale.customer ? [['Customer', sale.customer.name] as Row] : []),
    ] as Row[],
    items: sale.items.map((it) => ({
      label: `${it.qty} × ${it.nameSnapshot}`,
      each: it.qty > 1 ? `${money(it.unitPrice)} each` : '',
      amount: moneyCents(cents(it.unitPrice) * it.qty),
      discount: cents(it.discount) ? `-${money(it.discount)}` : '',
    })),
    totals: [
      ['Subtotal', money(sale.subtotal)],
      ...(discount ? [['Discount', `-${money(sale.discount)}`] as Row] : []),
      ['Tax', money(sale.tax)],
    ] as Row[],
    total: currency(s.currency, sale.total),
    payments: sale.payments.flatMap((p): Row[] => [
      [methodLabel(p.method), money(p.tendered ?? p.amount)],
      ...(cents(p.change) ? [['Change', money(p.change)] as Row] : []),
    ]),
    footer: s.receiptFooter,
    barcode: sale.receiptNo,
  };
}

const Rows = ({ rows }: { rows: Row[] }) =>
  rows.map(([l, r], i) => (
    <div className="r-row" key={i}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  ));

/** Code 128 as crisp SVG bars; 10-module quiet zone on each side. */
export function Barcode({ value }: { value: string }) {
  const widths = code128(value);
  const bars: { x: number; w: number }[] = [];
  let x = 10;
  for (let i = 0; i < widths.length; i++) {
    if (i % 2 === 0) bars.push({ x, w: widths[i] }); // even = bar, odd = space
    x += widths[i];
  }
  return (
    <svg
      className="r-bars"
      viewBox={`0 0 ${x + 10} 1`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bars.map((b) => (
        <rect key={b.x} x={b.x} width={b.w} height="1" />
      ))}
    </svg>
  );
}

export function Receipt({ settings, sale, small }: { settings: Settings; sale: ReceiptSale; small?: boolean }) {
  const m = receiptModel(settings, sale);
  return (
    <div className={`receipt-paper ${small ? 'sm' : ''}`}>
      <div className={`receipt ${small ? 'sm' : ''}`} aria-label={`Receipt ${m.barcode}`}>
        <div className="r-head">
          <span className="r-logo" aria-hidden="true">
            {m.shop.slice(0, 1).toUpperCase()}
          </span>
          <b className="r-shop">{m.shop}</b>
          {m.header.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        {m.voided !== null && (
          <div className="r-void">
            <b>*** VOID ***</b>
            {m.voided && <div>{m.voided}</div>}
          </div>
        )}
        <hr />
        <Rows rows={m.meta} />
        <hr />
        {m.items.map((it, i) => (
          <div className="r-item" key={i}>
            <div className="r-row">
              <span>{it.label}</span>
              <span>{it.amount}</span>
            </div>
            {(it.each || it.discount) && (
              <div className="r-row r-sub">
                <span>{it.each}</span>
                <span>{it.discount && `discount ${it.discount}`}</span>
              </div>
            )}
          </div>
        ))}
        <hr />
        <Rows rows={m.totals} />
        <div className="r-row r-total">
          <span>TOTAL</span>
          <span>{m.total}</span>
        </div>
        <Rows rows={m.payments} />
        <hr />
        <Barcode value={m.barcode} />
        <div className="r-code">{m.barcode}</div>
        {m.footer && <div className="r-foot">{m.footer}</div>}
      </div>
    </div>
  );
}

/**
 * The copy that goes to the printer. It lives directly under <body>, so the print CSS can show it alone,
 * at the page's top-left, whatever the screen layout around the visible receipt is.
 */
export function PrintSlip({ settings, sale }: { settings: Settings; sale: ReceiptSale }) {
  return createPortal(
    <div className="print-slip" aria-hidden="true">
      <Receipt settings={settings} sale={sale} />
    </div>,
    document.body,
  );
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
