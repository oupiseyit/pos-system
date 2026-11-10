// Express app (no listen, so tests can drive it with supertest). Conventions: docs/05-api-spec.md §1.
import { Prisma } from '@prisma/client';
import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { requireAuth, requireRole } from './auth.js';
import { prisma } from './db.js';
import { HttpError } from './http.js';
import { openapiDoc } from './openapi.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { customersRouter } from './routes/customers.js';
import { inventoryRouter } from './routes/inventory.js';
import { productsRouter } from './routes/products.js';
import { reportsRouter } from './routes/reports.js';
import { salesRouter } from './routes/sales.js';
import { settingsRouter } from './routes/settings.js';
import { usersRouter } from './routes/users.js';

// Prisma → HTTP status (03 §3). P2003 here means a body referenced a missing row.
const prismaStatus: Record<string, [number, string]> = {
  P2002: [409, 'Already exists'],
  P2025: [404, 'Not found'],
  P2003: [400, 'Referenced record not found'],
};

export function createApp() {
  const app = express();
  // Prod runs behind exactly one proxy (Caddy) that sets X-Forwarded-For. Elsewhere trust nothing,
  // so a client can't spoof the header to dodge the auth rate limit.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  // Money columns are Prisma Decimals: always send them as "x.yy" strings, never numbers
  app.set('json replacer', function (this: Record<string, unknown>, key: string, value: unknown) {
    const raw = this[key];
    return raw instanceof Prisma.Decimal ? raw.toFixed(2) : value;
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          // The POS service worker caches Google Fonts with fetch(); without this it falls back to
          // default-src 'self' and the fonts never cache for offline use
          connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
          frameAncestors: ["'none'"],
          // Dev is plain http://localhost; upgrading would break the docs' script loads
          ...(process.env.NODE_ENV !== 'production' && { upgradeInsecureRequests: null }),
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // One JSON line per request: no bodies, tokens or PINs (07 §5)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const userId = (req.user as typeof req.user | undefined)?.id;
      console.log(
        JSON.stringify({
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          userId,
          ms: Date.now() - start,
        }),
      );
    });
    next();
  });

  app.get('/api/health', async (_req, res) => {
    const db = await prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );
    res.status(db ? 200 : 503).json({ ok: db, db, version: process.env.npm_package_version ?? 'dev' });
  });

  // Interactive docs, generated from the zod schemas. Not served in production.
  if (process.env.NODE_ENV !== 'production') {
    const doc = openapiDoc();
    app.get('/api/openapi.json', (_req, res) => {
      res.json(doc);
    });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'pos-system API' }));
  }

  // A fresh limiter per app, so each test app starts with a clean counter
  // Requests per minute per IP on /auth/login + /auth/pin (07: brute-force guard). Keep 10 in production.
  const limit = Number(process.env.AUTH_RATE_LIMIT ?? 10);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('AUTH_RATE_LIMIT must be a whole number ≥ 1');
  const authLimit = rateLimit({ windowMs: 60_000, limit, message: { error: 'Too many requests' } });
  app.use(['/api/auth/login', '/api/auth/pin'], authLimit);
  app.use('/api/auth', authRouter);

  app.use('/api', requireAuth);
  app.use('/api/users', requireRole('ADMIN'), usersRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/inventory', requireRole('MANAGER'), inventoryRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/reports', requireRole('MANAGER'), reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Production image (09 §4): the built back office at /admin and the POS at /. Both route in the
  // browser (hash / state), so plain static files are enough. Absent in dev, where Vite serves them.
  const pub = fileURLToPath(new URL('../public', import.meta.url));
  if (existsSync(pub)) {
    app.use('/admin', express.static(join(pub, 'admin')));
    app.use(express.static(join(pub, 'pos')));
  }

  // Central error handler: `{ error, details }`, never a stack trace or SQL
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: 'Validation failed', details: z.flattenError(err).fieldErrors });
    if (err instanceof Prisma.PrismaClientKnownRequestError && prismaStatus[err.code]) {
      const [status, error] = prismaStatus[err.code];
      const target = err.meta?.target;
      return res.status(status).json({ error, details: Array.isArray(target) ? { field: target[0] } : undefined });
    }
    // body-parser errors (bad JSON, too large) carry a safe 4xx status
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) return res.status(status).json({ error: 'Bad request' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  };
  app.use(onError);
  return app;
}
