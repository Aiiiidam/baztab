import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// `server-only` throws outside a React Server Components bundle; make it inert here.
vi.mock('server-only', () => ({}));

// Validated env — the real schema's defaults with deterministic values, so tests never read a real .env.
vi.mock('@/lib/env', async () => {
  const { parseEnv } = await import('@/lib/env-schema');
  return {
    env: parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      APP_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
    }),
  };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/'),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    has: vi.fn(() => false),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Prisma singleton → deep mock. Tests reach it through helpers/prisma-mock.ts.
vi.mock('@/lib/prisma', async () => {
  const { mockDeep } = await import('vitest-mock-extended');
  const prismaMock = mockDeep<PrismaClient>();
  return { default: prismaMock, prisma: prismaMock, ensureConnected: vi.fn() };
});

// Silence the logger.
vi.mock('@/lib/logger', () => {
  const child = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const loggerMock = { ...child, fatal: vi.fn(), trace: vi.fn(), child: vi.fn(() => child) };
  return { default: loggerMock, logger: loggerMock };
});

if (!process.env.DEBUG_TESTS) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}
