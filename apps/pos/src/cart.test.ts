// 08 §3 "Pay dialog": completion rules, plus cart arithmetic.
import { describe, expect, it } from 'vitest';
import { addProduct, discountCents, payState, quickCash, setQty, toSale, totals, type Line } from './cart';

const coffee = { id: 'c', name: 'Coffee beans 250g', price: '6.50', taxRate: '10.00' };
const water = { id: 'w', name: 'Water 500ml', price: '0.50', taxRate: '0.00' };

describe('cart', () => {
  it('adds, increments, and removes at qty 0', () => {
    let l: Line[] = addProduct([], coffee);
    l = addProduct(l, coffee);
    l = addProduct(l, water);
    expect(l.map((x) => [x.productId, x.qty])).toEqual([
      ['c', 2],
      ['w', 1],
    ]);
    expect(setQty(l, 'w', 0)).toHaveLength(1);
  });

  it('discount as amount or percent; never more than the line', () => {
    const line = addProduct(addProduct([], coffee), coffee)[0]; // 2 × 6.50 = 13.00
    expect(discountCents(line, '1.00')).toBe(100);
    expect(discountCents(line, '10%')).toBe(130);
    expect(discountCents(line, '13.01')).toBeNull();
    expect(discountCents(line, 'abc')).toBeNull();
    // lowering qty cuts an oversized discount down to the new line amount
    const cut = setQty([{ ...line, discount: '12.00' }], 'c', 1);
    expect(cut[0].discount).toBe('6.50');
  });

  it('totals match the 05 §9 example', () => {
    const l = [{ ...addProduct(addProduct([], coffee), coffee)[0], discount: '1.00' }];
    expect(totals(l)).toEqual({ subtotal: '13.00', discount: '1.00', tax: '1.20', total: '13.20' });
  });
});

describe('pay', () => {
  it('Complete is disabled until the bill is covered', () => {
    expect(payState(1650, [], 'CASH', '').canComplete).toBe(false);
    expect(payState(1650, [], 'CASH', '20.00')).toMatchObject({ canComplete: true, change: 350 });
    expect(payState(1650, [], 'CARD', '16.50').canComplete).toBe(true);
  });

  it('an amount above the server ceiling (e.g. a scanned barcode) is refused', () => {
    const s = payState(1650, [], 'CASH', '4006381333931');
    expect(s).toMatchObject({ canComplete: false, canAdd: false, final: null });
    expect(s.error).toMatch(/too large/);
    expect(payState(1650, [], 'CASH', '999999.99').canComplete).toBe(true);
  });

  it('cash tendered < amount shows an error (but can be a part payment)', () => {
    const s = payState(1650, [], 'CASH', '10.00');
    expect(s.canComplete).toBe(false);
    expect(s.error).toMatch(/Less than the 16.50 remaining/);
    expect(s.canAdd).toBe(true);
  });

  it('card can’t exceed the remaining amount', () => {
    expect(payState(1650, [], 'CARD', '17.00').error).toMatch(/more than/);
  });

  it('split: cash 10.00 + card 6.50 completes a 16.50 sale', () => {
    const afterCash = payState(1650, [{ method: 'CASH', amount: '10.00', tendered: '10.00' }], 'CARD', '6.50');
    expect(afterCash.remaining).toBe(650);
    expect(afterCash.final).toEqual({ method: 'CARD', amount: '6.50' });
    expect(afterCash.canComplete).toBe(true);
  });

  it('quick cash: exact, next whole unit, then notes', () => {
    expect(quickCash(1650)).toEqual([1650, 1700, 2000, 5000, 10000]);
    expect(quickCash(2000)).toEqual([2000, 5000, 10000]);
  });

  it('builds the POST /sales body', () => {
    const lines = addProduct([], water);
    const s = toSale({
      id: 'id',
      receiptNo: 'T1-000001',
      deviceCode: 'T1',
      cashierId: 'u',
      customerId: null,
      lines,
      payments: [{ method: 'CASH', amount: '0.50', tendered: '1.00' }],
      now: new Date('2026-11-05T09:30:00Z'),
    });
    expect(s).toMatchObject({
      createdAt: '2026-11-05T09:30:00.000Z',
      items: [{ nameSnapshot: 'Water 500ml', unitPrice: '0.50', qty: 1, discount: '0.00' }],
      totals: { total: '0.50' },
      payments: [{ method: 'CASH', amount: '0.50', tendered: '1.00' }],
    });
  });
});
