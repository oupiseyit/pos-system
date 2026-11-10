# Project: point-of-sale system

## Plan

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
- Phase 6 : Back office => admin flow work
- Phase 7 : Web front => a sale complete
- Phase 8 Testing => everything green
- Phase 9 : Deploy => live on HTTPS
```

## Progress checklist

To see progress as plan:

```
Build a checklist artifact: a live web page  with every phase, every task, and a progress bar for each.
```

Add progress rule to CLAUDE.md:

```markdown
## Progress rule
- When a task is finished AND verified:
 1. tick it in docs/CHECKLIST.md
 2. republish the checklist artifact
- Never tick unverified work.
```

## Part 3: Docs & phases

Set up the Claude Code harness (rules + automation around Claude).

Add code style to CLAUDE.md:

```markdown
- Typescript strict, no 'any'
- Validate every request with zod
- Tests for all business logic
- One task per commit.
```

Add `.claude/settings.json`:

```json
"hooks":{
    "PostToolUse":[{
        "matcher" : "Edit|Write",
        "hooks": [{ "type": "command",
            "command": eslint . && tsc --noEmit"}]
    }]
}
```

Add `.claude/reviewer.md`:

```yaml
name: reviewer
description: fresh-eyes review per phase
tool: Read, Grep, Bash
```

Add `.claude/commands/next-task.md`:

```
Read docs/CHECKLIST.md
Pick the next unticked task.
Plan, build, verify, then tick
```

Add `.claude/settings.json`:

```json
"permissions":{
    "allow": ["Bash(npm run *)", "Bash(npx prisma *)",
        "Bash(docker compose *)"],
    "deny": ["Bash(rm -rf *)", "Read(.env)"]
}
```

Install skill:

```
/plugin install frontend-design
```

## Mockups

Ask Claude to generate mockup pages:

```
Use the frontend-design skill. Mock up every screen in docs/06-ui-screen.md as
HTML -- one file per screen in mockups/.
```

## Local Docker

Ask Claude to create the local Docker server:

```
Create docker-compose.yml with 5 services:
postgres, adminer, api, back-office, web-front, Secrets in .env.
```

Then run `docker compose up -d` to create all services.

## Database: PostgreSQL + Prisma

```
create folder prisma
Claude turns the schema document into a prisma schema: users and roles, product and category, stock moments,
customers, orders, order items, payments, and shifts.
```

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

Restart after editing `.env` or `docker-compose.yml`:

```bash
docker compose up -d --force-recreate
```

## Build API

```
Build the API from docs/05-api-spec.md -- Express + Typescript
```

## Build back office

```
Build the back office pages from the approved mockup and write them to the API
```

## Build web front

```
Build the web front pages from the approved mockup and write them to the API
```

## Phase 8: Testing until everything is green

```
Write unit, integration and playwright E2E testes for everything we build.
```

Update test list detail for checklist:

- Layer 1: Unit tests => total, tax, discounts
- Layer 2: Integration => API + real test database
- Layer 3: E2E => Playwright => clicks through like a user
