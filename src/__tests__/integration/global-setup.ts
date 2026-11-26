import { execSync } from 'node:child_process';

export const DEFAULT_TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/app_test';

/** Apply the committed migrations to the test database once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_MIGRATE: url },
  });
}
