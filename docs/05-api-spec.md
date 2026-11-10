# 05 — API Specification

## 1. Conventions
- **Base URL:** `https://<host>/api`
- **Format:** JSON request and response, `Content-Type: application/json`.
- **Auth:** `Authorization: Bearer <JWT>` on every endpoint except `POST /auth/login`, `POST /auth/pin` and `GET /health`.
- **Roles:** "Role" below is the minimum role. Rank is `CASHIER < MANAGER < ADMIN`.
- **Money:** decimal strings with exactly 2 places (`"price": "12.50"`), never JSON numbers, so no float rounding. Requests also accept up to 2 decimal places (`"12.5"`). Tax rates are percent strings (`"10.00"` = 10 %).
- **Dates:** ISO-8601 UTC strings (`2026-11-05T09:30:00.000Z`). Report date params `from`/`to` are shop-local dates `YYYY-MM-DD`, both inclusive.
- **Ids:** UUID strings. A malformed id in a path or body is a `400`.
- **Pagination:** `?page=1&limit=50` (max 200). The response is `{ "data": [...], "page": 1, "limit": 50, "total": 123 }`.
- **Quantities:** integers up to 1,000,000 (`qty`, `countedQty`, `reorderLevel`). Larger values are a `400`.
- **Errors:** `{ "error": "Human readable message", "details": { ... } }`

| Status | When |
|---|---|
| 200 / 201 | OK / created |
| 204 | Deleted, no body |
| 400 | Validation failed (`details` = zod field errors) or a business rule broken |
| 401 | Missing/invalid/expired token, or bad credentials |
| 403 | Authenticated but role too low |
| 404 | Not found |
| 409 | Unique conflict (SKU, barcode, email, phone, receiptNo, with `details.field`) or an operation not allowed in the current state |
| 423 | Account locked (PIN attempts) |
| 429 | Rate limited (`POST /auth/login` and `POST /auth/pin`) |
| 500 | Server error (generic message, logged server-side) |

**Interactive docs (dev only):** Swagger UI at `/api/docs`, and the raw OpenAPI 3.1 document at `/api/openapi.json`. Neither is served when `NODE_ENV=production`. Request bodies and query parameters are generated from the same zod schemas the routes validate with (`apps/api/src/openapi.ts`), so they always match the code. This file stays the reference for behaviour and response shapes. To call protected endpoints, log in with `/auth/login` or `/auth/pin`, then paste the token into **Authorize**.

Objects below show fields. Timestamps `createdAt`/`updatedAt` are returned on all entities and omitted from the examples for brevity.

---

## 2. Health

### `GET /health` — public
`200 { "ok": true, "db": true, "version": "1.0.0" }` · `503` if the database is unreachable.

---

## 3. Auth

### `POST /auth/login` — public
Body: `{ "email": "owner@shop.com", "password": "••••••" }`
`200`
```json
{ "token": "eyJ…", "user": { "id": "…", "name": "Dara", "email": "owner@shop.com", "role": "ADMIN" } }
```
Errors: `401` invalid credentials or inactive user · `429` more than `AUTH_RATE_LIMIT` (default 10) attempts per minute per IP (shared with `/auth/pin`; `/auth/me` is not limited).

### `POST /auth/pin` — public
Body: `{ "email": "cashier@shop.com", "pin": "1234" }`
`200` same shape as login. Errors: `401` wrong PIN (increments `failedPinAttempts`) · `423 { "error": "Locked", "details": { "lockedUntil": "…" } }` on the 5th consecutive failure and on every attempt until `lockedUntil` passes (the counter restarts after a lock) · `429`. A successful PIN resets the counter.

### `GET /auth/me` — CASHIER
`200 { "id", "name", "email", "role" }`

