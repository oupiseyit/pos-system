# Project: point-of-sale system

## Phase 0: Foundation & Docs => docs approved

```
Plan a point-of-sale system for a small shop: products, inventory, sales, payment, receipts, customers, staff, roles and report.
```

```
Write all documentation from start to complete as markdown in /docs:
PRD, user stories, architecture, database schema with an ER diagram,
API spec, UI screens, roles & security, testing strategy and deployment guide.
```

```
Split the work into phases, in build order, each with task and a definition of done.
- Phase 0 : Foundation & Docs => docs approved
- Phase 1 : Claude Code Harness => hooks + rules active
- Phase 2 : Mockups => screens approved
- Phase 3 : Local Docker => all services healthy
- Phase 4 : Database => migrated + seeded
- Phase 5 : API => endpoints tested
- Phase 6 : Back office => admin flow works
- Phase 7 : Web front => a sale completes
- Phase 8 : Testing => everything green
- Phase 9 : Deploy => live on HTTPS
```

### Progress checklist

To see progress as plan:

```
Build a checklist artifact: a live web page with every phase, every task, and a progress bar for each.
```

Add progress rule to CLAUDE.md:

```markdown
## Progress rule
- When a task is finished AND verified:
 1. tick it in docs/CHECKLIST.md
 2. republish the checklist artifact
- Never tick unverified work.
```

## Phase 1: Claude Code Harness => hooks + rules active

Set up the Claude Code harness (rules + automation around Claude).

Add code style to CLAUDE.md:

```markdown
- Typescript strict, no 'any'
- Validate every request with zod
- Tests for all business logic
- One task per commit.
```

Add `.claude/settings.json` with:

- **Hook:** after every Edit/Write, run lint + typecheck (`npx eslint . && npm run typecheck`).
- **Allow:** `npm run *`, `npx prisma *`, `docker compose *`.
- **Deny:** `rm -rf *`, `docker compose down -v*`, `npx prisma migrate reset*`, `Read(.env)`, `Read(.env.local)`, `Read(.env.production)`.

Real file: [.claude/settings.json](.claude/settings.json) (hooks and permissions live in the same file).

Add a reviewer subagent: [.claude/agents/reviewer.md](.claude/agents/reviewer.md)

```yaml
---
name: reviewer
description: Fresh-eyes review per phase. Use when a roadmap phase is finished, before ticking it done.
tools: Read, Grep, Bash
---
```

Add [.claude/commands/next-task.md](.claude/commands/next-task.md):

```
Read docs/CHECKLIST.md
Pick the next unticked task.
Plan, build, verify, then tick
```

Install skill:

```
/plugin install frontend-design
```

## Phase 2: Mockups => screens approved

Ask Claude to generate mockup pages:

```
Use the frontend-design skill. Mock up every screen in docs/06-ui-screens.md as
HTML -- one file per screen in mockups/.
```

The first set was redone as **v2**: build every screen to `mockups/v2/<screen>.html` and reuse `mockups/v2/styles.css`. v1 is archived, don't use it (rule in CLAUDE.md).

## Phase 3: Local Docker => all services healthy

Ask Claude to create the local Docker server:

```
Create docker-compose.yml with 5 services:
postgres, adminer, api, back-office, web-front, Secrets in .env.
```

Then run `docker compose up -d` to create all services.

## Phase 4: Database (PostgreSQL + Prisma) => migrated + seeded

```
create folder prisma
Claude turns the schema document into a prisma schema: users and roles, product and category, stock movements,
customers, orders, order items, payments, and shifts.
```

What was built: `User`, `Category`, `Product`, `StockMovement`, `Customer`, `Sale`, `SaleItem`, `Payment`, `Setting` (no shifts). Real file: [prisma/schema.prisma](prisma/schema.prisma).

```bash
npm run db:migrate   # apply migrations
npm run db:seed      # admin from .env + dev data (PIN 1234)
npm run db:reset     # wipe, re-migrate, re-seed
```

Restart after editing `.env` or `docker-compose.yml`:

```bash
docker compose up -d --force-recreate
```

## Phase 5: API => endpoints tested

```
Build the API from docs/05-api-spec.md -- Express + Typescript
```

Follow-ups (Swagger docs, rate limits, AUTH_RATE_LIMIT, ...): see [docs/CHECKLIST.md](docs/CHECKLIST.md) Phase 5.

## Phase 6: Back office => admin flow works

```
Build the back office pages from the approved mockup and wire them to the API
```

Details: [docs/CHECKLIST.md](docs/CHECKLIST.md) Phase 6.

## Phase 7: Web front => a sale completes

```
Build the web front pages from the approved mockup and wire them to the API
```

Details (offline outbox, PWA, receipt redesign, ...): [docs/CHECKLIST.md](docs/CHECKLIST.md) Phase 7.

## Phase 8: Testing => everything green

```
Write unit, integration and playwright E2E tests for everything we build.
```

Update test list detail for checklist:

- Layer 1: Unit tests => total, tax, discounts
- Layer 2: Integration => API + real test database
- Layer 3: E2E => Playwright => clicks through like a user

Full CI:

```
Full CI: Postgres service → npm ci → typecheck → all tests → npm audit --audit-level=high → docker build.
```

## Phase 9: Deploy => live on HTTPS

Not started yet. Planned prompt:

```
Deploy to the Linux server following docs/09-deployment.md: docker-compose.prod.yml,
Caddy for HTTPS, backups, and verify the live site end to end.
```

Guide: [docs/09-deployment.md](docs/09-deployment.md).
