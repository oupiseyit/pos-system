# pos-system

A point-of-sale system for one small shop. Cashiers sell from a browser POS that keeps working offline. Managers run the shop from a back office covering products, inventory, customers, staff and reports.

**Stack:** PostgreSQL · Prisma · Node.js + Express + TypeScript · React (back office + cashier POS) · Docker Compose · Linux server

## Repo layout
```
apps/api          Express + Prisma API
apps/backoffice   React back office (/admin)
apps/pos          React cashier POS (PWA, offline)
docs/             Documentation
```

## Setup (local dev)

Requires Docker Desktop and Node.js 22+.

```bash
cp .env.example .env    # then change the change-me values
npm install             # host deps: editor, lint, tests, prisma CLI
```

### Option A: everything in Docker
```bash
docker compose up -d    # postgres, adminer, api, back-office, web-front
docker compose ps       # wait until all are "healthy" (first start ~1-2 min: npm install in the container)
npm run db:migrate      # create tables (runs on the host against localhost:5432)
npm run db:seed         # admin from .env + dev data (cashier PIN 1234)
```

| Service | URL |
|---|---|
| API | http://localhost:3000/api/health |
| API docs (Swagger UI, dev only) | http://localhost:3000/api/docs |
| POS (web-front) | http://localhost:5173 |
| Back office | http://localhost:5174 |
| Adminer (DB UI) | http://localhost:8080 (server `postgres`, user/password/db from `.env`) |

Source is mounted into the containers, so code changes hot-reload. There are no images to build.

### Option B: only Postgres in Docker, apps on the host
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev             # api :3000 · pos :5173 · backoffice :5174
```
Don't run this alongside Option A: they use the same ports.

## Routes

### Apps (local dev)

| App | URL | Sign in with |
|---|---|---|
| POS (cashier) | http://localhost:5173 | First run: set up the till (device code, e.g. `T1`), then cashier/manager PIN `1234` |
| Back office | http://localhost:5174 | Admin `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`, or `manager@shop.local` with the same password |
| API | http://localhost:3000/api | Bearer token from `/api/auth/login` or `/api/auth/pin` |
| API docs (dev only) | http://localhost:3000/api/docs | — |
| Adminer (DB UI) | http://localhost:8080 | user/password/db from `.env` |

Both Vite dev servers proxy `/api` to the API, so http://localhost:5174/api/health works too.

### Back office pages

Hash routes, so they work as plain links (e.g. http://localhost:5174/#/products).

| Page | Route | Role |
|---|---|---|
| Dashboard | `#/` | Manager |
| Products | `#/products` · `#/products/new` · `#/products/{id}` | Manager |
| Categories | `#/categories` | Manager |
| Inventory | `#/inventory/receive` · `#/inventory/count` · `#/inventory/movements` | Manager |
| Sales | `#/sales` · `#/sales/{id}` (receipt, void) | Manager |
| Customers | `#/customers` · `#/customers/new` · `#/customers/{id}` | Manager |
| Reports | `#/reports/{daily, products, cashiers, payments, low-stock, inventory-value}` | Manager |
| Staff | `#/staff` · `#/staff/new` · `#/staff/{id}` | Admin |
| Settings | `#/settings` (shop name, timezone, receipt) | Admin |

The POS has no URLs: it's one screen (sell → pay → receipt) with dialogs, and **Recent sales** / **Needs attention** opened from its header.

### Production (one container, see [09](docs/09-deployment.md))

| What | Path |
|---|---|
| POS | `https://<your-domain>/` |
| Back office | `https://<your-domain>/admin/` |
| API | `https://<your-domain>/api` (no `/api/docs` in production) |

### E2E test stack (`npm run e2e`)

Runs on its own ports and `pos_e2e` database, so it never touches dev data: API :3100 · POS :5183 · back office :5184.

## Using the API with Swagger

Swagger UI lets you call every API endpoint from the browser. It's available in dev only and is turned off when `NODE_ENV=production`.

**1. Open it.** With the stack running and seeded (Option A or B above), go to http://localhost:3000/api/docs. The back-office proxy works too: http://localhost:5174/api/docs.

**2. Get a token.** Open **Auth → `POST /auth/pin`**, click **Try it out**, enter a body and click **Execute**:

```json
{ "email": "manager@shop.local", "pin": "1234" }
```

Copy the `token` value from the response. Pick the login that matches what you want to test:

| Login | Endpoint | Body | Can use |
|---|---|---|---|
| Cashier | `POST /auth/pin` | `{ "email": "cashier@shop.local", "pin": "1234" }` | selling, own sales today, customers search/create |
| Manager | `POST /auth/pin` | `{ "email": "manager@shop.local", "pin": "1234" }` | + products, inventory, all sales, voids, reports |
| Admin | `POST /auth/login` | `{ "email": "<SEED_ADMIN_EMAIL>", "password": "<SEED_ADMIN_PASSWORD>" }` from `.env` | + users and settings |

**3. Authorize.** Click **Authorize** (top right), paste the token on its own without the word `Bearer`, then click **Authorize** and **Close**. Every request now carries the token. Each endpoint's description shows its minimum role. Calling one above your role returns `403`.

**4. Call endpoints.** Open one, click **Try it out**, fill in parameters or the body, then **Execute**. Some useful first calls:
- `GET /auth/me`: check who you're logged in as. Its `id` is the `cashierId` for a sale.
- `GET /products`: product ids, prices and tax rates.
- `GET /reports/daily?from=2026-11-01&to=2026-11-30`: add `format=csv` to get a CSV download.

