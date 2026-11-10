// Back office (06 Part B) end to end on the seeded pos_e2e shop: sign-in rules, catalog, inventory,
// sales + void, reports + CSV, customers, staff and settings, and what a manager may not see.
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN } from '../playwright.config';

const API = 'http://localhost:3100/api';
const run = Date.now().toString(36).toUpperCase(); // unique names if the database is reused

async function signIn(page: Page, email: string, password = ADMIN.password) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
const asAdmin = async (page: Page) => {
  await signIn(page, ADMIN.email);
  await expect(page.getByRole('complementary', { name: 'Main' })).toBeVisible();
};

/** A completed sale made straight through the API, as a till would upload it. */
async function apiSale(request: APIRequestContext, receiptNo: string) {
  const login = await request.post(`${API}/auth/pin`, { data: { email: 'cashier@shop.local', pin: '1234' } });
  const { token, user } = (await login.json()) as { token: string; user: { id: string } };
  const headers = { Authorization: `Bearer ${token}` };
  const list = await request.get(`${API}/products?search=Water%20500ml`, { headers });
  const water = ((await list.json()) as { data: { id: string; price: string }[] }).data[0];
  const res = await request.post(`${API}/sales`, {
    headers,
    data: {
      id: randomUUID(),
      receiptNo,
      deviceCode: 'BO',
      cashierId: user.id,
      customerId: null,
      createdAt: new Date().toISOString(),
      items: [
        {
          productId: water.id,
          nameSnapshot: 'Water 500ml',
          unitPrice: '0.50',
          qty: 2,
          discount: '0.00',
          taxRate: '10.00',
        },
      ],
      totals: { subtotal: '1.00', discount: '0.00', tax: '0.10', total: '1.10' },
      payments: [{ method: 'CASH', amount: '1.10', tendered: '2.00' }],
    },
  });
  expect(res.status()).toBe(201);
}

