import { expect, test } from '@playwright/test';

test('GET /api/health answers without a session cookie', async ({ request }) => {
  const response = await request.get('/api/health', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('healthy');
  expect(body.checks).toEqual({ database: 'ok', schema: 'ok' });
});

test('GET /api/health/live answers without touching the database', async ({ request }) => {
  const response = await request.get('/api/health/live');
  expect(response.status()).toBe(200);
  expect((await response.json()).status).toBe('alive');
});

test('security headers are present', async ({ request }) => {
  const response = await request.get('/login');
  const headers = response.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});
