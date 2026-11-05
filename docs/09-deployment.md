# 09 — Deployment Guide

Target: a single Linux server (Ubuntu 24.04 LTS or similar, 2 vCPU / 2 GB RAM / 20 GB disk is plenty) on the shop LAN or a VPS. Everything runs in Docker Compose: **Caddy** (HTTPS) → **api** (Express + built SPAs) → **db** (PostgreSQL 16).

## 1. Local development
```bash
cp .env.example .env               # defaults work for dev
docker compose up -d db            # Postgres on localhost:5432
npm install
npm run db:migrate -w apps/api     # prisma migrate dev
npm run db:seed -w apps/api
npm run dev                        # api :3000, pos :5173, backoffice :5174
```
The Vite dev servers proxy `/api` to `:3000`. The service worker is enabled only in production builds, so to test offline locally run `npm run build && npm run preview -w apps/pos` (localhost counts as a secure context).

## 2. Server prerequisites
```bash
sudo apt update && sudo apt install -y ca-certificates curl ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # log out/in afterwards
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```
- SSH: key-only (`PasswordAuthentication no`, `PermitRootLogin no`).
- `sudo apt install unattended-upgrades` for automatic security patches.

**HTTPS options.** HTTPS is required because the POS service worker only runs over it.
| Situation | Caddyfile site address | Notes |
|---|---|---|
| Public domain (VPS or port-forwarded) | `pos.example.com` | Caddy gets a Let's Encrypt cert automatically |
| LAN only, no domain | `https://192.168.1.10` with `tls internal` | Install Caddy's root CA (from `docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt`) on each till once |

## 3. Configuration (`/opt/pos/.env`, mode 600)
| Variable | Example | Purpose |
|---|---|---|
| `DOMAIN` | `pos.example.com` | Caddy site address |
| `POSTGRES_USER` | `pos` | DB owner (non-superuser) |
| `POSTGRES_PASSWORD` | *(32 random chars)* | `openssl rand -base64 24` |
| `POSTGRES_DB` | `pos` | |
| `DATABASE_URL` | `postgresql://pos:<pw>@db:5432/pos` | Used by Prisma |
| `JWT_SECRET` | *(≥ 32 random bytes)* | `openssl rand -hex 32` |
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | API port inside the network |
| `SEED_ADMIN_EMAIL` | `owner@shop.com` | First admin (seed only) |
| `SEED_ADMIN_PASSWORD` | *(temporary)* | Change it after first login |
| `BACKUP_PASSPHRASE` | *(random)* | Encrypts nightly dumps |

## 4. Build artefacts

### `Dockerfile` (multi-stage, at repo root)
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/pos/package.json apps/pos/
COPY apps/backoffice/package.json apps/backoffice/
RUN npm ci
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspaces          # api → dist, pos/backoffice → dist

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/api/package.json apps/api/
# `prisma` must be in apps/api "dependencies" (not devDependencies): migrate deploy runs at startup
RUN npm ci --omit=dev -w apps/api && npm cache clean --force
COPY --from=build /app/apps/api/prisma apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/pos/dist apps/api/public/pos
COPY --from=build /app/apps/backoffice/dist apps/api/public/admin
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/index.js"]
```
Migrations run on container start, so a failed migration stops the new version from serving.

### `docker-compose.prod.yml`
```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 10s
    # no ports: not reachable from outside the Docker network

  api:
    image: pos-api:${TAG:-latest}
    build: .
    restart: unless-stopped
    env_file: .env
    depends_on: { db: { condition: service_healthy } }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    env_file: .env
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on: [api]

