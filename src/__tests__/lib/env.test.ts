import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env-schema';

const LOCAL = 'postgresql://postgres:postgres@localhost:5432/app';

describe('parseEnv', () => {
  it('applies the spec defaults for local work', () => {
    const env = parseEnv({ DATABASE_URL: LOCAL });
    expect(env).toMatchObject({
      PROCESS_ROLE: 'web',
      DATABASE_URL: LOCAL,
      APP_ORIGIN: 'http://localhost:3000',
      REPORT_TIME_ZONE: 'Asia/Tehran',
      SESSION_IDLE_HOURS: 24,
      SESSION_ABSOLUTE_DAYS: 7,
      INITIAL_PASSWORD_EXPIRY_DAYS: 7,
      LOGIN_ACCOUNT_MAX_FAILURES: 5,
      LOGIN_SOURCE_MAX_FAILURES: 30,
      LOGIN_WINDOW_MINUTES: 15,
      UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
      UPLOAD_MAX_FILES: 50,
      UPLOAD_CONCURRENCY: 2,
      RETENTION_DAYS: 10,
      STORAGE_BUDGET_BYTES: 800_000_000,
      FILENAME_DATE_MIN: '2020-01-01',
    });
  });

  it('maps the role-specific database URL onto DATABASE_URL', () => {
    const web = parseEnv({ DATABASE_URL: LOCAL, DATABASE_URL_WEB: 'postgresql://web@db:5432/app' });
    expect(web.DATABASE_URL).toBe('postgresql://web@db:5432/app');

    const worker = parseEnv({
      PROCESS_ROLE: 'worker',
      DATABASE_URL_WEB: 'postgresql://web@db:5432/app',
      DATABASE_URL_WORKER: 'postgresql://worker@db:5432/app',
    });
    expect(worker.DATABASE_URL).toBe('postgresql://worker@db:5432/app');
  });

  it('fails at boot with a readable message when no database URL fits the role', () => {
    expect(() =>
      parseEnv({ PROCESS_ROLE: 'worker', DATABASE_URL_WEB: 'postgresql://web@db/app' }),
    ).toThrow(/DATABASE_URL_WORKER \(or DATABASE_URL for local work\) is required/);
  });

  it('rejects malformed values', () => {
    expect(() => parseEnv({ DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: LOCAL, SESSION_IDLE_HOURS: '-1' })).toThrow(
      /SESSION_IDLE_HOURS/,
    );
  });

  it('refuses SKIP_AUTH in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SKIP_AUTH: 'true',
        DATABASE_URL: LOCAL,
        APP_ORIGIN: 'https://baztab.example',
        STORAGE_DRIVER: 's3',
        STORAGE_ENDPOINT: 'https://s3.example',
        STORAGE_BUCKET: 'recordings',
        STORAGE_ACCESS_KEY_ID: 'id',
        STORAGE_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toThrow('SKIP_AUTH=true is not allowed when NODE_ENV=production.');
  });

  it('requires APP_ORIGIN and S3 storage for the production web process', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', DATABASE_URL: LOCAL })).toThrow(
      /APP_ORIGIN is required in production[\s\S]*STORAGE_DRIVER=fs is for local development/,
    );
  });

  it('defers runtime-only production checks during next build, but still refuses SKIP_AUTH', () => {
    const build = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://build:build@localhost/build',
    };
    expect(parseEnv(build, { building: true }).NODE_ENV).toBe('production');
    expect(() => parseEnv({ ...build, SKIP_AUTH: 'true' }, { building: true })).toThrow(
      'SKIP_AUTH=true is not allowed when NODE_ENV=production.',
    );
  });

  it('requires every S3 setting once the driver is s3', () => {
    expect(() => parseEnv({ DATABASE_URL: LOCAL, STORAGE_DRIVER: 's3' })).toThrow(
      /STORAGE_ENDPOINT is required[\s\S]*STORAGE_SECRET_ACCESS_KEY is required/,
    );
  });

  it('refuses fake inference on a production worker unless explicitly allowed', () => {
    const base = {
      NODE_ENV: 'production',
      PROCESS_ROLE: 'worker',
      DATABASE_URL_WORKER: LOCAL,
      STORAGE_DRIVER: 's3',
      STORAGE_ENDPOINT: 'https://s3.example',
      STORAGE_BUCKET: 'recordings',
      STORAGE_ACCESS_KEY_ID: 'id',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
    };
    expect(() => parseEnv(base)).toThrow(/INFERENCE_ENGINE=fake/);
    expect(parseEnv({ ...base, INFERENCE_ALLOW_FAKE_IN_PRODUCTION: 'true' }).PROCESS_ROLE).toBe(
      'worker',
    );
  });

  it('refuses the OpenAI engine in production and requires its key elsewhere (decision 014)', () => {
    const production = {
      NODE_ENV: 'production',
      PROCESS_ROLE: 'worker',
      DATABASE_URL_WORKER: LOCAL,
      STORAGE_DRIVER: 's3',
      STORAGE_ENDPOINT: 'https://s3.example',
      STORAGE_BUCKET: 'recordings',
      STORAGE_ACCESS_KEY_ID: 'id',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
      INFERENCE_ENGINE: 'openai',
      OPENAI_API_KEY: 'sk-test',
    };
    expect(() => parseEnv(production)).toThrow(/INFERENCE_ENGINE=openai .* development/);
    expect(() => parseEnv({ DATABASE_URL: LOCAL, INFERENCE_ENGINE: 'openai' })).toThrow(
      /OPENAI_API_KEY is required/,
    );
    expect(
      parseEnv({ DATABASE_URL: LOCAL, INFERENCE_ENGINE: 'openai', OPENAI_API_KEY: 'k' })
        .OPENAI_ANALYSIS_MODEL,
    ).toBe('gpt-5.5');
  });
});
