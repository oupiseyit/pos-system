import { describe, expect, it } from 'vitest';
import { ApiError, fieldErrors, qs } from './api';
import { addDays, avatar, dateTime, isoDay, money, presetRange, setShopTz } from './format';
import { renderToStaticMarkup } from 'react-dom/server';
import { code128, PATTERNS } from './code128';
import { Receipt, receiptModel, SAMPLE } from './receipt';
import type { Settings } from './types';

describe('format', () => {
  it('formats API money strings with thousands and 2 decimals', () => {
    expect(money('1240.5')).toBe('1,240.50');
    expect(money('0.1')).toBe('0.10');
    expect(money(null)).toBe('0.00');
  });

  it('buckets dates in the shop timezone', () => {
    setShopTz('Asia/Phnom_Penh'); // UTC+7
    expect(isoDay(new Date('2026-11-05T18:00:00Z'))).toBe('2026-11-06');
    expect(dateTime('2026-11-05T09:30:00Z')).toBe('05/11/2026 16:30');
    setShopTz('UTC');
  });

  it('does calendar arithmetic and presets (weeks start Monday)', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    const thu = '2026-11-05';
    expect(presetRange('today', thu)).toEqual([thu, thu]);
    expect(presetRange('yesterday', thu)).toEqual(['2026-11-04', '2026-11-04']);
    expect(presetRange('week', thu)).toEqual(['2026-11-02', thu]);
    expect(presetRange('week', '2026-11-08')).toEqual(['2026-11-02', '2026-11-08']); // Sunday
    expect(presetRange('month', thu)).toEqual(['2026-11-01', thu]);
  });

  it('makes avatar initials', () => {
    expect(avatar('Chan Dara').initials).toBe('CD');
    expect(avatar('Sokha').initials).toBe('SO');
  });
});

describe('api helpers', () => {
  it('builds query strings without empty values', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(qs({})).toBe('');
  });

  it('maps 400 zod details and 409 duplicates to field errors', () => {
    expect(fieldErrors(new ApiError(400, 'Validation failed', { price: ['Money: bad'], sku: [] }))).toEqual({
      price: 'Money: bad',
    });
    expect(fieldErrors(new ApiError(409, 'Already exists', { field: 'sku' }))).toEqual({ sku: 'Already used' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});

describe('receipt', () => {
  const shop: Settings = {
    shopName: 'My Shop',
    address: '12 Street 271, Phnom Penh',
    phone: '012 345 678',
    taxId: '1234567',
    currency: 'USD',
    timezone: 'UTC',
    receiptFooter: 'Thank you! Come again',
  };

  it('builds the 06 §A6 receipt: header, meta, one line per item, discount total, payments', () => {
    const m = receiptModel(shop, SAMPLE);
    expect(m.header).toEqual(['12 Street 271, Phnom Penh', 'Tel 012 345 678 · VAT 1234567']);
    expect(m.meta).toEqual([
      ['T1-000124', '05/11/2026 09:30'],
      ['Cashier', 'Sokha'],
    ]);
    expect(m.items[0]).toEqual({
      label: '2 × Coffee beans 250g',
      each: '6.50 each',
      amount: '13.00',
      discount: '-1.00',
    });
    expect(m.items[1]).toMatchObject({ label: '6 × Water 500ml', amount: '3.00', discount: '' });
    expect(m.totals).toEqual([
      ['Subtotal', '16.00'],
      ['Discount', '-1.00'],
      ['Tax', '1.50'],
    ]);
    expect(m.total).toBe('$16.50');
    expect(m.payments).toEqual([
      ['Cash', '20.00'],
      ['Change', '3.50'],
    ]);
    expect(m.voided).toBeNull();
  });

  it('leaves out empty parts: no discount line, no change, no customer', () => {
    const m = receiptModel(
      { ...shop, address: '', phone: '', taxId: '' },
      { ...SAMPLE, discount: '0.00', payments: [{ method: 'CARD', amount: '16.50', tendered: null, change: null }] },
    );
    expect(m.header).toEqual([]);
    expect(m.totals.map(([l]) => l)).toEqual(['Subtotal', 'Tax']);
    expect(m.payments).toEqual([['Card', '16.50']]);
  });

  it('marks a voided sale', () => {
    const m = receiptModel(shop, {
      ...SAMPLE,
      status: 'VOIDED',
      voidedAt: '2026-11-05T10:00:00Z',
      voidReason: 'Wrong items',
    });
    expect(m.voided).toBe('05/11/2026 10:00 · Wrong items');
    expect(renderToStaticMarkup(<Receipt settings={shop} sale={{ ...SAMPLE, status: 'VOIDED' }} />)).toContain(
      '*** VOID ***',
    );
  });

  it('renders the barcode and footer', () => {
    const html = renderToStaticMarkup(<Receipt settings={shop} sale={SAMPLE} />);
    expect(html).toContain('aria-label="Barcode T1-000124"');
    expect(html).toContain('Thank you! Come again');
  });
});

describe('code128', () => {
  it('has a well-formed symbol table (11 modules each, even bar total, all distinct)', () => {
    const data = PATTERNS.slice(0, 106);
    expect(PATTERNS).toHaveLength(107);
    for (const p of data) {
      const w = [...p].map(Number);
      expect(w).toHaveLength(6);
      expect(w.reduce((a, b) => a + b)).toBe(11);
      expect((w[0] + w[2] + w[4]) % 2).toBe(0);
    }
    expect(new Set(data).size).toBe(106);
    expect([...PATTERNS[106]].map(Number).reduce((a, b) => a + b)).toBe(13); // Stop
  });

  it('encodes start B, data, mod-103 check, stop (PJJ123C → check 55)', () => {
    const w = code128('PJJ123C').join('');
    const sym = (i: number) => PATTERNS[i];
    expect(w.startsWith(sym(104) + sym(48) + sym(42))).toBe(true); // Start B, "P", "J"
    expect(w.endsWith(sym(55) + sym(106))).toBe(true);
    expect(w).toHaveLength(6 * 9 + 7);
  });

  it('rejects characters outside Code 128 B', () => {
    expect(() => code128('T1-é')).toThrow(/can't encode/);
  });
});
