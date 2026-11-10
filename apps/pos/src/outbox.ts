// The outbox (03 §5): every sale is saved here before its receipt prints, then uploaded
// oldest-first. Removed only on 2xx; 401 pauses; other 4xx → needs attention; never auto-discarded.
import type { Session } from './api';
import { K, read, write } from './store';

export type Method = 'CASH' | 'CARD' | 'OTHER';

/** POST /sales body (05 §9). */
export interface SaleBody {
  id: string;
  receiptNo: string;
  deviceCode: string;
  cashierId: string;
  customerId: string | null;
  createdAt: string;
  items: {
    productId: string;
    nameSnapshot: string;
    unitPrice: string;
    qty: number;
    discount: string;
    taxRate: string;
  }[];
  totals: { subtotal: string; discount: string; tax: string; total: string };
  payments: { method: Method; amount: string; tendered?: string; reference?: string }[];
}

export interface Entry {
  sale: SaleBody;
  /** For receipts and lists while the sale exists only on this till */
  cashierName: string;
  customerName: string | null;
  state: 'pending' | 'attention';
  error?: { status: number; message: string; body: unknown; at: string };
}

export const entries = () => read<Entry[]>(K.outbox, []);
const save = (list: Entry[]) => write(K.outbox, list);
const patch = (id: string, fn: (e: Entry) => Entry) => save(entries().map((e) => (e.sale.id === id ? fn(e) : e)));
const remove = (id: string) => save(entries().filter((e) => e.sale.id !== id));

/** Persist a sale. Returns only after it is in localStorage (throws if it can't be stored). */
export function add(e: Omit<Entry, 'state'>) {
  save([...entries(), { ...e, state: 'pending' }]);
}

export type FlushResult = 'done' | 'offline' | 'unauthorized';

let running: Promise<FlushResult> | null = null;

/** Upload pending sales oldest-first. One flush at a time; a second call joins the first. */
export function flush(): Promise<FlushResult> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<FlushResult> {
  const token = read<Session | null>(K.session, null)?.token;
  if (!token) return 'unauthorized';
  // Re-read each round: sales made during a flush join the queue behind the current one
  for (;;) {
    const next = entries().find((e) => e.state === 'pending');
    if (!next) return 'done';
    let res: Response;
    try {
      res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(next.sale),
      });
    } catch {
      return 'offline'; // network down: keep it, order preserved
    }
    // 201 created, or 200 for a replay of a sale the server already has: both mean done
    if (res.ok) remove(next.sale.id);
    else if (res.status === 401) return 'unauthorized';
    else if (res.status >= 500)
      return 'offline'; // server trouble: try again later
    else {
      const body: unknown = await res.json().catch(() => null);
      const message = (body as { error?: string } | null)?.error ?? res.statusText;
      patch(next.sale.id, (e) => ({
        ...e,
        state: 'attention',
        error: { status: res.status, message, body, at: new Date().toISOString() },
      }));
    }
  }
}

/** Put a rejected sale back in the queue. */
export const retry = (id: string) => patch(id, ({ error: _error, ...e }) => ({ ...e, state: 'pending' }));

/** Manager-only, with a typed reason; logged to the console (06 A8). */
export function discard(id: string, reason: string, by: string) {
  const e = entries().find((x) => x.sale.id === id);
  if (!e) return;
  console.warn('[outbox] discarded sale', {
    receiptNo: e.sale.receiptNo,
    id,
    reason,
    by,
    sale: e.sale,
    error: e.error,
  });
  remove(id);
}

const receiptNo = (code: string, n: number) => `${code}-${String(n).padStart(6, '0')}`;

/** `<deviceCode>-<6-digit counter>`; the counter is saved before the number is handed out. */
export function nextReceiptNo() {
  const code = read<{ code: string } | null>(K.device, null)?.code;
  if (!code) throw new Error('This till has no device code');
  const n = read<number>(K.counter, 0) + 1;
  write(K.counter, n);
  return receiptNo(code, n);
}

/** The number the next sale will get, without claiming it (cart header, 06 A3). */
export function peekReceiptNo() {
  const code = read<{ code: string } | null>(K.device, null)?.code;
  return code ? receiptNo(code, read<number>(K.counter, 0) + 1) : '';
}
