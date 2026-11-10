# Checklist

Progress tracker for the build. Details, dependencies and the definition of done for each phase are in [10-roadmap.md](10-roadmap.md).
Live view: https://claude.ai/artifact/LPJ63JruBaEESAHvJhSnmz

Tick a task only when it is finished and verified (see the progress rule in `CLAUDE.md`).

## Phase 0 — Foundation & Docs
Exit gate: Docs approved

- [x] Git repo with `CLAUDE.md` (stack + rules), `README.md`, pushed to GitHub.
- [x] Docs 01–10 written in `docs/`.
- [x] The shop owner reviews 01 PRD and 02 User stories for scope, v1/later tags and success metrics.
- [x] A developer reviews 03 Architecture, 04 Schema, 05 API and 07 Security.
- [x] Resolve the PRD open questions (discount approval, price-difference report), recording either "v1" or "later".

## Phase 1 — Claude Code Harness
Exit gate: Hooks + rules active

- [x] Extend `CLAUDE.md` rules
  - Never change the stack without asking (existing rule).
  - Money is `Decimal`, sent as strings, arithmetic only in `computeTotals`.
  - Never edit an applied migration. Add a new one.
  - Every API change needs a test and an update to `05-api-spec.md`.
  - Follow the roadmap phase order.
  - Commit only when asked.
- [x] `.claude/settings.json` hooks
  - PreToolUse: block edits to `.env*` (except `.env.example`) and applied migrations.
  - PreToolUse (Bash): block `push --force`, `reset --hard`, `clean -f`, `branch -D`.
  - PostToolUse (Edit/Write): Prettier + ESLint on the edited file.
  - Stop: `npm run typecheck` when TypeScript files changed.
- [x] Permission allowlist: `npm test`, `npm run typecheck`, `docker compose ps/logs/up`, `npx prisma migrate dev/status`.
- [x] Commit `.claude/settings.json`; personal overrides in `.claude/settings.local.json` (gitignored).

## Phase 2 — Mockups
Exit gate: Screens approved

- [x] Static, clickable HTML + CSS mockups in `mockups/` for every screen in 06
  - POS: A1 device setup, A2 PIN login, A3 sell screen, A4 customer dialog, A5 pay dialog, A6 receipt, A7 recent sales, A8 needs attention.
  - Back office: B1–B10.
  - Default set: `mockups/v2` (v1 archived).
- [x] POS at 1024×768 with the online, offline and needs-attention header states.
- [x] An 80mm receipt print preview, test-printed on the real thermal printer.
- [ ] Walk through the 5 key flows with the owner: cash sale, split sale, offline sale, receive stock, end-of-day cash-up.

## Phase 3 — Local Docker
Exit gate: All services healthy

- [x] npm workspaces `apps/api`, `apps/pos`, `apps/backoffice`, with TypeScript `strict`, ESLint and Prettier.
- [x] Minimal Express app with JSON request log, central error handler and `GET /api/health`.
- [x] Vite + React "hello" apps for POS and back office, with the dev proxy `/api` → api.
- [x] `docker-compose.yml` with four services, healthchecks and hot reload
  - `db` (Postgres 16, `pg_isready`)
  - `api` (`/api/health`)
  - `pos` (:5173)
  - `backoffice` (:5174)
- [x] `.env.example` (variables from 09 §3).
- [x] Vitest in all three apps, `npm run typecheck --workspaces`, and a GitHub Actions CI skeleton.

## Phase 4 — Database
Exit gate: Migrated + seeded

- [x] `apps/api/prisma/schema.prisma` from 04 §6, using Decimal money columns.
- [x] Initial migration, plus a raw-SQL migration for the `CHECK` constraints.
- [x] `src/seed.ts`
  - The Setting row and the admin from env.
  - Dev data: 2 categories, 10 products with barcodes, a manager and a cashier (PIN `1234`), 3 customers.
- [x] `npm run db:migrate`, `db:seed`, `db:reset` scripts, and a `pos_test` database for tests.

## Phase 5 — API
Exit gate: Endpoints tested

- [x] `src/auth.ts`
  - bcrypt and JWT.
  - `requireAuth` re-loads the user on each request.
  - `requireRole` uses the rank map.
  - Rate limit on `/auth/*`, plus `helmet`.
- [x] `src/totals.ts`: `computeTotals` — decimal strings in, cents internally, tax rounded half-up per line.
- [x] Every endpoint in 05
  - auth (with PIN lockout)
  - users, categories, products (`updatedSince`)
  - inventory, customers
  - sales (all 7 steps, idempotent on the UUID), void
  - reports (timezone bucketing, CSV)
  - settings, health
