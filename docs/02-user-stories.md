# 02 — User Stories

Format: **ID** · As a *role*, I want … so that … · acceptance criteria (Given/When/Then) · release tag.
Roles: `CASHIER`, `MANAGER`, `ADMIN`. A higher role can do everything a lower role can.

---

## Authentication

**AUTH-1 — Back office login** · As a manager, I want to log in with email and password so that only staff can reach the back office. `v1`
- Given an active user with a correct password, when they submit the login form, then they land on the dashboard.
- Given a wrong password, then "Invalid email or password" shows, without saying which field was wrong.
- Given a deactivated user, then login is refused.

**AUTH-2 — POS PIN login** · As a cashier, I want to tap my name and enter a PIN so that I can start selling in seconds. `v1`
- Given I've logged in on this device before, then my name shows as a quick-pick button.
- Given I'm new on this device, then I can type my email once.
- Given 5 wrong PINs in a row, then my account is locked for 15 minutes and the screen says so.

**AUTH-3 — Logout** · As a cashier, I want to log out so that the next cashier's sales aren't recorded under my name. `v1`
- When I log out, then the token is removed and the PIN screen shows. Unsent sales stay in the outbox.

---

## Products

**PROD-1 — Create product** · As a manager, I want to add a product with SKU, barcode, name, category, price, cost, tax rate and reorder level so that it can be sold. `v1`
- Given a duplicate SKU or barcode, then save fails with a message naming the field.
- New products start with stock 0, and stock is added via receiving (INV-1).

**PROD-2 — Edit product** · As a manager, I want to change price and details so that the POS sells at the right price. `v1`
- When I save, then POS devices pick up the change on their next catalog sync (≤ 5 min while online).
- Stock can't be edited here.

**PROD-3 — Deactivate product** · As a manager, I want to hide a product I no longer sell without losing its sales history. `v1`
- Inactive products don't appear in POS search but still appear in reports and past sales.

**PROD-4 — Categories** · As a manager, I want to group products into categories so that the POS grid and reports are organised. `v1`
- A category that still has products can't be deleted.

**PROD-5 — Find product** · As a manager, I want to search products by name, SKU or barcode and filter by category or active status. `v1`

---

## Inventory

**INV-1 — Receive stock** · As a manager, I want to record a delivery (several products at once, optionally with new cost) so that stock is correct. `v1`
- When saved, then each product's stock increases and one `RECEIVE` movement per line is recorded with my user id.
- If a new cost is entered, then the product's cost is updated.

**INV-2 — Stock count** · As a manager, I want to enter the counted quantity of a product so that the system matches the shelf. `v1`
- When I enter counted qty 8 and the system had 10, then an `ADJUST` movement of −2 with my note is recorded and stock becomes 8.
- A note is required.

**INV-3 — Movement history** · As a manager, I want to see every stock change for a product (who, when, why) so that I can investigate discrepancies. `v1`

**INV-4 — Low stock alert** · As a manager, I want to see products at or below their reorder level so that I can reorder in time. `v1`
- Negative stock is listed first and highlighted.
- The dashboard shows the count of low-stock products.

---

## Sales (POS)

**SALE-1 — Scan to cart** · As a cashier, I want to scan a barcode and have the product added so that checkout is fast. `v1`
- Scanning the same product again increments its quantity.
- If the barcode is unknown, then a non-blocking "Not found: 123…" message shows and the input stays focused.

**SALE-2 — Search to cart** · As a cashier, I want to search by name or browse by category so that I can sell items without barcodes. `v1`

**SALE-3 — Edit cart** · As a cashier, I want to change quantity, remove a line, or give a line discount (amount or %) so that the bill is right. `v1`
- A discount can't exceed the line amount.
- Totals (subtotal, discount, tax, total) update immediately.

**SALE-4 — Attach customer** · As a cashier, I want to search or quickly create a customer and attach them to the sale so that their purchase history is kept. `v1`
- Creating a customer needs only a name, and phone is optional but unique.
- Offline: I can attach customers from the cache, but creating a new customer is disabled.