volumes: { pgdata: {}, caddy_data: {} }
```

### `Caddyfile`
```
{$DOMAIN} {
  encode gzip
  reverse_proxy api:3000
  # LAN without a domain: replace the site address with https://192.168.1.10 and add:
  # tls internal
}
```

## 5. First deploy
```bash
sudo mkdir -p /opt/pos && sudo chown $USER /opt/pos && cd /opt/pos
git clone <repo-url> .
cp .env.example .env && chmod 600 .env && nano .env      # fill in §3
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api node apps/api/dist/seed.js   # Setting row + first admin
curl -fsS https://$DOMAIN/api/health                     # {"ok":true,"db":true,...}
```
Then:
1. Open `https://<domain>/admin`, log in as the seed admin and **change the password** (Staff → you).
2. Settings: shop details, currency, timezone and receipt footer.
3. Create managers and cashiers with PINs, then categories and products, and receive opening stock.
4. On each till: open `https://<domain>/` in Chrome, use **Install app** (PWA), run device setup with a manager PIN (code `T1`, `T2`, …), and set the 80mm printer as default with margins *None*, headers/footers off. For silent printing, start Chrome with `--kiosk-printing`.
5. Remove `SEED_ADMIN_PASSWORD` from `.env`.

## 6. Updating
```bash
cd /opt/pos
git pull
export TAG=$(git rev-parse --short HEAD)
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api      # migrations run on start
curl -fsS https://$DOMAIN/api/health
```
- Downtime is a few seconds. Tills keep selling offline and sync afterwards.
- POS devices pick up the new app version on the next load. The service worker uses an update-on-reload prompt, so the sell screen never refreshes mid-sale.
- **Before an update with a migration:** run a manual backup (§7).

**Rollback:** `TAG=<previous> docker compose -f docker-compose.prod.yml up -d api`. If the failed version applied a migration, restore the pre-update backup first (Prisma has no down-migrations). Keep migrations additive (add columns, then drop them in a later release) so rollbacks rarely need a restore.

## 7. Backups & restore
`/opt/pos/backup.sh`:
```bash
#!/bin/sh
set -eu
cd /opt/pos && . ./.env
F=/opt/pos/backups/pos-$(date +%F).sql.gz.gpg
mkdir -p /opt/pos/backups
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip | gpg --batch --symmetric --passphrase "$BACKUP_PASSPHRASE" -o "$F"
find /opt/pos/backups -name 'pos-*.gpg' -mtime +30 -delete
# copy off-server, e.g.: rclone copy "$F" remote:pos-backups/
```
Cron (`crontab -e`): `30 2 * * * /opt/pos/backup.sh >> /opt/pos/backups/backup.log 2>&1`

**Restore** (test monthly on a spare machine):
```bash
docker compose -f docker-compose.prod.yml stop api
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" backups/pos-2026-11-05.sql.gz.gpg | gunzip \
  | docker compose -f docker-compose.prod.yml exec -T db sh -c \
    'dropdb -U $POSTGRES_USER --if-exists $POSTGRES_DB && createdb -U $POSTGRES_USER $POSTGRES_DB && psql -U $POSTGRES_USER $POSTGRES_DB'
docker compose -f docker-compose.prod.yml start api
```
After a restore, tills resend anything still in their outboxes. Idempotency makes that safe, and sales made after the backup but already removed from the outboxes are lost, which is why the backup runs nightly.

## 8. Monitoring & logs
- `docker compose -f docker-compose.prod.yml ps` shows health status per service.
- `docker compose -f docker-compose.prod.yml logs -f api` gives JSON request logs.
- Uptime: point a free external monitor (or a cron `curl`) at `https://<domain>/api/health`.
- Log rotation: set Docker's default `json-file` driver with `max-size: 10m`, `max-file: 5` in `/etc/docker/daemon.json`.

## 9. Troubleshooting
| Symptom | Check |
|---|---|
| POS doesn't work offline | It must be served over HTTPS with a trusted cert (LAN: Caddy root CA installed on the till), and it must have been opened online once after install |
| Pending sales never sync | Badge says "⚠ needs attention": open the list and read the server error. A 401 means the cashier must log in again |
| `409` on sync | Two tills share a device code, so change one in device setup (managers) |
| Certificate errors | `docker compose logs caddy`. Ports 80/443 must be reachable for Let's Encrypt |
| API restarts in a loop | `logs api`. Usually a failed `prisma migrate deploy` or a bad `DATABASE_URL` |
| Receipt has margins or headers | Chrome print settings: margins None, uncheck Headers and footers, paper 80mm |
| Reports' days look shifted | Settings → timezone |
| Disk filling | `docker system df`, prune old images with `docker image prune`, check `/opt/pos/backups` |
