import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers';

const dir = mkdtempSync(path.join(tmpdir(), 'moneylens-web-'));
mkdirSync(path.join(dir, 'assets'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>MoneyLens</title>');
writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
writeFileSync(path.join(dir, 'manifest.webmanifest'), '{}');

const { app, prisma } = createTestContext({ WEB_DIST_DIR: dir });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('serving the web app (WEB_DIST_DIR)', () => {
  it('answers app routes with index.html, revalidated, under the CSP', async () => {
    const res = await request(app).get('/transactions').expect(200);
    expect(res.text).toContain('<title>MoneyLens</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('caches hashed assets for a year and serves other files as they are', async () => {
    const asset = await request(app).get('/assets/app-abc123.js').expect(200);
    expect(asset.headers['cache-control']).toMatch(/max-age=31536000.*immutable/);
    await request(app).get('/manifest.webmanifest').expect(200);
  });

  it('keeps unknown API routes as JSON 404s', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    await request(app).get('/api').expect(404);
  });
});
