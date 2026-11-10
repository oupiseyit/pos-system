# 06 — UI Screens

Two apps:
- **POS** (`/`): cashier app. It targets a 1024×768+ touch screen, keyboard and barcode scanner, and works offline.
- **Back office** (`/admin`): manager app. It's desktop-first and usable on a tablet, and needs the server.

General rules: money is shown in the shop currency with 2 decimals. All tables have empty states ("No products yet — Add product"). Destructive actions ask for confirmation. Errors from the API show as a toast with the `error` message. Every interactive element is keyboard-reachable with visible focus, and form fields have labels.

---

## Part A — POS

### A1. Device setup (first run only)
Shown when no device code is stored. A manager enters it once.
```
┌──────────────────────────────────────┐
│  Set up this till                    │
│  Device code  [ T1   ]  (2–4 chars)  │
│  Manager email [            ]        │
│  Manager PIN   [ ••••  ]             │
│                     [ Save ]         │
└──────────────────────────────────────┘
```
The manager credentials are checked via `POST /auth/pin` (role must be ≥ MANAGER). The screen then stores `deviceCode`, sets the receipt counter to 0 and goes to A2.

### A2. PIN login
```
┌──────────────────────────────────────────────┐
│  My Shop                 ● Online · 0 pending│
│                                              │
│   [ Sokha ]  [ Dara ]  [ + Other user ]      │
│                                              │
│        PIN  [ • • • •   ]                    │
│        ┌───┬───┬───┐                         │
│        │ 1 │ 2 │ 3 │                         │
│        │ 4 │ 5 │ 6 │                         │
│        │ 7 │ 8 │ 9 │                         │
│        │ ⌫ │ 0 │ ✓ │                         │
│        └───┴───┴───┘                         │
└──────────────────────────────────────────────┘
```
- The user buttons are the emails that have logged in on this device before (stored locally). "Other user" asks for an email.
- Messages: "Wrong PIN (3 tries left)" and "Locked until 14:32".
- **Offline:** if a cashier is still logged in, the sell screen opens. Otherwise the screen shows "Login needs a connection" and sales can't start.

