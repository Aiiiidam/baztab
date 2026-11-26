import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests against a real PostgreSQL (plan assumption A11): row
 * locking, composite foreign keys, atomic quota reservation and transactions,
 * which the Prisma mock cannot prove. Uses TEST_DATABASE_URL (default: the
 * local `app_test` database); global setup applies the committed migrations.
 * Files run one at a time because they share the database.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/integration/**/*.int.test.ts'],
    globalSetup: ['src/__tests__/integration/global-setup.ts'],
    setupFiles: ['src/__tests__/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
});
