// OpenAPI 3.1 document for Swagger UI (/api/docs). Request bodies and query params are generated
// from the same zod schemas the routes validate with, so they can't drift from the code.
// docs/05-api-spec.md stays the source of truth for behaviour and response shapes.
import { z } from 'zod';
import * as auth from './routes/auth.js';
import * as categories from './routes/categories.js';
import * as customers from './routes/customers.js';
import * as inventory from './routes/inventory.js';
import * as products from './routes/products.js';
import * as reports from './routes/reports.js';
import * as sales from './routes/sales.js';
import * as settings from './routes/settings.js';
import * as users from './routes/users.js';

type Role = 'CASHIER' | 'MANAGER' | 'ADMIN';
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
interface Op {
  summary: string;
  role?: Role; // omitted = public
  ok?: number;
  body?: z.ZodType;
  query?: z.ZodObject;
  csv?: true;
}

// ponytail: response bodies are described in 05, not modelled here; add response schemas if a client generator needs them
const ops: [Method, string, string, Op][] = [
  ['get', '/health', 'Health', { summary: 'Health and DB check (503 if the DB is down)' }],
  ['post', '/auth/login', 'Auth', { summary: 'Email + password login', body: auth.loginBody }],
  ['post', '/auth/pin', 'Auth', { summary: 'Email + PIN login (locks after 5 failures)', body: auth.pinBody }],
  ['get', '/auth/me', 'Auth', { summary: 'Current user', role: 'CASHIER' }],

  ['get', '/users', 'Users', { summary: 'List users', role: 'ADMIN', query: users.listQuery }],
  ['get', '/users/:id', 'Users', { summary: 'Get a user', role: 'ADMIN' }],
  ['post', '/users', 'Users', { summary: 'Create a user', role: 'ADMIN', ok: 201, body: users.createBody }],
  ['patch', '/users/:id', 'Users', { summary: 'Update / unlock a user', role: 'ADMIN', body: users.patchBody }],

  ['get', '/categories', 'Categories', { summary: 'List categories', role: 'CASHIER' }],
  ['post', '/categories', 'Categories', { summary: 'Create', role: 'MANAGER', ok: 201, body: categories.body }],
  ['patch', '/categories/:id', 'Categories', { summary: 'Rename', role: 'MANAGER', body: categories.body }],
  ['delete', '/categories/:id', 'Categories', { summary: 'Delete (409 if in use)', role: 'MANAGER', ok: 204 }],

  ['get', '/products', 'Products', { summary: 'List / search / delta', role: 'CASHIER', query: products.listQuery }],
  ['get', '/products/:id', 'Products', { summary: 'Get a product', role: 'CASHIER' }],
  ['post', '/products', 'Products', { summary: 'Create', role: 'MANAGER', ok: 201, body: products.createBody }],
  [
    'patch',
    '/products/:id',
    'Products',
    { summary: 'Update (no stockQty)', role: 'MANAGER', body: products.patchBody },
  ],

  [
    'post',
    '/inventory/receive',
    'Inventory',
    { summary: 'Receive stock', role: 'MANAGER', ok: 201, body: inventory.receiveBody },
  ],
  [
    'post',
    '/inventory/adjust',
    'Inventory',
    { summary: 'Stock count', role: 'MANAGER', ok: 201, body: inventory.adjustBody },
  ],
  [
    'get',
    '/inventory/movements',
    'Inventory',
    { summary: 'Movements, newest first', role: 'MANAGER', query: inventory.movementsQuery },
  ],

  ['get', '/customers', 'Customers', { summary: 'List / search', role: 'CASHIER', query: customers.listQuery }],
  ['post', '/customers', 'Customers', { summary: 'Create', role: 'CASHIER', ok: 201, body: customers.createBody }],
  ['get', '/customers/:id', 'Customers', { summary: 'Detail with stats', role: 'MANAGER' }],
  [
    'patch',
    '/customers/:id',
    'Customers',
    { summary: 'Update', role: 'MANAGER', body: customers.createBody.partial() },
  ],
  ['delete', '/customers/:id', 'Customers', { summary: 'Delete (409 if it has sales)', role: 'MANAGER', ok: 204 }],

  [
    'post',
    '/sales',
    'Sales',
    { summary: 'Record a sale (idempotent on id; 200 on replay)', role: 'CASHIER', ok: 201, body: sales.saleBody },
  ],
  ['get', '/sales', 'Sales', { summary: 'List (cashier: own, today)', role: 'CASHIER', query: sales.listQuery }],
  ['get', '/sales/:id', 'Sales', { summary: 'Full sale (cashier: own)', role: 'CASHIER' }],
  ['post', '/sales/:id/void', 'Sales', { summary: 'Void and restock', role: 'MANAGER', body: sales.voidBody }],

  ['get', '/reports/daily', 'Reports', { summary: 'Daily totals', role: 'MANAGER', query: reports.rangeQuery }],
  [
    'get',
    '/reports/products',
    'Reports',
    { summary: 'By product', role: 'MANAGER', query: reports.rangeQuery.extend(reports.productsQuery.shape) },
  ],
  ['get', '/reports/cashiers', 'Reports', { summary: 'By cashier', role: 'MANAGER', query: reports.rangeQuery }],
  ['get', '/reports/payments', 'Reports', { summary: 'By payment method', role: 'MANAGER', query: reports.rangeQuery }],
  [
    'get',
    '/reports/low-stock',
    'Reports',
    { summary: 'At/below reorder level', role: 'MANAGER', query: reports.csvQuery },
  ],
  ['get', '/reports/inventory-value', 'Reports', { summary: 'Stock value', role: 'MANAGER', query: reports.csvQuery }],

  ['get', '/settings', 'Settings', { summary: 'Shop settings', role: 'CASHIER' }],
  ['put', '/settings', 'Settings', { summary: 'Replace settings', role: 'ADMIN', body: settings.body }],
];

