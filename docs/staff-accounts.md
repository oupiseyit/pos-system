# Creating managers and cashiers

Only an **Admin** can add or change staff. Managers and cashiers can't open the Staff page.

## What each role can do

| Role | Back office | POS |
|---|---|---|
| Cashier | No access | Sell, see own sales today, search and add customers |
| Manager | Products, inventory, all sales, voids, reports | Everything a cashier can do, plus set up a till |
| Admin | Everything above, plus **Staff** and **Settings** | Same as Manager |

Full matrix: [07-roles-security.md](07-roles-security.md).

## Add a staff member (back office)

1. Sign in to the back office as an Admin:
   - local: http://localhost:5174
   - production: `https://<your-domain>/admin/`
2. Open **Staff** in the menu (`#/staff`).
3. Click **Add staff**.
4. Fill in the form:

   | Field | What to enter |
   |---|---|
   | Name | Shown on the POS and on receipts |
   | Email | Their username. Must be unique |
   | Role | **Cashier** or **Manager** |
   | Password | At least 8 characters. Used to sign in to the back office |
   | PIN | 4–6 digits. Used to sign in on the POS. **Without a PIN they can't use the POS** |
   | Active | Leave it on |

5. Click **Add staff**. The new person appears in the list, and **PIN set** shows ✓ if you gave them a PIN.

Give the person their email, password and PIN in private. The app doesn't send them anything.

> A cashier gets a password too, because the form requires one, but cashiers can't use the back office. They only need the PIN.

## First sign-in on the POS

The till only lists people who have signed in on it before. For someone new:

1. On the PIN screen, tap **Other user**.
2. Enter their email and PIN.
3. From then on, their name shows on that till, so they just tap it and enter the PIN.

To set up a brand-new till, sign in on its first-run screen with a **Manager** or **Admin** email and PIN. A cashier can't do this.

## Change or remove staff

Open the person from the **Staff** list and edit them.

| To… | Do this |
|---|---|
| Change role or name | Edit the field, then **Save changes** |
| Reset a forgotten password | **Set new password** → enter it → **Save changes** |
| Reset a forgotten PIN | **Set new PIN** → enter it → **Save changes** |
| Unlock after 5 wrong PINs | Click **Unlock** on the red note. Otherwise the lock lifts by itself after 15 minutes |
| Remove someone who left | Switch **Active** off → **Save changes** |

Staff are never deleted, because their past sales still point to them. An inactive user can't sign in anywhere, and any session they already have stops working.

You can't change your own role or deactivate yourself. Another Admin has to do it.

## Using the API instead

Same rules, Admin token required (see "Using the API with Swagger" in the [README](../README.md)).

```http
POST /api/users
Authorization: Bearer <admin token>
Content-Type: application/json

{ "name": "Dara", "email": "dara@shop.com", "role": "CASHIER", "password": "at-least-8", "pin": "4821" }
```

- `role` is `CASHIER`, `MANAGER` or `ADMIN`. `pin` is optional but needed for the POS.
- Edit with `PATCH /api/users/{id}` and any of `name`, `email`, `role`, `password`, `pin`, `active`, or `"unlock": true`.
- A duplicate email returns `409`, and bad input returns `400` with the problem per field.

## Dev accounts

`npm run db:seed` already creates `manager@shop.local` and `cashier@shop.local` with PIN `1234`. See **Logins** in the [README](../README.md#logins-local-dev).