test.describe('sign-in', () => {
  test('wrong password, cashier refused, admin gets in', async ({ page }) => {
    await signIn(page, ADMIN.email, 'not-the-password');
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');

    await signIn(page, 'cashier@shop.local');
    await expect(page.getByRole('alert')).toHaveText('The back office is for managers. Use the POS.');

    await asAdmin(page);
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to back office' })).toBeVisible();
  });

  test('a manager has no Staff or Settings', async ({ page }) => {
    await signIn(page, 'manager@shop.local');
    const nav = page.getByRole('complementary', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible();
  });
});

test('catalog: category → product → receive stock → movement; duplicate SKU refused', async ({ page }) => {
  await asAdmin(page);
  const cat = `Bakery ${run}`;
  const sku = `E2E-${run}`;

  await page.getByRole('link', { name: 'Categories' }).click();
  await page.getByLabel('New category name').fill(cat);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByLabel('Category name').filter({ hasText: '' }).last()).toHaveValue(cat);

  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('link', { name: 'Add product' }).click();
  await page.getByLabel('SKU').fill(sku);
  await page.getByLabel('Name').fill('Croissant');
  await page.getByLabel('Category', { exact: true }).last().selectOption({ label: cat });
  await page.getByLabel('Price').fill('2.50');
  await page.getByLabel('Cost').fill('1.00');
  await page.getByLabel('Tax rate %').fill('0');
  await page.getByLabel('Reorder level').fill('5');
  await page.getByRole('button', { name: 'Add product' }).click();
  const form = page.getByRole('form', { name: 'Croissant' });
  await expect(form.getByText('Stock on hand')).toBeVisible();

  await form.getByRole('link', { name: 'Receive stock' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await page.getByLabel('Note').fill(`INV-${run}`);
  await page.getByLabel('Qty, row 1').fill('12');
  await page.getByRole('button', { name: 'Save receipt' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toContainText(`${sku} 0 → 12`);

  await page.getByRole('tab', { name: 'Movements' }).click();
  const mv = page.getByRole('row', { name: new RegExp(`INV-${run}`) });
  await expect(mv).toContainText('Croissant');
  await expect(mv).toContainText('Receive');
  await expect(mv).toContainText('+12');

  // Same SKU again → field error
  await page.goto('/#/products/new');
  await page.getByLabel('SKU').fill(sku);
  await page.getByLabel('Name').fill('Croissant copy');
  await page.getByLabel('Price').fill('1');
  await page.getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByText('Already used')).toBeVisible();
});

test('sales: find a sale, see its receipt, void it with a reason', async ({ page, request }) => {
  const receiptNo = `BO-${run}`;
  await apiSale(request, receiptNo);
  await asAdmin(page);
  await page.getByRole('link', { name: 'Sales' }).click();
  await page.getByLabel('Receipt no').fill(receiptNo);
  await page.getByRole('link', { name: receiptNo }).click();
  await expect(page.getByLabel(`Receipt ${receiptNo}`).first()).toContainText('2 × Water 500ml');

  await page.getByRole('button', { name: 'Void sale…' }).click();
  const dlg = page.getByRole('dialog', { name: `Void ${receiptNo}?` });
  // Focus starts in the reason box and stays there key by key (it used to jump to the ✕)
  await expect(dlg.getByLabel('Reason')).toBeFocused();
  await page.keyboard.type('Wrong item rung up');
  await expect(dlg.getByLabel('Reason')).toHaveValue('Wrong item rung up');
  await dlg.getByRole('button', { name: 'Void sale' }).click();
  await expect(page.getByText(/Voided .* Wrong item rung up/)).toBeVisible();
  await expect(page.getByLabel(`Receipt ${receiptNo}`).first()).toContainText('*** VOID ***');
  await expect(page.getByRole('button', { name: 'Void sale…' })).toHaveCount(0);
});

test('reports: each report opens and Export CSV downloads a file', async ({ page, request }) => {
  await apiSale(request, `RP-${run}`);
  await asAdmin(page);
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  const reports = page.getByRole('navigation', { name: 'Report' }).getByRole('button');
  await expect(reports.first()).toBeVisible();
  const n = await reports.count();
  expect(n).toBeGreaterThan(1);
  for (let i = 0; i < n; i++) {
    await reports.nth(i).click();
    await expect(reports.nth(i)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.page-h h1')).not.toBeEmpty();
    await expect(page.getByText('Loading')).toHaveCount(0);
  }
  await reports.first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test('customers: add one and find it', async ({ page }) => {
  await asAdmin(page);
  const name = `Customer ${run}`;
  await page.getByRole('link', { name: 'Customers' }).click();
  await page.getByRole('link', { name: 'Add customer' }).first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Phone').fill('+85511222333');
  await page.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByText(/Customer since/)).toBeVisible();
  await page.getByRole('link', { name: 'Customers' }).click();
  await page.getByLabel('Search').fill(run);
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
});

test('staff: an admin adds a cashier with a PIN', async ({ page }) => {
  await asAdmin(page);
  const email = `dana.${run.toLowerCase()}@shop.local`;
  await page.getByRole('link', { name: 'Staff' }).click();
  await page.getByRole('link', { name: 'Add staff' }).click();
  await page.getByLabel('Name').fill('Dana');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Role').selectOption('CASHIER');
  await page.getByLabel('Password').fill('dana-password');
  await page.getByLabel('PIN').fill('4321');
  await page.getByRole('button', { name: 'Add staff' }).click();
  await expect(page.getByRole('row', { name: new RegExp(email) })).toBeVisible();

  // The new cashier can use their PIN at a till (API check; the POS spec covers the screen)
  const res = await page.request.post(`${API}/auth/pin`, { data: { email, pin: '4321' } });
  expect(res.status()).toBe(200);
});

test('settings: shop name and GMT+7 timezone save, show in the shell and the receipt preview', async ({ page }) => {
  await asAdmin(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Shop name').fill(`E2E Mart ${run}`);
  await page.getByLabel('Timezone').selectOption('Asia/Phnom_Penh');
  await page.getByLabel('Footer').fill('Thank you!');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('complementary', { name: 'Main' })).toContainText(`E2E Mart ${run}`);
  await expect(page.getByLabel('Receipt T1-000124')).toContainText(`E2E Mart ${run}`);
  await expect(page.getByLabel('Receipt T1-000124')).toContainText('Thank you!');

  await page.reload();
  await expect(page.getByLabel('Timezone')).toHaveValue('Asia/Phnom_Penh');
});
