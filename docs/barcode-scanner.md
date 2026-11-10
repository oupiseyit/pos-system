# Barcode scanner: set up and test

This guide covers how to set up a USB or Bluetooth barcode scanner for the POS till and check that it works. It takes about 15 minutes, and you'll need the scanner's printed setup guide (the sheet of setup barcodes that came in the box).

## 1. How the POS reads a scanner

The POS has no scanner driver. It treats the scanner as a **keyboard**: the scanner "types" the barcode digits, then presses **Enter**.

- **Sell screen:** the search box at the top always has the cursor, unless a dialog is open. When Enter arrives, the POS looks for a product whose **barcode** or **SKU** matches what was typed exactly. If it finds one, it adds that product to the sale, or adds 1 more if it's already there. Code: `scan()` in [apps/pos/src/screens/Sell.tsx](../apps/pos/src/screens/Sell.tsx).
- **Unknown barcode:** a "No product matches …" message appears, the box is cleared, and the cursor stays in the box, ready for the next scan.
- **Receipts:** each receipt has a Code 128 barcode of its receipt number, for example `T1-000123`. Scanning a receipt types that number. This works in the **Recent sales** search on the POS and in the **Receipt no** filter under back office **Sales**.
- **Back office:** **Inventory → Receive** and **Count** take a scan in the product box: Enter picks the product that matches exactly. You can also scan into a product's **Barcode** field, or into the search box on the **Products** page.

So the scanner has to send exactly three things: **the digits, then Enter, and nothing else.**

## 2. Set up the scanner

Most scanners are set up by scanning setup barcodes from their guide, one after another. The names below are the usual ones; your brand's wording may differ slightly.

| Setting | Set it to | Why |
|---|---|---|
| Factory reset | Scan it first | Starts you from known settings |
| Interface | **USB HID keyboard** (sometimes called "keyboard wedge"). For Bluetooth: **HID** mode, not SPP | The POS only reads keyboard input |
| Keyboard language / country | **US English** | Other layouts can send the wrong characters |
| Suffix / terminator | **CR** or **Enter** (not Tab, not CR+LF if your scanner offers that separately) | Enter is what makes the POS add the product |
| Prefix, AIM ID, code ID | **Off** | Any extra character breaks the exact match |
| Symbologies | **EAN-13, EAN-8, UPC-A, UPC-E, Code 128** on | EAN/UPC are on shop packaging. Code 128 is on our receipts |
| Transmit check digit | **On** (for EAN and UPC) | The stored barcode includes the last digit |
| UPC-A → EAN-13 conversion | Pick one and stick to it (see §5) | `036000291452` and `0036000291452` count as different barcodes |
| Read mode | **Trigger** (press to scan). If you use a stand that scans automatically, turn on a **same-code delay** of at least 1 s | Stops one item being added twice |
| Beep | On | Tells the cashier the scan worked |

**Bluetooth:** pair it in the computer's Bluetooth settings like a keyboard. If it has a "batch" or "inventory" mode that stores scans and sends them later, turn that off.

## 3. Set up the till computer

- **Keyboard layout:** keep the computer on **English (US)** while selling. If the till is set to a Khmer (or other) keyboard, the scanner's characters can come out wrong. Remove the extra layout from the till, or make sure it's switched back to English before each shift.
- **Caps Lock:** leave it off. Some scanners send the letters in a Code 128 receipt number in the wrong case when Caps Lock is on.
- **Plug it straight in:** use a USB port on the computer itself, not a hub without its own power.

## 4. Test it

### Step 1: outside the POS (1 minute)

Open a plain text editor: Notepad, TextEdit (in plain-text mode) or gedit. Scan any product you have at hand.

You should see **exactly the numbers printed under the barcode, and the cursor moves to a new line**. Then check against this table:

| You see | Fix |
|---|---|
| Nothing at all | Wrong interface mode (§2), or it isn't paired or plugged in |
| Digits, but the cursor stays on the same line | No Enter suffix: set suffix = CR/Enter |
| The cursor jumps to the next field instead of a new line | The suffix is Tab: change it to CR/Enter |
| Extra characters before the digits (for example `]E0`) | Turn off prefix, AIM ID or code ID |
| One digit fewer than printed | Turn on "transmit check digit" |
| Symbols or letters instead of digits | Keyboard language: set the scanner to US English and the till to English (US) |
| The same code twice | Read mode: use trigger mode, or a same-code delay |

Don't move on until this test is clean.

### Step 2: in the POS

Use the local dev stack (README, Option A or B), or the real server.

1. **Add a test product with a barcode you can scan.** The seed products have made-up barcodes, so use a real item instead, such as a bottle of water.
   - Back office → **Products → New product**.
   - Click in **Barcode** and scan the item. The digits fill in.
   - Fill in SKU, name and price, then save.
   - Alternatively, edit a seeded product such as "Water 500ml" and scan your item into its Barcode field.
2. **Get the product onto the till.** On the POS, open **Menu → Sync now**, or wait up to 5 minutes.
3. **Run the checks** below on the sell screen, signed in with cashier PIN `1234` in dev.

| # | Do this | Expect |
|---|---|---|
| 1 | Scan the item once | It's added to the sale with qty 1, and you hear a beep |
| 2 | Scan it again | The same line goes to qty 2. No second line appears |
| 3 | Scan an item that isn't in the system | "No product matches …", and the box is empty and keeps the cursor |
| 4 | Scan again right after test 3, without touching anything | It works: the cursor never left the box |
| 5 | Click a product tile, then scan | It works: the box takes the cursor back |
| 6 | Open **Pay**, click into the cash box and scan by mistake | The POS refuses it: "That amount is too large…". No sale is made |
| 7 | Close Pay. Press **F2** (or the **Scan** button) and scan | It's added. F2 always puts the cursor back in the scan box |
| 8 | Finish a cash sale and let the receipt print | The receipt has a barcode under the totals |
| 9 | Open **Recent sales**, click in the search box and scan that receipt | The search shows that receipt number and finds the sale |
| 10 | Back office → **Sales**, scan the receipt into **Receipt no** | Finds the same sale |
| 11 | Back office → **Inventory → Receive**, click the product box, scan the item, press nothing else | The product is picked |

Tests 1–3 are the scanner line in the manual release checklist ([08 §5](08-testing-strategy.md)). Tick it there once they pass on the real till.

## 5. Common problems

| Problem | Cause and fix |
|---|---|
| Works in Notepad, but the POS says "No product matches" for a known item | The barcode saved in the back office differs from what the scanner sends. Most often it's a UPC-A item stored with 12 digits while the scanner sends 13 (an extra leading `0`), or the other way round. Rescan the item into the product's **Barcode** field, so both use the same form. |
| A product added in the back office isn't found on the till | The till hasn't synced yet. Use **Sync now**, or wait 5 minutes. |
| Scans go nowhere after a dialog closes | Press **F2**. If it happens often, note which dialog it was and report it. The scan box is meant to get the cursor back after every dialog. |
| Receipt numbers scan as `t1-000123` or with odd symbols | Caps Lock is on, or the keyboard layout is wrong (§3). POS Recent sales ignores case, but the back office **Receipt no** filter needs an exact match, so fix the cause. |
| The receipt barcode won't scan | Code 128 is turned off on the scanner (§2), or the print is too faint: check the printer's darkness setting and the paper. |
| The first scan after a break is lost | The scanner went to sleep. Turn off auto-sleep, or lengthen it, in its guide. |
