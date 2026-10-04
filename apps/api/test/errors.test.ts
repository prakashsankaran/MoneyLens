import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler';
import { createTestContext } from './helpers';

const { app, prisma } = createTestContext();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('error envelope', () => {
  it('returns 404 in the standard format for unknown routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' },
    });
  });

  it('reports malformed JSON as a validation error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never leaks internal error details or stack traces', async () => {
    const broken = express();
    broken.get('/boom', () => {
      throw new Error('connection string postgres://secret@db');
    });
    broken.use(notFoundHandler);
    broken.use(errorHandler(createLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'test' })));

    const res = await request(broken).get('/boom').expect(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('only allows configured CORS origins', async () => {
    const allowed = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(app)
      .options('/api/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
