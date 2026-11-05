# CLAUDE.md

pos-system - a point-of-sale system.

## Tech Stack
 - Database: PostgreSQL
 - API Note.js + Express + Typescript
 - ORM: Prisma
 - Back office: React ( managers)
 - Web client: React (cashier POS)
 - local dev: Docker + Compose
 - Deploy: linux serer

## Rules
 - Never change the stack without asking

## Code style
- TypeScript strict, no `any`
- Validate every request with zod
- Tests for all business logic
- One task per commit

## UI design
- Default template: mockups/v2 (v1 is archived, don't use it)
- Build POS and back-office screens to match mockups/v2/<screen>.html
- Reuse the design tokens, fonts and components from mockups/v2/styles.css

## Progress rule
- When a task is finished AND verified:
 1. tick it in docs/CHECKLIST.md
 2. republish the checklist artifact: https://claude.ai/artifact/LPJ63JruBaEESAHvJhSnmz (read it first, update that URL, never create a new one)
- Never tick unverified work.