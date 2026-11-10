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

**Trying the API:** open the Swagger UI and call `POST /auth/pin` with `{ "email": "manager@shop.local", "pin": "1234" }` (seeded dev staff; `cashier@shop.local` works too). Then paste the returned `token` into **Authorize**. The admin logs in with `POST /auth/login`, using the email and password from `.env`. Swagger lists every endpoint with request bodies generated from the API's zod schemas. [05-api-spec.md](docs/05-api-spec.md) describes behaviour and response shapes.

### Option B: only Postgres in Docker, apps on the host
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev             # api :3000 · pos :5173 · backoffice :5174
```
Don't run this alongside Option A: they use the same ports.

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