- [x] zod schemas on every body and query, using the error shape and status codes from 05 §1.

## Phase 6 — Back office
Exit gate: Admin flow works

- [x] App shell: layout, role-based nav, `api()` fetch wrapper (401 → login), toasts, loading/empty/error states.
- [x] B1 Login
- [x] B2 Dashboard
- [x] B3 Products
- [x] B4 Categories
- [x] B5 Inventory (Receive / Count / Movements)
- [x] B6 Sales (detail, reprint, void)
- [x] B7 Customers
- [x] B8 Reports (date presets, CSV)
- [x] B9 Staff
- [x] B10 Settings with receipt preview

## Phase 7 — Web front (POS)
Exit gate: A sale completes

- [x] A1 Device setup
- [x] A2 PIN login
- [x] A3 Sell screen: scan/search, cart, line discount, keyboard shortcuts
- [x] A4 Customer dialog
- [x] A5 Pay dialog: cash with change, card, split
- [x] A6 Receipt with 80mm print CSS
- [x] A7 Recent sales
- [x] Import `computeTotals` from `apps/api/src/totals.ts`.
- [x] Offline
  - `vite-plugin-pwa` app shell with an update-on-reload prompt.
  - `catalog.ts`: localStorage cache with delta sync.
  - `outbox.ts`: save before print, flush every 30 s and on `online`, pause on 401, other 4xx → needs attention.
  - Device receipt counter.
  - Header badge and the A8 Needs attention list.

## Phase 8 — Testing
Exit gate: Everything green

- [x] Layer 1 — Unit tests (Vitest): totals, tax, discounts. 43 tests.
  - `apps/api/src/totals.test.ts`: `computeTotals` — price × qty, tax 10 % on 6.50 × 2 − 1.00, tax rounded half-up per line, mixed tax rates, discount = line amount, empty cart, no floats.
  - `apps/pos/src/cart.test.ts`: add / increment / remove, line discount as amount or %, never more than the line; pay rules: cash change, short cash, card cap, split, quick cash; the `POST /sales` body.
  - `apps/pos/src/outbox.test.ts`: offline outbox (2xx / network error / 401 / 400 / 5xx, idempotent replay, no double POST) and receipt numbers `T1-000001`….
  - `apps/pos/src/catalog.test.ts`: catalog delta sync and the till-side receipt.
  - `apps/backoffice/src/logic.test.tsx`: money and dates in the shop timezone, receipt model (discount lines, VOID), Code 128 barcode.
- [x] Layer 2 — Integration (Vitest + Supertest): API + real `pos_test` Postgres. 158 tests.
  - `auth` (login, PIN lockout, rate limit) · `roles` (every endpoint, role below minimum → 403).
  - `products` · `inventory` (receive, count, adjust) · `customers` · `users-settings`.
  - `sales` (stock decrement, idempotent, totals / payments mismatch, 409 receipt no) · `void` (stock back, excluded from reports).
  - `reports` (timezone day bucketing, CSV) · `invariants` (stockQty = Σ movements) · `openapi`.
- [x] Layer 3 — E2E (Playwright): clicks through like a user, own stack on `pos_e2e`. 15 tests, `npm run e2e`.
  - `e2e/pos.spec.ts`: device setup, PIN login, cash sale with change + auto-print, split payment with discount + customer, offline sale → sync, Recent sales, manager void.
  - `e2e/backoffice.spec.ts`: sign-in rules, manager limits, category → product → receive stock, sale void, reports + CSV, customers, staff, settings (GMT+7).
- [x] Fill any gaps against 08: every listed test file exists and passes.
  - Component layer folded into cart.test.ts (rules) + Playwright (dialogs); 08 updated.
- [ ] Full CI: Postgres service → `npm ci` → typecheck → all tests → `npm audit --audit-level=high` → `docker build`.
- [ ] Run the full 08 §5 manual release checklist on the Docker stack with real hardware.
- [ ] Check every v1 story's acceptance criteria in 02.
- [ ] Security pass against 07
  - The CSP header is present.
  - No secrets are in the repo.
  - Auth is rate-limited.
  - Error responses leak no stack traces.

## Phase 9 — Deploy
Exit gate: Live on HTTPS

- [ ] Multi-stage `Dockerfile`, `docker-compose.prod.yml` and `Caddyfile`.
- [ ] Provision the Linux server: Docker, ufw, key-only SSH, unattended-upgrades.
- [ ] First deploy and seed, plus `backup.sh` with a nightly cron and an off-server copy.
- [ ] Set up the tills: install the PWA, set device codes, configure the printer (no margins/headers, kiosk printing). LAN-only: install the Caddy root CA.
- [ ] Enter real staff, products and opening stock, then train the staff.
