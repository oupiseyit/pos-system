# 08 — Testing Strategy

## 1. Principles
- **Test where money and stock change.** `computeTotals`, `POST /sales`, voids, stock adjustments and the outbox carry most of the risk, so most of the tests go there.
- **Integration over mocks.** API tests run against a real Postgres (the Compose service) because Prisma, transactions and constraints are part of the behaviour.
- **Two tools:** Vitest for the API and both React apps, Playwright for end-to-end flows in a real browser. The manual checklist (§5) still covers what a browser can't fake: the scanner, the thermal printer and a real network cut.

## 2. Pyramid

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure functions: `computeTotals`, money formatting, outbox state machine, receipt-number generator, report date-range helpers | Every save / CI |
| API integration | Vitest + Supertest + Postgres `pos_test` | Route → DB, including auth and roles | CI, locally before push |
| E2E | Playwright (Chromium) | `e2e/pos.spec.ts`, `e2e/backoffice.spec.ts`: whole flows through Vite → API → Postgres `pos_e2e` | CI, locally before push |
| Manual E2E | Checklist (§5) | Real till, scanner, printer, network | Before each release |

## 3. Unit tests

### `apps/api/src/totals.test.ts`
| Case | Expect |
|---|---|
| 1 item, no tax, no discount | total = price × qty |
| Tax 10 % on 6.50 × 2 − 1.00 | net 12.00, tax 1.20, total 13.20 |
| Rounding: 3 × 0.33 at 7 % | tax per line rounded half-up, lines sum exactly to total |
| Multiple lines with different tax rates | tax = Σ line taxes |
| Discount equals line amount | net 0, tax 0 |
| Empty cart | all "0.00" |

### `apps/pos/src/outbox.test.ts`
(localStorage as an in-memory stub, `fetch` stubbed; no jsdom needed.)
- `add()` persists the entry before returning.
- `flush()` sends oldest first. A 2xx removes the entry, a network error keeps it with order preserved, a 401 stops the loop and keeps everything, and a 400 marks it `needsAttention` and continues with the next one.
- A 200 for an already-existing sale (an idempotent replay) is treated as success.
- `nextReceiptNo()` gives `T1-000001`, `T1-000002`, … and survives a reload.

### `apps/pos/src/catalog.test.ts`
- `merge()` upserts by id, drops deactivated rows and sorts by name.
- `refresh()`: the first sync reads every page from the epoch; the next asks only `updatedSince` the newest `updatedAt` seen and drops deactivated products.
- `entryReceipt()` maps an outbox sale to the shared receipt, with change from tendered cash.

### Pay dialog and line editor (`apps/pos/src/cart.test.ts` + `e2e/pos.spec.ts`)
The rules live in pure functions in `cart.ts` (`payState()`, `discountCents()`), unit-tested here; Playwright covers the rendered dialogs. No jsdom/RTL layer: add one only if a component gains logic that isn't in `cart.ts`.
- Complete is disabled until remaining = 0.
- Cash tendered < amount shows an error.
- A split of cash 10.00 + card 6.50 completes a 16.50 sale.

## 4. API integration tests
Setup: `TEST_DATABASE_URL` (default: `DATABASE_URL` with the database `pos_test`; `vitest.config.ts` refuses any other database). Vitest's global setup runs `prisma migrate deploy` once. Files run one at a time, and each starts with `resetDb()` (TRUNCATE) and seeds what it needs with helpers in `test/fixtures.ts` (`makeUser(role)`, `makeProduct()`, `tokenFor(user)`, `saleBody()`).

