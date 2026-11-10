import { describe, expect, it } from 'vitest';
import { computeTotals, fromCents, toCents } from './totals.js';

const line = (unitPrice: string, qty: number, discount = '0', taxRate = '0') => ({ unitPrice, qty, discount, taxRate });

describe('computeTotals (08 §3)', () => {
  it('1 item, no tax, no discount: total = price × qty', () => {
    expect(computeTotals([line('2.25', 3)]).totals).toEqual({
      subtotal: '6.75',
      discount: '0.00',
      tax: '0.00',
      total: '6.75',
    });
  });

  it('tax 10 % on 6.50 × 2 − 1.00', () => {
    const r = computeTotals([line('6.50', 2, '1.00', '10.00')]);
    expect(r.totals).toEqual({ subtotal: '13.00', discount: '1.00', tax: '1.20', total: '13.20' });
    expect(r.lines[0]).toEqual({ tax: '1.20', lineTotal: '13.20' });
  });

  it('rounds tax half-up per line, and lines sum exactly to the total', () => {
    // 0.99 × 7 % = 0.0693 → 0.07
    const r = computeTotals([line('0.33', 3, '0', '7.00'), line('0.33', 3, '0', '7.00')]);
    expect(r.lines[0]).toEqual({ tax: '0.07', lineTotal: '1.06' });
    expect(r.totals.total).toBe('2.12');
    // exact half: 0.50 × 1 % = 0.005 → 0.01
    expect(computeTotals([line('0.50', 1, '0', '1.00')]).totals.tax).toBe('0.01');
  });

  it('multiple lines with different tax rates: tax = Σ line taxes', () => {
    const r = computeTotals([line('10.00', 1, '0', '10.00'), line('5.00', 2, '0', '0'), line('3.33', 1, '0', '7.00')]);
    expect(r.lines.map((l) => l.tax)).toEqual(['1.00', '0.00', '0.23']);
    expect(r.totals).toEqual({ subtotal: '23.33', discount: '0.00', tax: '1.23', total: '24.56' });
  });

  it('discount equal to the line amount: net 0, tax 0', () => {
    expect(computeTotals([line('4.00', 2, '8.00', '10.00')]).totals).toEqual({
      subtotal: '8.00',
      discount: '8.00',
      tax: '0.00',
      total: '0.00',
    });
  });

  it('empty cart: all "0.00"', () => {
    expect(computeTotals([]).totals).toEqual({ subtotal: '0.00', discount: '0.00', tax: '0.00', total: '0.00' });
  });
});

describe('toCents / fromCents', () => {
  it('parses without floats', () => {
    expect([toCents('6.5'), toCents('12'), toCents('0.07'), toCents('-1.10')]).toEqual([650, 1200, 7, -110]);
    expect(() => toCents('1.234')).toThrow();
    expect([fromCents(650), fromCents(7), fromCents(-110)]).toEqual(['6.50', '0.07', '-1.10']);
  });
});
