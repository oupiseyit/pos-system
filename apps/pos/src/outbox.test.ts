// 08 §3: outbox state machine and receipt numbers. localStorage is an in-memory stub, fetch is stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { add, discard, entries, flush, nextReceiptNo, peekReceiptNo, retry, type SaleBody } from './outbox';
import { K, write } from './store';
import { memoryStorage } from './test-storage';

const sale = (n: number): SaleBody => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  receiptNo: `T1-00000${n}`,
  deviceCode: 'T1',
  cashierId: 'c',
  customerId: null,
  createdAt: '2026-11-05T09:30:00.000Z',
  items: [{ productId: 'p', nameSnapshot: 'Water', unitPrice: '0.50', qty: 1, discount: '0.00', taxRate: '0.00' }],
  totals: { subtotal: '0.50', discount: '0.00', tax: '0.00', total: '0.50' },
  payments: [{ method: 'CASH', amount: '0.50' }],
});
const queue = (...ns: number[]) => ns.forEach((n) => add({ sale: sale(n), cashierName: 'Sokha', customerName: null }));
const ids = () => entries().map((e) => e.sale.receiptNo);
const reply = (status: number, body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  write(K.session, { token: 't', user: { id: 'c', name: 'Sokha', email: 's@x', role: 'CASHIER' } });
});
afterEach(() => vi.unstubAllGlobals());

describe('outbox', () => {
  it('add() persists the entry before returning', () => {
    queue(1);
    expect(JSON.parse(localStorage.getItem(K.outbox) ?? '[]')).toHaveLength(1);
    expect(entries()[0].state).toBe('pending');
  });

  it('flush() sends oldest first and removes each on 2xx', async () => {
    queue(1, 2, 3);
    fetchMock.mockImplementation(() => reply(201));
    expect(await flush()).toBe('done');
    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).receiptNo);
    expect(sent).toEqual(['T1-000001', 'T1-000002', 'T1-000003']);
    expect(entries()).toEqual([]);
  });

  it('a network error keeps the entry with order preserved', async () => {
    queue(1, 2);
    fetchMock.mockImplementationOnce(() => reply(201)).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await flush()).toBe('offline');
    expect(ids()).toEqual(['T1-000002']);
  });

  it('a 401 stops the loop and keeps everything', async () => {
    queue(1, 2);
    fetchMock.mockImplementation(() => reply(401));
    expect(await flush()).toBe('unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['T1-000001', 'T1-000002']);
    expect(entries().every((e) => e.state === 'pending')).toBe(true);
  });

  it('a 400 marks needsAttention and continues with the next', async () => {
    queue(1, 2);
    fetchMock
      .mockImplementationOnce(() => reply(400, { error: 'Totals mismatch' }))
      .mockImplementationOnce(() => reply(201));
    expect(await flush()).toBe('done');
    expect(entries()).toMatchObject([{ state: 'attention', error: { status: 400, message: 'Totals mismatch' } }]);
  });

  it('a 200 for an already-existing sale (idempotent replay) is success', async () => {
    queue(1);
    fetchMock.mockImplementation(() => reply(200, { id: sale(1).id }));
    await flush();
    expect(entries()).toEqual([]);
  });

  it('a 5xx keeps the entry for later', async () => {
    queue(1);
    fetchMock.mockImplementation(() => reply(503));
    expect(await flush()).toBe('offline');
    expect(entries()[0].state).toBe('pending');
  });

  it('retry() requeues; discard() removes only that entry', async () => {
    queue(1, 2);
    fetchMock.mockImplementation(() => reply(409, { error: 'Receipt number already used' }));
    await flush();
    expect(entries().map((e) => e.state)).toEqual(['attention', 'attention']);
    retry(sale(1).id);
    expect(entries()[0]).toMatchObject({ state: 'pending' });
    expect(entries()[0].error).toBeUndefined();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    discard(sale(2).id, 'Duplicate', 'Dara');
    expect(ids()).toEqual(['T1-000001']);
  });

  it('concurrent flushes share one run (no double POST)', async () => {
    queue(1);
    fetchMock.mockImplementation(() => reply(201));
    await Promise.all([flush(), flush()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('nextReceiptNo', () => {
  it('counts T1-000001, T1-000002 … and survives a reload', () => {
    write(K.device, { code: 'T1' });
    expect(nextReceiptNo()).toBe('T1-000001');
    expect(nextReceiptNo()).toBe('T1-000002');
    // "reload": a fresh read of the same storage keeps counting
    expect(localStorage.getItem(K.counter)).toBe('2');
    expect(nextReceiptNo()).toBe('T1-000003');
    // peek shows the next one without using it up
    expect(peekReceiptNo()).toBe('T1-000004');
    expect(peekReceiptNo()).toBe('T1-000004');
  });
});
