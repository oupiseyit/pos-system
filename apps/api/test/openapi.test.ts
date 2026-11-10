import { describe, expect, it } from 'vitest';
import { api } from './fixtures.js';

describe('Swagger / OpenAPI (dev only)', () => {
  it('serves an OpenAPI 3.1 doc covering every endpoint in 05 §12, built from the zod schemas', async () => {
    const res = await api().get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    const ops = Object.values(res.body.paths as Record<string, object>).flatMap((p) => Object.keys(p));
    expect(ops).toHaveLength(36);
    const sale = res.body.paths['/sales'].post;
    expect(sale.security).toEqual([{ bearer: [] }]);
    const body = sale.requestBody.content['application/json'].schema;
    expect(body.required).toEqual(expect.arrayContaining(['id', 'items', 'totals', 'payments']));
    expect(body.properties.totals.properties.total).toMatchObject({ type: 'string', pattern: expect.any(String) });
    const daily = res.body.paths['/reports/daily'].get.parameters;
    expect(daily.filter((p: { required: boolean }) => p.required).map((p: { name: string }) => p.name)).toEqual([
      'from',
      'to',
    ]);
    expect(res.body.paths['/products/{id}'].get.parameters[0]).toMatchObject({ name: 'id', in: 'path' });
  });

  it('serves Swagger UI without inline scripts (the CSP allows only self)', async () => {
    const res = await api().get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
    expect(res.text).not.toMatch(/<script>(?!\s*<\/script>)/);
  });
});