JWT: HS256, payload `{ sub: userId, role }`, expires 12 h. The user is re-loaded on every request, so a role change or deactivation takes effect immediately (see [07](07-roles-security.md#3-authentication)).

---

## 4. Users — ADMIN

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/users` | `?active=true` | `User[]` (no hashes) |
| GET | `/users/:id` | | `User` |
| POST | `/users` | `{ name, email, role, password, pin? }` | `201 User` |
| PATCH | `/users/:id` | any of `{ name, email, role, active, password, pin, unlock: true }` | `User` |

User object: `{ "id", "name", "email", "role", "active", "hasPin": true, "lockedUntil": null }`
Rules: password ≥ 8 chars, PIN 4–6 digits. `409` on duplicate email. `400` if an admin tries to demote or deactivate themselves. `unlock: true` clears `failedPinAttempts` and `lockedUntil`. Users are never deleted.

---

## 5. Categories

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/categories` | CASHIER | | `Category[]`, each with `productCount` |
| POST | `/categories` | MANAGER | `{ name }` | `201 Category` |
| PATCH | `/categories/:id` | MANAGER | `{ name }` | `Category` |
| DELETE | `/categories/:id` | MANAGER | | `204` · `409` if products use it |

---

## 6. Products

### `GET /products` — CASHIER
Query: `search` (name/SKU/barcode, case-insensitive), `categoryId`, `active` (`true`|`false`|`all`, default `true`), `updatedSince` (ISO timestamp), `page`, `limit`.
With `updatedSince`, **inactive products are included** so the POS can remove them, and pagination still applies.

```json
{ "data": [ {
  "id": "…", "sku": "COF-250", "barcode": "8850001234567", "name": "Coffee beans 250g",
  "categoryId": "…", "price": "6.50", "cost": "4.00", "taxRate": "10.00",
  "stockQty": 24, "reorderLevel": 10, "active": true, "updatedAt": "…"
} ], "page": 1, "limit": 200, "total": 1 }
```

### `GET /products/:id` — CASHIER
`Product`. Errors: `404`.

### `POST /products` — MANAGER
Body: `{ sku, barcode?, name, categoryId?, price, cost?, taxRate?, reorderLevel?, active? }`
`201 Product` (stockQty 0). Errors: `400`, `409` duplicate SKU/barcode (`details.field`).

### `PATCH /products/:id` — MANAGER
Body: any create field. `stockQty` is **not accepted**; use inventory endpoints. `200 Product`.

---

## 7. Inventory — MANAGER

### `POST /inventory/receive`
```json
{ "note": "Supplier invoice #4411",
  "items": [ { "productId": "…", "qty": 24, "cost": "3.90" } ] }
```
`qty > 0`, and `cost` is optional (it updates `Product.cost`). In one transaction, each line writes a `RECEIVE` movement and increases `stockQty`.
`201 { "movements": [StockMovement + "stockAfter"] }`, where `stockAfter` is the product's stock right after that line.

### `POST /inventory/adjust`
`{ "productId": "…", "countedQty": 8, "note": "Monthly count" }`. `note` is required.
The server computes `qtyChange = countedQty − stockQty`. If it's 0, nothing is written and `200 { "movement": null }` is returned. Otherwise it returns `201 { "movement": StockMovement }`.

### `GET /inventory/movements`
Query: `productId`, `reason`, `from`, `to` (shop-local dates, inclusive), `page`, `limit`. Results are newest first, paginated.
Item: `{ "id", "productId", "productName", "qtyChange", "reason", "saleId", "receiptNo", "userId", "userName", "note", "createdAt" }`

---

## 8. Customers

| Method | Path | Role | Body / query | Response |
|---|---|---|---|---|
| GET | `/customers` | CASHIER | `?search=` (name/phone/email), `updatedSince`, `page`, `limit` | paginated `Customer[]`, each with `salesCount` and `totalSpent` (completed sales) |
| POST | `/customers` | CASHIER | `{ name, phone?, email?, notes? }` | `201 Customer` · `409` phone exists |
| GET | `/customers/:id` | MANAGER | | `Customer` + `{ "stats": { "salesCount", "totalSpent", "lastSaleAt" }, "recentSales": [SaleSummary] }` |
| PATCH | `/customers/:id` | MANAGER | any create field | `Customer` |
| DELETE | `/customers/:id` | MANAGER | | `204` · `409` if the customer has sales |

---

## 9. Sales

### `POST /sales` — CASHIER
Used both for live sales and for outbox replays.

```json
{
  "id": "6f1c2c5e-6f0b-4a43-9f3a-3c8b7c1b2a10",
  "receiptNo": "T1-000124",
  "deviceCode": "T1",
  "cashierId": "…",
  "customerId": null,
  "createdAt": "2026-11-05T09:30:12.000Z",
  "items": [
    { "productId": "…", "nameSnapshot": "Coffee beans 250g", "unitPrice": "6.50",
      "qty": 2, "discount": "1.00", "taxRate": "10.00" }
  ],
  "totals": { "subtotal": "13.00", "discount": "1.00", "tax": "1.20", "total": "13.20" },
  "payments": [
    { "method": "CASH", "amount": "13.20", "tendered": "20.00" }
  ]
}
```

Server processing, in order:
1. **Validate shape** (zod). `items` must have ≥ 1 entry with `qty > 0` and `0 ≤ discount ≤ unitPrice×qty`, and `payments` must have ≥ 1 entry with `amount > 0`. If invalid → `400`.
2. **Idempotency:** if a sale with this `id` exists → `200` with the stored sale (no other effect).
3. **Totals check:** run `computeTotals(items)`. If it differs from `totals` → `400 "Totals mismatch"` with both values in `details`.
4. **Payments check:** Σ `amount` must equal `total`, and every `CASH` payment with `tendered` must have `tendered ≥ amount`. Otherwise → `400`.
5. **References:** `cashierId` must be an existing user (active *or* deactivated, because offline sales may predate a deactivation), `customerId` must exist if given, and each `productId` must exist (active or not). Otherwise → `400` with the unknown ids.
6. **Write, in one transaction:** insert Sale (`syncedById` = token user, `status = COMPLETED`), SaleItems with `tax`/`lineTotal` from step 3, and Payments. For each item, write a `SALE` movement `−qty` and decrement `Product.stockQty` (no floor, so it can go negative). The insert uses `ON CONFLICT (id) DO NOTHING`, so a simultaneous duplicate falls back to step 2.
7. `201` with the full sale.

A `receiptNo` already used by **another** sale id → `409` (two tills share a device code).
Prices are **not** compared to the current catalog. The till's price is what was charged.

### `GET /sales` — CASHIER
Query: `from`, `to`, `cashierId`, `customerId`, `status`, `receiptNo`, `deviceCode`, `page`, `limit`. With `deviceCode`, results are ordered by `receiptNo` descending (a till's newest receipt first; the POS uses this at set-up to continue its counter).
A CASHIER always gets only **their own sales from today** (other filters are ignored). A MANAGER gets all.
Item (SaleSummary): `{ "id", "receiptNo", "createdAt", "cashierName", "customerName", "total", "status", "paymentMethods": ["CASH"] }`

### `GET /sales/:id` — CASHIER (own sales) / MANAGER
Full sale: the Sale fields + `items[]` + `payments[]` (with `change` computed) + `cashier { id, name }` + `syncedBy { id, name }` + `customer` + void info. A cashier asking for someone else's sale gets `404`.

### `POST /sales/:id/void` — MANAGER
Body: `{ "reason": "Wrong items rung up" }` (required).
In one transaction it sets `status = VOIDED`, `voidedById`, `voidedAt` and `voidReason`, and writes a `RETURN` movement `+qty` per item with the stock incremented.
`200` full sale. Errors: `404`, `409` already voided.

---

## 10. Reports — MANAGER
Every report takes `from` and `to` (shop-local dates, required except for low-stock and inventory-value). Days are bucketed in `Setting.timezone`, and `VOIDED` sales are excluded. Add `?format=csv` to any report for `text/csv` output (`format` accepts only `json` or `csv`).

| Path | Row shape |
|---|---|
| `GET /reports/daily` | `{ data: [{ date, salesCount, subtotal, discount, tax, total }], totals: { salesCount, subtotal, discount, tax, total } }`. CSV ends with a `TOTAL` row |
| `GET /reports/products` | `{ productId, sku, name, qty, net, tax, total, cost, margin }` sorted by `total` desc. `?categoryId=` optional |
| `GET /reports/cashiers` | `{ cashierId, name, salesCount, total, voidCount }` |
| `GET /reports/payments` | `{ method, count, amount }`, and for `CASH` also `tendered`, `change` |
| `GET /reports/low-stock` | `{ productId, sku, name, stockQty, reorderLevel }` where `stockQty ≤ reorderLevel` and the product is active, negative first |
| `GET /reports/inventory-value` | `{ items: [{ productId, sku, name, stockQty, cost, value }], totalValue }` (negative stock counts as 0) |

Other reports respond `{ data: [rows] }` (inventory-value as shown). `from` after `to` → `400`.
Margin uses the product's **current** cost (cost isn't snapshotted per sale in v1).

---

## 11. Settings

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/settings` | CASHIER | | `{ shopName, address, phone, taxId, currency, timezone, receiptFooter }` |
| PUT | `/settings` | ADMIN | full object | updated object. `timezone` must be a valid IANA name and `currency` a 3-letter code |

---

## 12. Endpoint summary

| Endpoint | Public | CASHIER | MANAGER | ADMIN |
|---|:-:|:-:|:-:|:-:|
| `GET /health` | ✓ | ✓ | ✓ | ✓ |
| `POST /auth/login`, `POST /auth/pin` | ✓ | ✓ | ✓ | ✓ |
| `GET /auth/me` | | ✓ | ✓ | ✓ |
| `GET /categories`, `GET /products`, `GET /products/:id` | | ✓ | ✓ | ✓ |
| `POST/PATCH/DELETE /categories`, `POST/PATCH /products` | | | ✓ | ✓ |
| `/inventory/*` | | | ✓ | ✓ |
| `GET /customers`, `POST /customers` | | ✓ | ✓ | ✓ |
| `GET/PATCH/DELETE /customers/:id` | | | ✓ | ✓ |
| `POST /sales`, `GET /sales`, `GET /sales/:id` | | ✓ (own) | ✓ | ✓ |
| `POST /sales/:id/void` | | | ✓ | ✓ |
| `/reports/*` | | | ✓ | ✓ |
| `GET /settings` | | ✓ | ✓ | ✓ |
| `PUT /settings`, `/users*` | | | | ✓ |