| File | Cases |
|---|---|
| `auth.test.ts` | login ok/bad password/inactive user · PIN lockout after 5 failures returns 423, then unlock works · expired token → 401 · deactivated user with valid token → 401 |
| `roles.test.ts` | table-driven: for each endpoint in [05 §12](05-api-spec.md#12-endpoint-summary), the role just below the minimum gets 403 and the minimum role gets non-403 |
| `products.test.ts` | create, duplicate SKU/barcode → 409 · `PATCH` ignores `stockQty` · `updatedSince` returns changed and deactivated products |
| `inventory.test.ts` | receive increases stock + writes `RECEIVE` · count 10→8 writes `ADJUST −2` · count with no change writes nothing · adjust without note → 400 |
| `sales.test.ts` | **happy path:** sale created, stock decremented, `SALE` movements written · **idempotent:** same id twice → one sale, one decrement, second returns 200 · **totals mismatch** → 400, nothing written · **payments ≠ total** → 400 · cash tendered < amount → 400 · unknown product → 400 · same receiptNo, different id → 409 · **negative stock** allowed · deactivated cashier's offline sale accepted · cashier `GET /sales` sees only own sales from today |
| `void.test.ts` | void restores stock with `RETURN` movements · second void → 409 · cashier → 403 · voided sale excluded from `/reports/daily` |
| `reports.test.ts` | sales on both sides of midnight in `Setting.timezone` bucket into the right days · payment report sums cash/card · low-stock lists negatives first · CSV format returns `text/csv` |
| `invariants.test.ts` | after a mixed scenario (receive, sales, void, adjust), every product's `stockQty = Σ qtyChange` |

## 4a. E2E tests (Playwright)
`npm run e2e` starts its own stack, so it never touches dev data or the dev servers: the API on :3100 against the `pos_e2e` database (wiped, migrated and seeded with the dev seed by `e2e/prepare-db.mjs`, which refuses any other database), the POS on :5183 and the back office on :5184. Only Postgres must be running (`docker compose up -d postgres`). Specs run one at a time on that shared database; each POS test is a new till with its own device code. `window.print` is stubbed to count calls. Traces of failures land in `test-results/` (`npx playwright show-trace …`).

| File | Flows |
|---|---|
| `pos.spec.ts` | device setup is manager-only · wrong PIN counts down, Lock and keyboard PIN · cash sale: barcode scan ×2, tile, unknown barcode, ±qty, short cash refused, change, auto-print once, Enter → next receipt number, upload, Recent sales + reprint · split cash + card with a % line discount and a customer · offline: 2 sales queue, Recent shows them pending, reconnect uploads both · manager voids from Recent sales · cashier has no Void |
| `backoffice.spec.ts` | wrong password, cashier refused, admin in, log out · manager has no Staff/Settings and is refused at `#/settings` · category → product → receive stock → movement row, duplicate SKU refused · find a sale, receipt, void with reason · every report opens, CSV downloads · add + search a customer · add a cashier with a PIN · settings: shop name, Asia/Phnom_Penh, footer, receipt preview |

## 5. Manual release checklist
Run on a real till browser (Chrome), with a barcode scanner and an 80mm printer.

**Setup & auth**
- [ ] Fresh device: device setup screen accepts a manager PIN and stores code `T1`.
- [ ] Cashier PIN login, wrong PIN ×5 locks, and an admin unlocks in the back office.

**Selling**
- [ ] Scanning a barcode adds the item, scanning again increments it, and an unknown barcode shows a message while keeping focus.
- [ ] Search, category filter, line discount and remove all work.
- [ ] A cash sale with change prints a correct receipt (alignment, totals, footer).
- [ ] A split cash + card sale works.
- [ ] Attach an existing customer, and create a new one.
- [ ] Reprint from Recent sales.

**Offline**
- [ ] DevTools → Network → Offline (or unplug the network). The badge turns amber.
- [ ] Make 2 sales, and receipts print with sequential numbers.
- [ ] Close the tab and reopen the POS while still offline. It loads, and "2 pending" shows.
- [ ] Reconnect. Within 30 s the badge shows 0 pending, the sales appear in the back office with the "synced later" note, and stock is decremented.
- [ ] Toggle the network quickly while syncing, and check that no duplicates appear.

**Back office**
- [ ] Create a product, and it appears on the POS within 5 min (or after "Sync now").
- [ ] Receive stock and run a stock count, and the movements show the correct user and notes.
- [ ] Void a sale: stock returns, reports exclude it, and the reprint shows VOID.
- [ ] Each report matches a hand calculation for a small known day. CSV opens in a spreadsheet.
- [ ] A manager can't see Staff/Settings, and a cashier is refused at back office login.

**Deploy**
- [ ] `GET /api/health` returns ok over HTTPS. A backup file was created last night, and the restore test passed this month.

## 6. Test data
- `apps/api/src/seed.ts` (dev): 2 categories, 10 products with real-looking barcodes, admin/manager/cashier (PIN `1234`), and 3 customers.
- The test fixtures create everything per file, with no dependency on seed data.

## 7. Commands & CI
```bash
docker compose up -d db                      # Postgres for dev + tests
npm test -w apps/api                         # unit + integration (uses pos_test)
npm test -w apps/pos                         # outbox, cart/pay rules, catalog
npm test -w apps/backoffice
npm run typecheck                            # tsc --noEmit, all apps + e2e
npm run e2e                                  # Playwright; first time: npx playwright install chromium
```
CI (GitHub Actions, on every push/PR): a Postgres 16 service container → `npm ci` → typecheck → tests → Playwright E2E → `npm audit --audit-level=high` → `docker build`. The audit passes thanks to one npm `overrides` entry in the root `package.json`: `deepmerge-ts` ^8 under Prisma 6's CLI (the high advisory's own fix is Prisma 7, a major upgrade). Drop the override when upgrading Prisma.

## 8. Definition of done (per feature)
- The acceptance criteria in [02-user-stories.md](02-user-stories.md) are met.
- Integration tests cover the happy path, the role check and each business-rule rejection.
- Money and stock changes keep the invariants in [04 §4](04-database-schema.md#4-invariants-enforced-in-the-api-inside-one-transaction).
- Typecheck is clean, and CI is green.
- Docs are updated when an endpoint, table or screen changed.
