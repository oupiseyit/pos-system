# 10 — Roadmap

The build runs in 10 phases, in order. Each phase depends on the one before it and has a single exit gate.
Tasks point to the detailed docs instead of repeating them: story IDs are in [02](02-user-stories.md), endpoints in [05](05-api-spec.md), screens (A = POS, B = back office) in [06](06-ui-screens.md) and tests in [08](08-testing-strategy.md).

**From Phase 3 onwards, a phase is also done only when** the general definition of done from [08 §8](08-testing-strategy.md#8-definition-of-done-per-feature) is met: typecheck clean, CI green, money and stock invariants hold, and docs updated for any changed endpoint, table or screen.

| Phase | Name | Exit gate | Stories |
|---|---|---|---|
| 0 | Foundation & Docs | Docs approved | — |
| 1 | Claude Code Harness | Hooks + rules active | — |
| 2 | Mockups | Screens approved | all (visual only) |
| 3 | Local Docker | All services healthy | — |
| 4 | Database | Migrated + seeded | — |
| 5 | API | Endpoints tested | server side of all v1 stories |
| 6 | Back office | Admin flow works | AUTH-1, PROD-1..5, INV-1..4, SALE-10, CUST-1..2, STAFF-1..3, REP-1..6, SET-1 |
| 7 | Web front (POS) | A sale completes | AUTH-2..3, SALE-1..9, OFF-1..4, SET-2 |
| 8 | Testing | Everything green | — |
| 9 | Deploy | Live on HTTPS | — |

---

## Phase 0 — Foundation & Docs
**Exit gate: docs approved.**

**Tasks**
- [x] Git repo with `CLAUDE.md` (stack + rules), `README.md`, pushed to GitHub.
- [x] Docs 01–10 written in `docs/`.
- [ ] The shop owner reviews [01 PRD](01-prd.md) and [02 User stories](02-user-stories.md) for scope, v1/later tags and success metrics.
- [ ] A developer reviews [03 Architecture](03-architecture.md), [04 Schema](04-database-schema.md), [05 API](05-api-spec.md) and [07 Security](07-roles-security.md).
- [ ] Resolve the [PRD open questions](01-prd.md#9-open-questions) (discount approval, price-difference report), recording either "v1" or "later".

**Definition of done**
- The owner and the developer each sign off, recorded as an approving comment or PR review on GitHub.
- Every review comment is either fixed in the docs or logged as a "later" item.
- The open questions have an answer written in the PRD.

---

## Phase 1 — Claude Code Harness
**Depends on:** Phase 0. **Exit gate: hooks + rules active.**

Set up the guardrails Claude Code works under *before* any app code is written.

**Tasks**
- [ ] Extend `CLAUDE.md` rules:
  - Never change the stack without asking (existing rule).
  - Money is `Decimal`, sent as strings, and arithmetic happens only in `computeTotals`.
  - Never edit an applied migration. Add a new one.
  - Every API change needs a test and an update to `05-api-spec.md`.
  - Follow the roadmap phase order.
  - Commit only when asked.
- [ ] `.claude/settings.json` hooks:
  - **PreToolUse:** block edits to `.env*` (except `.env.example`) and to `apps/api/prisma/migrations/**` once applied.
  - **PreToolUse (Bash):** git guardrails that block `push --force`, `reset --hard`, `clean -f` and `branch -D`.
  - **PostToolUse (Edit/Write):** run Prettier + ESLint on the edited file. This is a no-op until the tools are installed in Phase 3.
  - **Stop:** run `npm run typecheck` when TypeScript files changed (also a no-op before Phase 3).
- [ ] Permission allowlist for routine commands: `npm test`, `npm run typecheck`, `docker compose ps/logs/up`, `npx prisma migrate dev/status`.
- [ ] Commit `.claude/settings.json` so the whole team gets the same harness. Personal overrides go in `.claude/settings.local.json` (gitignored).

**Definition of done**
- Asking Claude to edit `.env` is blocked with a clear message.
- `git push --force` from Claude is blocked.
- Editing a `.ts` file triggers the format hook (verified after Phase 3, and shown as a harmless no-op before it).
- `CLAUDE.md` rules show up in a fresh session (`/memory` lists them).

---

## Phase 2 — Mockups
**Depends on:** Phase 1. **Exit gate: screens approved.**

**Tasks**
- [ ] Static, clickable HTML + CSS mockups in `mockups/` (no build step, opened in a browser) for every screen in [06](06-ui-screens.md):
  - POS: A1 device setup, A2 PIN login, A3 sell screen, A4 customer dialog, A5 pay dialog, A6 receipt, A7 recent sales, A8 needs attention.
  - Back office: B1–B10.
- [ ] POS at 1024×768 with the online, offline and needs-attention header states.
- [ ] An 80mm receipt print preview, test-printed on the real thermal printer.
- [ ] Walk through the 5 key flows with the owner: cash sale, split sale, offline sale, receive stock, end-of-day cash-up.

**Definition of done**
- The owner approves each screen (a checklist in the PR with every screen ticked).
- Any changes from the review are written back into [06](06-ui-screens.md) and, where they affect behaviour, into [02](02-user-stories.md).
- The receipt prints legibly on the shop's printer with no clipped columns.

---

## Phase 3 — Local Docker
**Depends on:** Phase 2. **Exit gate: all services healthy.**

**Tasks**
- [ ] npm workspaces `apps/api`, `apps/pos` and `apps/backoffice`, with TypeScript `strict`, ESLint and Prettier.
- [ ] Minimal Express app with the JSON request log, the central error handler ([03 §3](03-architecture.md#3-backend-design)) and `GET /api/health`.
- [ ] Vite + React "hello" apps for POS and back office, with the dev proxy `/api` → api.
- [ ] `docker-compose.yml` with four services, each with a healthcheck and mounted source with hot reload:
  - `db` (Postgres 16, `pg_isready`)
  - `api` (`/api/health`)
  - `pos` (:5173)
  - `backoffice` (:5174)
- [ ] `.env.example` (variables from [09 §3](09-deployment.md#3-configuration-optpos-env-mode-600)).
- [ ] Vitest wired in all three apps, `npm run typecheck --workspaces`, and a GitHub Actions CI skeleton (install → typecheck → test).

**Definition of done**
- After `docker compose up -d`, `docker compose ps` shows all 4 services as **healthy**.
- `curl localhost:3000/api/health` returns `{ "ok": true, "db": true }`, and `503` with `db` stopped.
- Both apps load in the browser and reload when a file is edited.
- CI is green. The Phase 1 format/typecheck hooks now run for real.

---

## Phase 4 — Database
**Depends on:** Phase 3. **Exit gate: migrated + seeded.**

**Tasks**
- [ ] `apps/api/prisma/schema.prisma` from [04 §6](04-database-schema.md#6-prisma-schema-draft), using Decimal money columns.
- [ ] Initial migration, plus a raw-SQL migration for the `CHECK` constraints ([04 §4](04-database-schema.md#4-invariants-enforced-in-the-api-inside-one-transaction)).
- [ ] `src/seed.ts`:
  - The Setting row and the admin from env.
  - Dev data: 2 categories, 10 products with barcodes, a manager and a cashier (PIN `1234`), and 3 customers.
- [ ] `npm run db:migrate`, `db:seed` and `db:reset` scripts, and a `pos_test` database for tests.

**Definition of done**
- On a fresh volume, `npx prisma migrate status` reports "up to date" and the seed runs without errors.
- `psql` shows every table, enum, index and CHECK constraint from [04](04-database-schema.md).
- Inserting a negative price or `qty = 0` directly in SQL is rejected by the database.
- Re-running the seed doesn't duplicate data (upserts).

---

## Phase 5 — API
**Depends on:** Phase 4. **Exit gate: endpoints tested.**

**Tasks**
- [ ] `src/auth.ts`:
  - bcrypt and JWT.
  - `requireAuth` re-loads the user on each request.
  - `requireRole` uses the rank map.
  - Rate limit on `/auth/*`, plus `helmet`.
- [ ] `src/totals.ts`: `computeTotals` ([03 §3.1](03-architecture.md#31-computetotals-shared)), which takes decimal strings, works in cents internally and rounds tax half-up per line.
- [ ] Every endpoint in [05](05-api-spec.md):
  - auth (with PIN lockout)
  - users, categories, products (`updatedSince`)
  - inventory, customers
  - sales (all 7 processing steps, idempotent on the UUID), void
  - reports (timezone bucketing, CSV)
  - settings, health
- [ ] zod schemas on every body and query, using the error shape and status codes from [05 §1](05-api-spec.md#1-conventions).

**Definition of done**
- These API test files from [08 §3–4](08-testing-strategy.md#4-api-integration-tests) pass:
  - `totals.test.ts`, `auth.test.ts`, `roles.test.ts` (every endpoint × role)
  - `products.test.ts`, `inventory.test.ts`, `sales.test.ts`, `void.test.ts`, `reports.test.ts`, `invariants.test.ts`
  - customer tests
- Every endpoint in [05 §12](05-api-spec.md#12-endpoint-summary) has at least one passing test.
- Posting the same sale twice yields one sale and one stock decrement.

---

## Phase 6 — Back office
**Depends on:** Phase 5. **Exit gate: admin flow works.**

**Tasks**
- [ ] App shell: layout, role-based nav, the `api()` fetch wrapper (401 → login), toasts, and loading/empty/error states ([06 states checklist](06-ui-screens.md#states-checklist-every-screen)).
- [ ] Screens:
  - B1 Login
  - B2 Dashboard
  - B3 Products
  - B4 Categories
  - B5 Inventory (Receive / Count / Movements)
  - B6 Sales (detail, reprint, void)
  - B7 Customers
  - B8 Reports (date presets, CSV)
  - B9 Staff
  - B10 Settings with receipt preview

**Definition of done**
- The full admin flow works in the browser against the Docker stack:
  1. Log in as the seed admin and change the password.
  2. Fill in the settings.
  3. Create a manager and a cashier with a PIN.
  4. Add a category and products.
  5. Receive stock, then run a stock count.
  6. View the movements.
  7. View the reports, on seeded sales, and export a CSV.
- A manager can't see Staff/Settings, and a cashier is refused at login.
- Screens match the approved mockups in `mockups/v2/b*.html`.

---

## Phase 7 — Web front (POS)
**Depends on:** Phase 6. **Exit gate: a sale completes.**

**Tasks**
- [ ] Screens:
  - A1 Device setup
  - A2 PIN login
  - A3 Sell screen: scan/search, cart, line discount, keyboard shortcuts
  - A4 Customer dialog
  - A5 Pay dialog: cash with change, card, split
  - A6 Receipt with 80mm print CSS
  - A7 Recent sales
- [ ] Import `computeTotals` from `apps/api/src/totals.ts`.
- [ ] Offline:
  - `vite-plugin-pwa` app shell with an update-on-reload prompt.
  - `catalog.ts`: localStorage cache with delta sync.
  - `outbox.ts`: save before print, flush every 30 s and on `online`, pause on 401, mark other 4xx as needs attention.
  - Device receipt counter.
  - Header badge and the A8 Needs attention list.

**Definition of done**
- **A sale completes** end to end on a real till (barcode scanner + 80mm printer):
  1. Scan items.
  2. Apply a discount.
  3. Attach a customer.
  4. Pay cash and see the correct change.
  5. The receipt prints.
  6. The sale shows in the back office with stock decremented.
- A split cash + card sale completes.
- The same flow completes **offline**: the app reopens offline, the sale prints, and after reconnecting it syncs with no duplicate.
- `outbox.test.ts` and the pay dialog component tests pass.

---

## Phase 8 — Testing
**Depends on:** Phase 7. **Exit gate: everything green.**

**Tasks**
- [ ] Fill any gaps against [08](08-testing-strategy.md): every test file listed there exists and passes.
- [ ] Full CI pipeline: Postgres service → `npm ci` → typecheck → all tests → `npm audit --audit-level=high` → `docker build`.
- [ ] Run the full [08 §5](08-testing-strategy.md#5-manual-release-checklist) manual release checklist on the Docker stack with real hardware.
- [ ] Check every v1 story's acceptance criteria in [02](02-user-stories.md).
- [ ] Do a security pass against [07](07-roles-security.md):
  - The CSP header is present.
  - No secrets are in the repo.
  - Auth is rate-limited.
  - Error responses leak no stack traces.

**Definition of done**
- CI is green on `master`.
- Every box in the manual checklist is ticked, and every v1 story is accepted.
- There are no open high/critical `npm audit` findings and no known P1 bugs.

---

## Phase 9 — Deploy
**Depends on:** Phase 8. **Exit gate: live on HTTPS.**

**Tasks**
- [ ] Multi-stage `Dockerfile`, `docker-compose.prod.yml` and `Caddyfile` ([09 §4](09-deployment.md#4-build-artefacts)).
- [ ] Provision the Linux server ([09 §2](09-deployment.md#2-server-prerequisites)): Docker, ufw, key-only SSH, unattended-upgrades.
- [ ] First deploy and seed ([09 §5](09-deployment.md#5-first-deploy)), plus `backup.sh` with a nightly cron and an off-server copy ([09 §7](09-deployment.md#7-backups--restore)).
- [ ] Set up the tills: install the PWA, set device codes, configure the printer (no margins or headers, kiosk printing). For a LAN-only setup, install the Caddy root CA.
- [ ] Enter real staff, products and opening stock, then train the staff (offline badge, needs attention, don't clear browser data).

**Definition of done**
- `https://<domain>/api/health` returns `ok` from a till with a valid certificate, and HTTP redirects to HTTPS.
- The POS installs as a PWA and works offline from production.
- Last night's backup restores successfully on a spare machine.
- The seed admin password has been changed and `SEED_ADMIN_PASSWORD` removed from `.env`.
- The first real trading day closes with the cash-up report matching the drawer.

---

## After v1
Candidates, in rough priority: partial returns (SALE-11), shifts and cash-drawer reconciliation, a sold-vs-catalog price report, manager approval for large discounts, Playwright E2E tests, email receipts, multi-store. See the [PRD non-goals](01-prd.md#3-non-goals-v1).
