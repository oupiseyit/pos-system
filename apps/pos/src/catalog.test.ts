// Catalog delta sync (03 §5) and the till-side receipt mapping. localStorage stubbed, fetch stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categories, customers, lastSync, merge, products, refresh, settings } from './catalog';
import { entryReceipt } from './receipt';
import { K, read, write } from './store';
import { memoryStorage } from './test-storage';

const prod = (id: string, name: string, updatedAt: string, active = true) => ({ id, name, updatedAt, active });
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('merge', () => {
  it('upserts by id, drops rows that fail keep(), sorts by name', () => {
    const cached = [prod('1', 'Water', 'a'), prod('2', 'Cola', 'a')];
    const fresh = [prod('2', 'Cola', 'b', false), prod('3', 'Apple', 'b'), prod('1', 'Water 1L', 'b')];
    const out = merge(cached, fresh, (x) => x.active);
    expect(out.map((x) => x.name)).toEqual(['Apple', 'Water 1L']);
  });
});

describe('refresh', () => {
  // Route each request by path; products come back in two pages
  function serve(productPages: unknown[][], productTotal: number) {
    fetchMock.mockImplementation((url: string) => {
      const u = new URL(url, 'http://x');
      if (u.pathname === '/api/products') {
        const page = Number(u.searchParams.get('page'));
        return json({ data: productPages[page - 1] ?? [], total: productTotal });
      }
      if (u.pathname === '/api/customers') return json({ data: [], total: 0 });
      if (u.pathname === '/api/categories') return json([{ id: 'c1', name: 'Drinks' }]);
      if (u.pathname === '/api/settings') return json({ shopName: 'Shop', timezone: 'Asia/Phnom_Penh' });
      throw new Error(`unexpected ${url}`);
    });
  }
  const sinceOf = (path: string) =>
    fetchMock.mock.calls
      .map(([u]) => new URL(u as string, 'http://x'))
      .filter((u) => u.pathname === path)
      .map((u) => u.searchParams.get('updatedSince'));

  it('first sync reads every page from epoch and caches everything', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) =>
      prod(`p${i}`, `P${String(i).padStart(3, '0')}`, '2026-11-01T00:00:00.000Z'),
    );
    serve([page1, [prod('last', 'Zz', '2026-11-02T00:00:00.000Z')]], 201);
    await refresh();
    expect(products()).toHaveLength(201);
    expect(sinceOf('/api/products')).toEqual([new Date(0).toISOString(), new Date(0).toISOString()]);
    expect(categories()).toEqual([{ id: 'c1', name: 'Drinks' }]);
    expect(settings()?.timezone).toBe('Asia/Phnom_Penh');
    expect(customers()).toEqual([]);
    expect(lastSync()).toBeTruthy();
  });

  it('the next sync asks only for changes since the newest updatedAt and drops deactivated products', async () => {
    write(K.products, [prod('a', 'A', '2026-11-01T00:00:00.000Z'), prod('b', 'B', '2026-11-01T00:00:00.000Z')]);
    write(K.sync, { productsSince: '2026-11-01T00:00:00.000Z' });
    serve([[prod('b', 'B', '2026-11-03T00:00:00.000Z', false)]], 1);
    await refresh();
    expect(sinceOf('/api/products')).toEqual(['2026-11-01T00:00:00.000Z']);
    expect(products().map((p) => p.id)).toEqual(['a']);
    expect(read<{ productsSince: string }>(K.sync, { productsSince: '' }).productsSince).toBe(
      '2026-11-03T00:00:00.000Z',
    );
  });
});

describe('entryReceipt', () => {
  it('maps an outbox sale to the shared receipt, with change from tendered cash', () => {
    const r = entryReceipt({
      cashierName: 'Sokha',
      customerName: 'Dara Kim',
      sale: {
        id: 'x',
        receiptNo: 'T1-000007',
        deviceCode: 'T1',
        cashierId: 'c',
        customerId: 'k',
        createdAt: '2026-11-05T09:30:00.000Z',
        items: [
          { productId: 'p', nameSnapshot: 'Water', unitPrice: '0.50', qty: 2, discount: '0.00', taxRate: '0.00' },
        ],
        totals: { subtotal: '1.00', discount: '0.00', tax: '0.00', total: '1.00' },
        payments: [
          { method: 'CASH', amount: '0.60', tendered: '5.00' },
          { method: 'CARD', amount: '0.40' },
        ],
      },
    });
    expect(r).toMatchObject({
      receiptNo: 'T1-000007',
      status: 'COMPLETED',
      cashier: { name: 'Sokha' },
      customer: { name: 'Dara Kim' },
      total: '1.00',
      payments: [
        { method: 'CASH', amount: '0.60', tendered: '5.00', change: '4.40' },
        { method: 'CARD', amount: '0.40', tendered: null, change: null },
      ],
    });
  });
});