**Example: record a sale.** Two "Water 500ml" from the seed (0.50 each, 10 % tax). Use the product's `id` from `GET /products`, your own id from `GET /auth/me`, and a new UUID for `id` (run `node -e "console.log(crypto.randomUUID())"`):

```json
{
  "id": "<new uuid>",
  "receiptNo": "T1-000001",
  "deviceCode": "T1",
  "cashierId": "<your user id>",
  "createdAt": "2026-11-10T09:30:00.000Z",
  "items": [
    { "productId": "<Water 500ml id>", "nameSnapshot": "Water 500ml", "unitPrice": "0.50", "qty": 2, "discount": "0.00", "taxRate": "10.00" }
  ],
  "totals": { "subtotal": "1.00", "discount": "0.00", "tax": "0.10", "total": "1.10" },
  "payments": [{ "method": "CASH", "amount": "1.10", "tendered": "2.00" }]
}
```

The first execute returns `201`. Running it again with the same `id` returns `200` and changes nothing (the duplicate check). Running it with a new `id` but the same `receiptNo` returns `409`.

**Things that commonly trip people up:**
- **Money is always a string** (`"6.50"`), never a number. A number returns `400`.
- **`totals` must match the server's maths**, which rounds tax per line, half-up. If it doesn't, the `400 Totals mismatch` response shows the expected values in `details`. Payments must add up exactly to `total`.
- **Errors** look like `{ "error": "...", "details": { ... } }`. For validation errors, `details` lists the problem per field.
- **`401`** means the token is missing or expired (tokens last 12 h), or the user was deactivated. Log in again and re-authorize.
- **`429`** means more than 10 login/PIN attempts in a minute. Wait a minute.
- **`423 Locked`** means 5 wrong PINs locked the account for 15 min. An admin can unlock it with `PATCH /users/{id}` and `{ "unlock": true }`.
- Swagger calls hit your real **dev** database. Reset it with `npm run db:reset`.

The raw OpenAPI 3.1 document is at http://localhost:3000/api/openapi.json, and you can import it into Postman or Insomnia. Request bodies and parameters are generated from the same zod schemas the API validates with, so they always match the code. Response shapes and business rules are in [05-api-spec.md](docs/05-api-spec.md).

## Rebuilding Docker

| When | Command |
|---|---|
| Restart after editing `.env` or `docker-compose.yml` | `docker compose up -d --force-recreate` |
| Added/changed npm dependencies | `docker compose down && docker volume rm pos-system_node_modules && docker compose up -d` |
| Wipe the database and start fresh | `npm run db:reset` (drops, re-migrates and re-seeds) |
| Full reset (containers, DB data, node_modules) | `docker compose down -v && docker compose up -d`, then `npm run db:migrate && npm run db:seed` |
| Something is unhealthy | `docker compose logs -f api` (or `postgres`, `back-office`, `web-front`) |

`down -v` deletes all local database data. Volume names start with the project folder name; check them with `docker volume ls`.

## Common commands
```bash
npm run typecheck       # all workspaces
npm run lint
npm run format:check
npm test                # Vitest in all apps (API tests need Postgres running)
npm run db:test         # wipe and rebuild the pos_test database (rarely needed)
npm run e2e             # Playwright E2E on its own stack (first time: npx playwright install chromium)
```

Before pushing, run the same checks as CI:
```bash
npm run typecheck && npm run lint && npm test && npm run e2e
```

API tests run against a separate `pos_test` database, never your dev data. `npm test` creates it and applies migrations automatically, and each test file truncates and seeds its own data.

## Documentation

| # | Document | What it answers |
|---|---|---|
| 01 | [Product Requirements (PRD)](docs/01-prd.md) | What we're building, for whom, and what's out of scope |
| 02 | [User Stories](docs/02-user-stories.md) | Who does what, with acceptance criteria |
| 03 | [Architecture](docs/03-architecture.md) | Components, offline design, key decisions |
| 04 | [Database Schema](docs/04-database-schema.md) | ER diagram, tables, invariants, Prisma schema |
| 05 | [API Specification](docs/05-api-spec.md) | Every endpoint, request/response, errors |
| 06 | [UI Screens](docs/06-ui-screens.md) | POS and back office screens, wireframes, receipt layout |
| 07 | [Roles & Security](docs/07-roles-security.md) | Permission matrix, auth, threats and mitigations |
| 08 | [Testing Strategy](docs/08-testing-strategy.md) | What we test, how, and the definition of done |
| 09 | [Deployment Guide](docs/09-deployment.md) | Installing, updating, backing up, and troubleshooting on the Linux server |
| 10 | [Roadmap](docs/10-roadmap.md) | Build phases, tasks and definition of done for each |

## Build order
10 phases: foundation & docs → Claude Code harness → mockups → local Docker → database → API → back office → POS web front → testing → deploy. The [roadmap](docs/10-roadmap.md) has the tasks and definition of done for each phase.

## Glossary
- **POS**: the cashier app (`apps/pos`), installed as a PWA on the shop's till device.
- **Back office**: the manager app (`apps/backoffice`), served at `/admin`.
- **Outbox**: the queue of completed sales on a POS device that hasn't been sent to the server yet.
- **Device code**: a short label per till (e.g. `T1`) used as the prefix of receipt numbers.
- **Money**: stored as `Decimal(10,2)` (product price/cost/tax rate `Decimal(8,2)`), sent as strings like `"6.50"` in the API.
- **Stock movement**: a ledger row recording every change to a product's stock.
