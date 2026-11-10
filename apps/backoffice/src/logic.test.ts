import { describe, expect, it } from 'vitest';
import { ApiError, fieldErrors, qs } from './api';
import { addDays, avatar, dateTime, isoDay, money, presetRange, setShopTz } from './format';
import { renderReceipt, SAMPLE, W } from './receipt';
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

  it('renders the 06 §A6 layout within 42 columns', () => {
    const lines = renderReceipt(shop, SAMPLE).split('\n');
    expect(lines.every((l) => l.length <= W)).toBe(true);
    expect(lines[0].trim()).toBe('MY SHOP');
    expect(lines).toContain('  2 x 6.50'.padEnd(W - 5) + '13.00');
    expect(lines).toContain('Discount'.padEnd(W - 5) + '-1.00');
    expect(lines).toContain('TOTAL'.padEnd(W - 9) + 'USD 16.50');
    expect(lines).toContain('Change'.padEnd(W - 4) + '3.50');
    expect(lines.at(-1)?.trim()).toBe('Thank you! Come again');
  });

  it('marks a voided sale', () => {
    const text = renderReceipt(shop, { ...SAMPLE, status: 'VOIDED', voidReason: 'Wrong items' });
    expect(text).toContain('*** VOID ***');
    expect(text).toContain('Wrong items');
  });
});