**SALE-5 — Cash payment** · As a cashier, I want to enter the cash tendered and see the change so that I give correct change. `v1`
- Quick-amount buttons (exact, next round amounts) are offered.
- I can't complete the payment if tendered < amount due.

**SALE-6 — Card payment** · As a cashier, I want to record a card payment after the terminal approves it, with an optional reference. `v1`

**SALE-7 — Split payment** · As a cashier, I want to take part cash and part card so that customers can pay how they like. `v1`
- The sale completes only when payments add up exactly to the total.

**SALE-8 — Print receipt** · As a cashier, I want a receipt to print automatically after payment so that the customer gets proof of purchase. `v1`
- The print dialog opens on completion, and "New sale" clears the cart.

**SALE-9 — Reprint** · As a cashier, I want to find a recent sale by receipt number and reprint it. `v1`
- Cashiers see their own sales from today, and managers see all.

**SALE-10 — Void sale** · As a manager, I want to void a completed sale with a reason so that mistakes don't count in reports and stock returns. `v1`
- A voided sale writes `RETURN` movements, is excluded from reports, and reprints with a VOID banner.
- A sale can be voided only once.

**SALE-11 — Partial return** · As a manager, I want to refund some items of a sale. `later`

---

## Offline

**OFF-1 — Sell offline** · As a cashier, I want to keep selling when the network is down so that customers aren't turned away. `v1`
- Given the device has been online at least once, when the network drops, then search, cart, payment and receipt all work.
- The header shows **Offline · N pending**.

**OFF-2 — Automatic sync** · As a cashier, I want offline sales to upload by themselves when the network returns, without me doing anything. `v1`
- Pending sales are sent oldest-first within 30 s of reconnecting, and the badge counts down to 0.
- If the server rejects a sale (e.g. validation error), then it stays in the outbox flagged **Needs attention** and a manager is told to check it. Nothing is silently dropped.

**OFF-3 — No duplicates** · As the owner, I want a sale that's sent twice to be recorded once so that reports and stock stay correct. `v1`

**OFF-4 — Reload while offline** · As a cashier, I want the POS to open even if the browser was closed during an outage. `v1`

---

## Customers

**CUST-1 — Manage customers** · As a manager, I want to view, edit and delete customers. `v1`
- A customer with sales can't be deleted, but their details can be edited.

**CUST-2 — Purchase history** · As a manager, I want to see a customer's past sales and total spend. `v1`

---

## Staff

**STAFF-1 — Add staff** · As an admin, I want to add a staff member with name, email, role, password and PIN. `v1`

**STAFF-2 — Change role / deactivate** · As an admin, I want to change a user's role or deactivate them so that ex-staff can't log in. `v1`
- An admin can't deactivate or demote themselves, so there is always at least one active admin.

**STAFF-3 — Reset PIN/password** · As an admin, I want to reset a forgotten PIN or password and unlock a locked account. `v1`

---

## Reports

**REP-1 — Daily sales** · As a manager, I want totals per day for a date range (count, gross, discount, tax, net). `v1`

**REP-2 — Sales by product** · As a manager, I want quantity and revenue per product for a date range, sortable, so that I know best and worst sellers. `v1`

**REP-3 — Sales by cashier** · As a manager, I want sales count and total per cashier. `v1`

**REP-4 — Cash-up** · As a manager, I want today's totals by payment method so that I can count the cash drawer against the expected cash. `v1`

**REP-5 — Inventory value** · As the owner, I want the total stock value at cost. `v1`

**REP-6 — CSV export** · As a manager, I want to export any report table to CSV so that I can share it with my accountant. `v1`

---

## Settings

**SET-1 — Shop details** · As an admin, I want to set shop name, address, phone, tax id, currency, timezone and receipt footer so that receipts and reports are correct. `v1`

**SET-2 — Device code** · As a manager, I want to set a device code (e.g. `T1`) on each till the first time it's set up so that receipt numbers are unique per till. `v1`
