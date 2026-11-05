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

## Quickstart (local dev)
```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:migrate -w apps/api
npm run db:seed -w apps/api
npm run dev          # api :3000 · pos :5173 · backoffice :5174
```

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
