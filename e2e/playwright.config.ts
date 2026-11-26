import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_LOCALE, LOCALES } from '../src/lib/locale';

/**
 * E2E tests run against a real dev server, a real worker and a real Postgres.
 * Locally: `npm run db:deploy && npm run test:e2e` (members are provisioned
 * through the operator CLI by the specs themselves).
 * Override PORT to run beside another dev server (e.g. in a worktree); the
 * worker's health port follows it.
 *
 * PLAYWRIGHT_CHANNEL=msedge (or chrome) drives an installed browser instead of
 * the bundled Chromium, for networks where the Playwright CDN is unreachable.
 *
 * The browser runs with the same locale profile the app is built with
 * (resolved in src/lib/locale.ts), and specs read their copy through t(),
 * so the suite passes for whichever language the project uses.
 */
const profile = LOCALES[DEFAULT_LOCALE];
const PORT = process.env.PORT ?? '3000';
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const desktop = { ...devices['Desktop Chrome'], channel };

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    locale: profile.tag,
    timezoneId: profile.timeZone,
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/, use: desktop },
    {
      // Sign-in flow tests sign in and out themselves — no stored state.
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
      use: desktop,
    },
    {
      name: 'chromium',
      testIgnore: /auth\.spec\.ts/,
      use: { ...desktop, storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { APP_ORIGIN: BASE_URL },
  },
});
