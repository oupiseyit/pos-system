# 07 — Roles & Security

## 1. Roles
There are three fixed roles, ranked so that each one includes everything below it:

| Role | Who | Summary |
|---|---|---|
| `CASHIER` | Till staff | Sell, take payment, print/reprint own receipts, search/create customers |
| `MANAGER` | Shop manager | + products, categories, inventory, all sales, voids, customers, reports |
| `ADMIN` | Owner | + staff accounts, shop settings |

Roles are a Prisma enum with a rank map in `apps/api/src/auth.ts`:
```ts
const rank = { CASHIER: 1, MANAGER: 2, ADMIN: 3 } as const;
export const requireRole = (min: Role) => (req, res, next) =>
  rank[req.user.role] >= rank[min] ? next() : res.status(403).json({ error: "Forbidden" });
```

## 2. Permission matrix

| Action | CASHIER | MANAGER | ADMIN |
|---|:-:|:-:|:-:|
| Log in to POS (PIN) | ✓ | ✓ | ✓ |
| Log in to back office | — | ✓ | ✓ |
| Set up a till device code | — | ✓ | ✓ |
| View products & categories | ✓ | ✓ | ✓ |
| Create/edit products & categories | — | ✓ | ✓ |
| Receive stock / stock count / view movements | — | ✓ | ✓ |
| Create a sale, take payment, print receipt | ✓ | ✓ | ✓ |
| View/reprint sales | own, today | all | all |
| Void a sale | — | ✓ | ✓ |
| Discard a rejected outbox entry | — | ✓ | ✓ |
| Search/create customers | ✓ | ✓ | ✓ |
| View/edit/delete customers | — | ✓ | ✓ |
| Reports & dashboard | — | ✓ | ✓ |
| View settings (for receipts) | ✓ | ✓ | ✓ |
| Edit settings | — | — | ✓ |
| Manage staff (create, role, deactivate, reset, unlock) | — | — | ✓ |

**The API is the authority.** The UIs hide what a role can't do, but every check above is enforced server-side (see the endpoint table in [05 §12](05-api-spec.md#12-endpoint-summary)).

## 3. Authentication

| Flow | Used by | Details |
|---|---|---|
| Email + password | Back office | `POST /auth/login`, bcrypt (cost 12) compare. Generic error on any failure |
| Email + PIN | POS | `POST /auth/pin`. PIN is 4–6 digits, bcrypt-hashed. **5 consecutive failures lock the account for 15 min** (`423`), and an admin can unlock |
| JWT | Both | HS256, signed with `JWT_SECRET` (≥ 32 random bytes), `exp` 12 h, payload `{ sub, role }` |

- **Token storage:** localStorage in both apps, which XSS could read. That risk is mitigated by the strict CSP and the absence of third-party scripts (§5). Cookies were rejected because the POS must replay the outbox with a bearer token, and that would add CSRF handling.
- **Deactivation/role change:** `requireAuth` loads the user on each request (one indexed lookup) and rejects with 401 if they're inactive. A role change also takes effect immediately because the role is read from the DB, not from the token.
- **Offline:** an expired token doesn't stop selling. Sync pauses (401) until the next PIN login. Logging in needs the server, because no credential hashes are stored on the device.
- **Rate limit:** `express-rate-limit` on `POST /auth/login` and `POST /auth/pin`, 10 requests/min per IP. In production the API trusts exactly one proxy hop (Caddy) for the client IP, and nowhere else trusts `X-Forwarded-For`, so the header can't be spoofed to get around the limit.
- **First admin:** created by the seed from env vars, with the password changed on first login (documented in [09](09-deployment.md)).

## 4. Data integrity controls
- **Server-side recomputation:** `POST /sales` recomputes all totals with `computeTotals` and rejects any mismatch. It also requires payments to add up exactly to the total.
- **Idempotency:** client-generated sale UUIDs make a replay harmless.
- **Transactions:** a sale, its items, payments, stock movements and stock updates are committed together or not at all, and the same applies to voids, receipts and adjustments.
- **Audit trail:**
  - Every stock change is a `StockMovement` with a user id.
  - Sales record `cashierId`, `syncedById` and `deviceCode`.
  - Voids record who, when and why.
  - Nothing financial is hard-deleted.
- **DB constraints:** unique keys, foreign keys with `RESTRICT`, and `CHECK`s on money/qty (see [04 §4](04-database-schema.md#4-invariants-enforced-in-the-api-inside-one-transaction)).

## 5. Application security
| Area | Control |
|---|---|
| Input | zod schema on every body and query, and unknown keys are stripped |
| SQL injection | Prisma parameterised queries, and `$queryRaw` used only with tagged templates (never string concat) |
| XSS | React escaping, and no `dangerouslySetInnerHTML`. CSP via `helmet`: `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'` |
| Headers | `helmet()` defaults (HSTS, no-sniff, referrer policy) |
| CORS | None: no CORS headers are sent, so other origins are refused. Production is same-origin, and in dev the Vite servers proxy `/api` |
| Transport | HTTPS only via Caddy, HTTP redirected. Required anyway for the service worker |
| Errors | No stack traces or SQL in responses, and details are logged server-side |
| Passwords | ≥ 8 chars, bcrypt cost 12, never logged or returned |
| Secrets | `.env` on the server only (mode 600), never committed. `.env.example` lists the names |
| Dependencies | `npm audit` in CI, lockfile committed |
| Logging | One JSON line per request (method, path, status, user id, ms). No bodies, tokens or PINs |

## 6. Infrastructure security
- The Postgres port is **not published** outside the Docker network, and the app connects as a non-superuser that owns only the `pos` database.
- The server exposes only ports 80/443 (Caddy) and SSH (key-only, no root login), with the `ufw` firewall enabled.
- Nightly encrypted `pg_dump` is copied off the server, and restores are tested monthly (see [09](09-deployment.md#7-backups--restore)).
- OS security updates are installed with `unattended-upgrades`.

## 7. Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Cashier sees another cashier's sales or reports | Role checks and own-sales filter on the server | — |
| Cashier tampers with prices in the browser or outbox | Totals arithmetic checked server-side. Each sale is tied to the cashier and device, and voids/price differences are visible in reports | A cashier with devtools could submit a lower price. Detecting this needs a sold-vs-catalog price report (later) |
| Cashier posts sales under another cashier's id | `syncedById` records the real uploader | Accepted, because offline sync needs it |
| PIN brute force | 5-try lockout, 15 min, rate limit per IP | Short PINs are guessable by shoulder-surfing, so staff should be trained |
| Stolen till device | Token expires in 12 h, and an admin can deactivate the user. Only catalog and recent sales are stored on the device | Unsynced sales on a stolen device are lost |
| Lost offline sales (cleared browser data) | The outbox is written before the receipt prints, sync runs every 30 s, and the badge shows pending | Clearing site data while offline loses pending sales, so staff are trained not to |
| Duplicate sales from retries | UUID idempotency | — |
| Two tills with the same device code | `receiptNo` unique → `409`, flagged as Needs attention | A manager must fix the device code |
| Ex-employee access | Deactivation takes effect on the next request | — |
| DB compromise | Not internet-exposed, hashed credentials, least-privilege user, backups | — |
| Server failure | Tills keep selling offline, and the DB is restored from the nightly backup | Up to 24 h of back-office edits could be lost, though sales stay in the outboxes |