### A3. Sell screen (main)
```
┌────────────────────────────────────────────────────────────────────────┐
│ My Shop · T1  Sokha          ○ Offline · 2 pending   16:30   [Menu ▾] │
├──────────────────────────────────────────┬─────────────────────────────┤
│ [ Search products or scan…     ] [▥ Scan]│ Current sale     T1-000125  │
│ [All 48] [Drinks 14] [Snacks 9] …        │─────────────────────────────│
│ ┌────────┐┌────────┐┌────────┐┌────────┐ │ ☕ Coffee beans 250g        │
│ │☕ 4 left││🍶38 left││🍶212 lft││▢  Out  │ │   6.50 each (–) 2 (+) 13.00│
│ │Coffee  ││Tea     ││Water   ││Chips   │ │                       −1.00│
│ │ 6.50   ││ 3.20   ││ 0.50   ││ 1.20   │ │ 🍶 Water 500ml              │
│ └────────┘└────────┘└────────┘└────────┘ │   0.50 each (–) 6 (+)  3.00│
│                                          │─────────────────────────────│
│                                          │ [% Discount] [👤 Customer F4]│
│                                          │ Subtotal            16.00   │
│                                          │ Discount            −1.00   │
│                                          │ Tax                  1.50   │
│                                          │ TOTAL               16.50   │
│                                          │ [ Clear ]   [  PAY 16.50  ] │
└──────────────────────────────────────────┴─────────────────────────────┘
```
- The **scan/search input always has focus** unless a dialog is open. When a scanner sends Enter after an exact barcode or SKU match, that product is added (or its qty incremented). Otherwise, typing filters the grid. The **Scan** button just puts focus back in the box (same as `F2`).
- Tiles show a **category icon** (picked from the category name: coffee → cup, tea → leaf, bakery/cake/bread → bread, drinks/water/juice → bottle, anything else → box), the stock as **"N left"** (amber at or below the reorder level, red **"Out"** at 0 or less) and the price.
- Tapping a tile adds 1. The cart header shows **"Current sale"** and the receipt number this sale will get (the next device counter value; it's only claimed when the sale completes).
- Each cart line has an icon, name, unit price, round **− / +** buttons (− at qty 1 removes the line) and the line amount with any discount under it. Tapping a line **selects** it (highlighted) and opens the line editor: qty stepper, discount (amount or %), remove. The last line added or touched is selected.
- **Discount** opens the line editor for the selected line (disabled with an empty cart). **Customer** opens A4 (`F4`); when a customer is attached the button shows their name and the dialog lets you remove them.
- Keyboard: `F2` focuses search, `F4` opens customer, `F9` or `Ctrl+Enter` pays, `Esc` closes dialogs.
- Header: shop-local clock (`HH:MM`) and the connection badge: `● Online · 0 pending` (green), `○ Offline · N pending` (amber), `⚠ N need attention` (red, taps to a list).
- Menu: Recent sales, Sync now, Lock (back to PIN), Logout.
- Validation: discount ≤ line amount, qty ≥ 1, and PAY is disabled when the cart is empty.

### A4. Customer dialog
Search by name or phone over the cached customers, and tap one to attach it. "New customer" has a name (required), phone and email. **Offline:** the "New customer" button is disabled with the hint "Needs connection".

### A5. Pay dialog
```
┌──────────────────────────────────────────┐
│ Amount due                     16.50     │
│ [ Cash ] [ Card ] [ Other ]              │
│──────────────────────────────────────────│
│ Cash tendered  [ 20.00 ]                 │
│ [Exact] [17] [20] [50] [100]             │
│ Change                          3.50     │
│──────────────────────────────────────────│
│ Payments:  (none yet)                    │
│ Remaining                      16.50     │
│               [ Cancel ]  [ Complete ]   │
└──────────────────────────────────────────┘
```
- **Single payment:** choose a method, then Complete.
- **Split:** enter a partial amount and press "Add payment", and the payment list and Remaining update. Complete is enabled only when Remaining = 0.
- **Card / Other:** the amount defaults to remaining, and there's an optional reference field. Hint: "Run the card on the terminal first."
- Cash: tendered must be ≥ the amount. Quick buttons are exact, the next whole unit, and common notes.
- **Complete:** builds the sale (UUID, receiptNo, totals), saves it to the outbox, opens A6 and triggers sync in the background.

### A6. Sale complete: receipt print-out
After Complete, the receipt **slides down over the cart** like a slip coming out of the printer, on top of the dimmed sell screen, and `window.print()` runs automatically (once). Beside it: **Sale complete**, the change due, the receipt number and payments, then **New sale** (Enter) and **Print again**.

The receipt is one shared design (`<Receipt>` in `apps/backoffice/src/receipt.tsx`) used here, in A7, in the back-office reprint (B6) and in the Settings preview (B10). It prints at 80mm (`@media print { @page { size: 80mm auto; margin: 0 } }`); on screen it has a torn-paper bottom edge.
```
                 (M)
               My Shop
       12 Street 271, Phnom Penh
     Tel 012 345 678 · VAT 1234567
- - - - - - - - - - - - - - - - - - - - -
T1-000124                05/11/2026 16:30
Cashier                             Sokha
Customer                        Chan Dara
- - - - - - - - - - - - - - - - - - - - -
2 × Coffee beans 250g               13.00
    6.50 each            discount -1.00
6 × Water 500ml                      3.00
    0.50 each
- - - - - - - - - - - - - - - - - - - - -
Subtotal                            16.00
Discount                            -1.00
Tax                                  1.50
TOTAL                              $16.50
Cash                                20.00
Change                               3.50
- - - - - - - - - - - - - - - - - - - - -
        ║▌║█║▌│║▌║█│║▌║║█║▌│║
              T1-000124
        Thank you! Come again
```
- One line per item (`qty × name`, amount); a second line shows the unit price when qty > 1 and that line's discount, if any. The totals show one **Discount** line (the sum of line discounts) only when there is one.
- **TOTAL** is in the shop currency (`$16.50` for USD).
- The barcode is a real **Code 128** of the receipt number, so scanning a receipt types its number (e.g. into A7 or the back-office Sales search).
- A voided sale prints a boxed `*** VOID ***` under the header, with the void date and reason.

### A7. Recent sales
A list of today's sales on this till: receipt no, time, total, status, plus a "pending" tag for unsynced entries (shown from the outbox). Tap a sale to open its receipt and reprint it. There's a search box for receipt number. Managers see all cashiers' sales and a **Void** button (online only). Void needs a reason.

### A8. Needs attention list
Outbox entries the server rejected with a 4xx. Each shows the receipt no, total and server error. Actions: **Retry** and **Show details**. A manager can **Discard** after confirming, which is logged to the console and needs a typed reason. Nothing is ever discarded automatically.

---

## Part B — Back office

**Design:** build every back-office screen to match its mockup in `mockups/v2/` (`b1-login.html` … `b10-settings.html`), reusing the tokens, fonts and components from `mockups/v2/styles.css`. `mockups/v1` is archived; don't use it. The ASCII sketches below show content and behaviour; the v2 mockups win on look and layout.

Layout: a left nav (items hidden by role) and a top bar with the user name and logout.
```
┌────────────┬───────────────────────────────────────────────┐
│ My Shop    │ Dashboard                          Dara ▾     │
│            ├───────────────────────────────────────────────┤
│ Dashboard  │ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ Products   │ │Today     │ │Sales     │ │Low stock │        │
│ Categories │ │ 1,240.50 │ │ 86       │ │ 7  →     │        │
│ Inventory  │ └──────────┘ └──────────┘ └──────────┘        │
│ Sales      │ Last 7 days (bar chart, total per day)   │
│ Customers  │ Top products today (table, 5 rows)            │
│ Reports    │ Payment methods today (cash / card / other)   │
│ Staff  *   │                                               │
│ Settings * │                                               │
└────────────┴───────────────────────────────────────────────┘
 * ADMIN only
```

### B1. Login
Email, password and Sign in, with the generic error "Invalid email or password". A CASHIER who logs in sees "The back office is for managers. Use the POS."

### B2. Dashboard — MANAGER
KPI tiles for today's net sales, number of sales and low-stock count (linking to the report), a 7-day chart, top 5 products today and today's payment split. Data comes from `/reports/daily`, `/reports/products`, `/reports/payments` and `/reports/low-stock`.

### B3. Products — MANAGER
- **List:** search, a category filter, an Active/Inactive/All filter, and columns SKU, Name, Category, Price, Stock (red if ≤ reorder, bold red if negative), Active. Clicking a row opens the edit form.
- **Form:** SKU*, Barcode, Name*, Category (select), Price*, Cost, Tax rate % (e.g. 10.00), Reorder level and Active. Stock is shown read-only, with links to "Receive stock" and "Count stock". A field-level error shows on a 409 duplicate.

### B4. Categories — MANAGER
An inline-editable list of names, with an add row. Delete is disabled with a tooltip when products use the category.

### B5. Inventory — MANAGER
Three tabs:
- **Receive:** a note, then rows of [product picker (search/scan)] [qty] [new cost (optional)], with add row and Save. After saving, it shows a summary of the new stock levels.
- **Count:** pick a product to see its current stock, then enter the counted qty and a note* (required). Save shows the computed adjustment before confirming ("This will record −2").
- **Movements:** filters for product, reason and date range, and a table of Date, Product, Change (+green/−red), Reason, Receipt no (a link), User and Note.

### B6. Sales — MANAGER
- **List:** filters for date range, cashier, customer, status and receipt no. Columns: Receipt, Date, Cashier, Customer, Payment, Total, Status.
- **Detail:** header info, items, payments, and a sync note ("Synced 16:45 by Dara" when `syncedAt` − `createdAt` is more than 1 min, so offline sales are visible). Actions: **Reprint** (opens the 80mm receipt) and **Void** (reason dialog, hidden if already voided).

### B7. Customers — MANAGER
- **List:** search, then Name, Phone, Email, Sales count and Total spent.
- **Detail:** an editable form, stats and recent sales (linking to B6). Delete is disabled if the customer has sales.

### B8. Reports — MANAGER
A report selector (Daily, Products, Cashiers, Payments, Low stock, Inventory value) and a date range picker with presets (Today, Yesterday, This week, This month, Custom; native `<input type="date">`). The result shows as a sortable table with a totals row, and there's an **Export CSV** button (`?format=csv`). Payments shows the expected cash for cash-up.

### B9. Staff — ADMIN
- **List:** Name, Email, Role, Active, PIN set, Locked.
- **Form:** name, email, role (select), password (create, or "Set new password"), PIN (create, or "Set new PIN"), Active, and an **Unlock** button when the account is locked. Demoting or deactivating yourself is disabled.

### B10. Settings — ADMIN
Shop name, address, phone, tax id, currency (select of ISO codes), timezone (select of IANA zones) and receipt footer (textarea), with a live 80mm receipt preview beside the form.

---

## States checklist (every screen)
| State | Behaviour |
|---|---|
| Loading | Skeleton rows or a spinner after 300 ms (no flash) |
| Empty | A short message + primary action |
| Error | A toast with the API message, and the form keeps the user's input |
| 401 | Back to login (back office) or the PIN screen (POS), keeping the current URL |
| 403 | "You don't have access to this" page |
| Offline (POS) | Amber badge, server-only actions disabled with a "Needs connection" hint |
