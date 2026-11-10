// POS (06 Part A) end to end: device setup, PIN login, selling, paying, receipt, offline outbox,
// recent sales and voids. Each test is a fresh till (fresh localStorage) with its own device code,
// so receipt numbers never collide across tests on the shared pos_e2e database.
import { expect, test, type Page } from '@playwright/test';

const MANAGER = 'manager@shop.local';
const CASHIER = 'cashier@shop.local';
const PIN = '1234';

/** window.print() counts calls instead of opening a dialog. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __prints: number };
    w.__prints = 0;
    window.print = () => void w.__prints++;
  });
}
const prints = (page: Page) => page.evaluate(() => (window as unknown as { __prints: number }).__prints);

async function setUpTill(page: Page, code: string) {
  await stubPrint(page);
  await page.goto('/');
  await page.getByLabel('Device code').fill(code);
  await page.getByLabel('Manager email').fill(MANAGER);
  await page.getByLabel('Manager PIN').fill(PIN);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter your PIN')).toBeVisible();
}

async function typePin(page: Page, pin: string) {
  const pad = page.getByLabel('PIN keypad');
  for (const d of pin) await pad.getByRole('button', { name: d, exact: true }).click();
  await pad.getByRole('button', { name: 'Sign in' }).click();
}

async function signIn(page: Page, email: string) {
  await page.getByLabel('Your email').fill(email);
  await typePin(page, PIN);
  // The catalog loads right after sign-in
  await expect(page.getByRole('button', { name: /Water 500ml/ })).toBeVisible();
}

async function openTill(page: Page, code: string, email = CASHIER) {
  await setUpTill(page, code);
  await signIn(page, email);
}

const badge = (page: Page) => page.locator('.conn');
const scanBox = (page: Page) => page.getByLabel('Scan or search');
const total = (page: Page) => page.locator('.sum .total');

async function payExact(page: Page) {
  await page.keyboard.press('F9');
  const pay = page.getByRole('dialog');
  await pay.getByRole('button', { name: 'Exact' }).click();
  await pay.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('dialog', { name: 'Sale complete' })).toBeVisible();
}

test('device setup is manager-only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Set up this till' })).toBeVisible();
  await page.getByLabel('Device code').fill('t9'); // forced upper-case
  await expect(page.getByLabel('Device code')).toHaveValue('T9');
  await page.getByLabel('Manager email').fill(CASHIER);
  await page.getByLabel('Manager PIN').fill(PIN);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Only a manager or admin can set up a till.');

  await page.getByLabel('Manager email').fill(MANAGER);
  await page.getByLabel('Manager PIN').fill('9999');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or PIN');

  await page.getByLabel('Manager PIN').fill(PIN);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter your PIN')).toBeVisible();
});

test('wrong PIN counts down, the right PIN signs in and remembers the user', async ({ page }) => {
  await setUpTill(page, 'P1');
  await page.getByLabel('Your email').fill(CASHIER);
  await typePin(page, '9999');
  await expect(page.getByRole('alert')).toHaveText('Wrong PIN (4 tries left)');
  await typePin(page, PIN);
  await expect(page.getByRole('heading', { name: 'Current sale' })).toBeVisible();

  // Lock → the PIN screen offers the remembered cashier
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Lock' }).click();
  await expect(page.getByText('Enter PIN for Cashier')).toBeVisible();
  await page.keyboard.type(PIN); // physical keyboard works on the keypad too
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Current sale' })).toBeVisible();
});

test('cash sale: scan, tap, qty, pay with change, receipt prints, Enter starts the next sale', async ({ page }) => {
  await openTill(page, 'S1');
  const cart = page.getByRole('complementary', { name: 'Current sale' });
  await expect(cart.locator('.order')).toHaveText('S1-000001');

  // Water by barcode twice (increments), Cola by tile
  await scanBox(page).fill('8850999320014');
  await scanBox(page).press('Enter');
  await scanBox(page).fill('8850999320014');
  await scanBox(page).press('Enter');
  await page.getByRole('button', { name: /Cola 330ml/ }).click();
  await expect(cart.getByLabel('Quantity')).toHaveText(['2', '1']);
  // 0.50×2 + 0.90 = 1.90, tax 10 % = 0.19
  await expect(total(page)).toContainText('$2.09');

  // Unknown barcode: message, cart unchanged
  await scanBox(page).fill('0000000000000');
  await scanBox(page).press('Enter');
  await expect(page.getByText('No product matches “0000000000000”')).toBeVisible();

  // − on Cola removes it at qty 0, + brings Water to 3
  await cart.getByRole('button', { name: 'Decrease Cola 330ml' }).click();
  await cart.getByRole('button', { name: 'Increase Water 500ml' }).click();
  await expect(total(page)).toContainText('$1.65'); // 1.50 + 0.15 tax

  await page.getByRole('button', { name: /^Pay 1\.65/ }).click();
  const pay = page.getByRole('dialog');
  await expect(pay.locator('.due')).toHaveText('1.65');
  await pay.getByLabel('Cash tendered').fill('1');
  await expect(pay.getByRole('alert')).toContainText('Less than the 1.65 remaining');
  await expect(pay.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
  await pay.getByLabel('Cash tendered').fill('5');
  await expect(pay.locator('.change')).toHaveText('3.35');
  await pay.getByLabel('Cash tendered').press('Enter');

  const done = page.getByRole('dialog', { name: 'Sale complete' });
  await expect(done.locator('.due-change')).toHaveText('3.35');
  await expect(done.getByLabel('Receipt S1-000001')).toContainText('3 × Water 500ml');
  await expect(done.getByLabel('Receipt S1-000001')).toContainText('Cashier');
  await expect.poll(() => prints(page)).toBe(1); // printed automatically, once

  await page.keyboard.press('Enter');
  await expect(done).toBeHidden();
  await expect(cart.locator('.order')).toHaveText('S1-000002');
  await expect(cart).toContainText('Scan or tap a product to start a sale.');
  await expect(badge(page)).toHaveText('Online · 0 pending'); // uploaded

  // Recent sales: the server copy, completed, with a reprint
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Recent sales' }).click();
  const row = page.getByRole('row', { name: /S1-000001/ });
  await expect(row).toContainText('Completed');
  await expect(row).toContainText('1.65');
  await row.click();
  await expect(page.getByLabel('Receipt S1-000001').first()).toContainText('TOTAL');
  await page.getByRole('button', { name: 'Reprint' }).click();
  await expect.poll(() => prints(page)).toBe(2);
});

test('split payment with a customer and a line discount', async ({ page }) => {
  await openTill(page, 'S2');
  // Instant Noodles 0.60, tax 0 %; "noodles" + Enter adds the single match
  await scanBox(page).fill('noodles');
  await scanBox(page).press('Enter');
  await page.getByRole('button', { name: /Cookies 120g/ }).click();

  // 10 % off the cookies line (1.75 → 0.175 → 0.18 off)
  await page.getByRole('button', { name: 'Discount' }).click();
  const line = page.getByRole('dialog', { name: 'Cookies 120g' });
  await line.getByRole('button', { name: '%' }).click();
  await line.getByLabel('Discount', { exact: true }).fill('10');
  await expect(line).toContainText('= 1.57');
  await line.getByRole('button', { name: 'Done' }).click();
  await expect(total(page)).toContainText('$2.33'); // 0.60 + (1.75 − 0.18) + tax 0.157 → 0.16

  await page.keyboard.press('F4');
  const cust = page.getByRole('dialog', { name: 'Attach customer' });
  await expect(cust.getByLabel('Search by name or phone')).toBeFocused(); // F4 → straight to typing
  await page.keyboard.type('Dara');
  await cust.getByLabel('Search by name or phone').press('Enter');
  await expect(page.getByRole('button', { name: /Dara Kim/ })).toBeVisible();

  await page.keyboard.press('F9');
  const pay = page.getByRole('dialog');
  await pay.getByLabel('Cash tendered').fill('2');
  await pay.getByRole('button', { name: 'Add payment' }).click();
  await expect(pay).toContainText('Remaining 0.33');
  await pay.getByRole('radio', { name: 'Card' }).click();
  await expect(pay.getByLabel('Card amount')).toHaveValue('0.33'); // defaults to the remaining amount
  await pay.getByRole('button', { name: 'Complete sale' }).click();

  const receipt = page.getByRole('dialog', { name: 'Sale complete' }).getByLabel('Receipt S2-000001');
  await expect(receipt).toContainText('Dara Kim');
  await expect(receipt).toContainText('discount -0.18');
  await expect(receipt).toContainText('Cash');
  await expect(receipt).toContainText('Card');

  // New sale straight away (before the auto-print fires) still prints this receipt, once
  await page.getByRole('button', { name: /New sale/ }).click();
  await expect.poll(() => prints(page)).toBe(1);
});

test('offline: the sale is kept on the till and uploads when the network returns', async ({ page, context }) => {
  await openTill(page, 'S3');
  await context.setOffline(true);
  await expect(badge(page)).toHaveText('Offline · 0 pending');

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Chocolate Bar/ }).click();
    await payExact(page);
    await page.keyboard.press('Enter');
  }
  await expect(badge(page)).toHaveText('Offline · 2 pending');

  // Offline Recent sales shows the local copies as pending
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Recent sales' }).click();
  await expect(page.getByText('Offline: showing only the sales still on this till.')).toBeVisible();
  await expect(page.getByRole('row', { name: /S3-000002/ })).toContainText('Pending sync');
  await expect(page.getByRole('row', { name: /S3-000001/ })).toContainText('Pending sync');

  await context.setOffline(false);
  await expect(badge(page)).toHaveText('Online · 0 pending');
  await expect(page.getByRole('row', { name: /S3-000001/ })).toContainText('Completed');
  await expect(page.getByRole('row', { name: /S3-000002/ })).toContainText('Completed');
});

test('a manager voids a sale from Recent sales; a cashier cannot', async ({ page }) => {
  await openTill(page, 'S4', MANAGER);
  await page.getByRole('button', { name: /Peanuts 100g/ }).click();
  await payExact(page);
  await page.keyboard.press('Enter');
  await expect(badge(page)).toHaveText('Online · 0 pending');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Recent sales' }).click();
  await expect(page.getByText(/Manager view/)).toBeVisible();
  await page.getByRole('row', { name: /S4-000001/ }).click();
  await page.getByRole('button', { name: 'Void sale' }).click();
  const dlg = page.getByRole('dialog', { name: 'Void S4-000001?' });
  await expect(dlg.getByRole('button', { name: 'Void sale' })).toBeDisabled(); // reason required
  await dlg.getByLabel('Reason').fill('Customer changed their mind');
  await dlg.getByRole('button', { name: 'Void sale' }).click();
  await expect(page.getByText('Sale S4-000001 voided')).toBeVisible();
  await expect(page.getByRole('row', { name: /S4-000001/ })).toContainText('Voided');
  await expect(page.getByLabel('Receipt S4-000001').first()).toContainText('*** VOID ***');
});

test('cashier sees no Void button in Recent sales', async ({ page }) => {
  await openTill(page, 'S5');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Recent sales' }).click();
  await expect(page.getByRole('heading', { name: 'Recent sales' })).toBeVisible();
  await expect(page.getByText(/Manager view/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Void sale' })).toHaveCount(0);
});
