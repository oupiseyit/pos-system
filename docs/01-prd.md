# 01 — Product Requirements Document

## 1. Problem
The shop sells from a cash box and a paper notebook. Stock counts are guesses, there are no daily totals without manual adding-up, and nobody can tell which products make money. Internet at the shop is unreliable, so a cloud-only tool would stop sales whenever the connection drops.

## 2. Goals
1. Ring up a sale quickly with a barcode scanner or product search, then take cash, card, or a mix.
2. Never lose a sale, **even when the network or server is down**.
3. Keep stock accurate automatically: sales decrement it, deliveries increment it, and every change is logged.
4. Give the owner daily, product, cashier and payment-method reports without spreadsheets.
5. Control who can do what: cashiers sell, managers manage, admins administer.

## 3. Non-goals (v1)
- Card processor integration. Cards run on the bank's standalone terminal and the POS only records them.
- More than one store or warehouse.
- Shifts and cash-drawer open/close reconciliation.
- Promotions engine, coupons, loyalty points.
- Partial returns (v1 supports voiding a whole sale).
- Email/SMS receipts and direct ESC/POS printer control.
- Accounting/e-invoicing integrations.

## 4. Users
| Persona | Role | Main jobs |
|---|---|---|
| Owner | `ADMIN` | Sets up the shop, staff and settings; reads reports |
| Shop manager | `MANAGER` | Maintains products and prices, receives stock, counts stock, voids sales, reads reports |
| Cashier | `CASHIER` | Sells, takes payment, prints receipts, adds customers |

## 5. Scope by module

### 5.1 Products
- Products have SKU (unique), optional barcode (unique), name, category, price, cost, tax rate and reorder level.
- Products are deactivated, never deleted, because past sales refer to them.
- Categories are a flat list.

### 5.2 Inventory
- Each product has one stock quantity (single store).
- Every change is a stock movement: `SALE`, `RECEIVE`, `ADJUST`, `RETURN`.
- Receiving goods: the manager enters quantities (optionally a new cost) and stock goes up.
- Stock count: the manager enters the counted quantity, and the system records the difference as `ADJUST`.
- Stock **may go negative**, because offline sales can't be refused. Negative stock shows on the low-stock report.

### 5.3 Sales
- The cart supports quantities and per-line discounts, and a customer can be attached (optional).
- Prices are entered **tax-exclusive**, and tax is calculated per line from the product's tax rate.
- A sale is recorded when it's fully paid. There are no parked or held sales in v1.
- Managers can void a completed sale with a reason, and its stock is returned.

### 5.4 Payments
- Methods: `CASH`, `CARD`, `OTHER` (e.g. bank-transfer QR).
- Split payments are supported, and the amounts must add up exactly to the total.
- For cash, the cashier enters the amount tendered, and change is shown and recorded.
- Card: the cashier runs the external terminal, then records an optional reference (last 4 digits or approval code).

### 5.5 Receipts
- The receipt prints from the browser on an 80mm thermal printer.
- It shows shop name/address/tax id, receipt number, date/time, cashier, lines, discounts, tax, total, payments, change and footer text.
- Any past sale can be reprinted. A voided sale reprints with a **VOID** banner.

### 5.6 Customers
- Customers have name, phone (unique, optional), email and notes.
- The cashier can search or create a customer during a sale.
- The back office shows each customer's purchase history.

### 5.7 Staff & roles
- Staff log in with email + password (back office) or email + PIN (POS quick login).
- There are three fixed roles: `ADMIN`, `MANAGER`, `CASHIER` (see [07-roles-security.md](07-roles-security.md)).
- Staff are deactivated, never deleted.

### 5.8 Reports
- **Daily sales:** for each day in a date range, number of sales, gross, discounts, tax and net.
- **Sales by product:** quantity and revenue per product, which also gives a top-sellers view.
- **Sales by cashier.**
- **Sales by payment method:** the end-of-day cash-up figure.
- **Low stock:** products at or below their reorder level, including negative stock.
- **Inventory value:** Σ stock × cost.
- Every report can be exported to CSV. Voided sales are excluded from every report.

### 5.9 Offline operation
- The POS app loads with no network, using the cached app shell, product catalog and settings.
- Sales made offline are stored on the device and sent automatically when the network returns.
- The screen always shows whether the POS is online or offline and how many sales are waiting to send.
- Resending a sale can never create a duplicate.

## 6. Success metrics
| Metric | Target |
|---|---|
| Time to ring up and pay a 3-item cash sale | < 30 s |
| Sales lost during network outages | 0 |
| Stock accuracy after a monthly count (adjustments ÷ units sold) | < 2 % |
| Time to produce end-of-day cash-up figure | < 1 min |

## 7. Non-functional requirements
- **Performance:** a product search or barcode lookup returns in < 100 ms from the local cache. API p95 < 300 ms on the shop server.
- **Availability:** selling continues during server or network outages, and the back office needs the server.
- **Data safety:** nightly database backup, and every sale is persisted on the device before the receipt prints.
- **Security:** role-based access enforced by the API, hashed credentials, HTTPS (see [07](07-roles-security.md)).
- **Usability:** the POS works with keyboard + barcode scanner alone and fits a 1024×768 touch screen.
- **Browsers:** current Chrome/Edge (the POS PWA target), and current Chrome/Edge/Firefox/Safari for the back office.

## 8. Assumptions
- There is one or a few till devices, each with a USB barcode scanner (keyboard wedge) and an 80mm printer set as the default printer.
- The server is a small Linux box or VPS reachable from the tills over HTTPS.
- The catalog has fewer than ~3,000 products, which is enough to cache in browser storage.
- There is a single currency and a single tax regime, with per-product tax rates.

## 9. Open questions
- Should line discounts above some percentage need manager approval? (Not in v1.)
- Are the current-price vs. sold-price differences from offline sales worth a report? (Later.)