const jsonSchema = (s: z.ZodType) => {
  // io: 'input' describes what clients send (before transforms/defaults); dates etc. fall back to {}
  const out: Record<string, unknown> = z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' });
  delete out.$schema;
  return out;
};

const errors = {
  '400': { description: 'Validation failed or business rule broken' },
  '401': { description: 'Missing / invalid token, or bad credentials' },
  '403': { description: 'Role too low' },
  '404': { description: 'Not found' },
  '409': { description: 'Conflict' },
};

function operation(tag: string, op: Op) {
  const ok = op.ok ?? 200;
  return {
    tags: [tag],
    summary: op.summary,
    description: op.role ? `Minimum role: **${op.role}**` : 'Public',
    ...(op.role && { security: [{ bearer: [] }] }),
    ...(op.query && {
      parameters: Object.entries(op.query.shape).map(([name, s]) => ({
        name,
        in: 'query',
        required: !(s as z.ZodType).safeParse(undefined).success,
        schema: jsonSchema(s as z.ZodType),
      })),
    }),
    ...(op.body && {
      requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(op.body) } } },
    }),
    responses: { [ok]: { description: ok === 204 ? 'No content' : 'OK' }, ...errors },
  };
}

export function openapiDoc() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, tag, op] of ops) {
    const oaPath = path.replace(/:(\w+)/g, '{$1}');
    const params = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }));
    const o = operation(tag, op);
    paths[oaPath] ??= {};
    paths[oaPath][method] = params.length ? { ...o, parameters: [...params, ...(o.parameters ?? [])] } : o;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'pos-system API',
      version: process.env.npm_package_version ?? 'dev',
      description:
        'Money is a decimal string with 2 places ("12.50"), never a number. Errors are `{ error, details }`. ' +
        'Full behaviour: docs/05-api-spec.md. Log in via /auth/login or /auth/pin, then **Authorize** with the token.',
    },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
