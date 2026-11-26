import 'dotenv/config';
import { vi } from 'vitest';

// Real database, real env schema; only the Next.js and logging edges are stubbed.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/app_test';
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.LOG_LEVEL = 'silent';
process.env.STORAGE_FS_ROOT ??= '.storage-test';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => {
  const child = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const loggerMock = { ...child, fatal: vi.fn(), trace: vi.fn(), child: vi.fn(() => child) };
  return { default: loggerMock, logger: loggerMock };
});
