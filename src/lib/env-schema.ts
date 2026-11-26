import { z } from 'zod';

/**
 * Environment schema and parser, kept apart from `env.ts` so tests and the
 * worker build can call `parseEnv` without the `server-only` guard.
 *
 * One schema serves every process. `PROCESS_ROLE` picks the database URL
 * (tech spec §11: DATABASE_URL_WEB / _WORKER, with plain DATABASE_URL as the
 * local fallback) and which settings are mandatory in production. The
 * migration URL is never read here: only `prisma.config.ts` maps it.
 */

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const optionalUrl = z.url().optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PROCESS_ROLE: z.enum(['web', 'worker', 'cli']).default('web'),

  // ─── Database ──────────────────────────────────────────────────────────
  DATABASE_URL: optionalUrl,
  DATABASE_URL_WEB: optionalUrl,
  DATABASE_URL_WORKER: optionalUrl,
  PRISMA_LOG_QUERIES: booleanString,

  // ─── Web / sessions (tech spec §4) ─────────────────────────────────────
  APP_ORIGIN: z.url().optional(),
  PORT: int(3000),
  REPORT_TIME_ZONE: z.string().default('Asia/Tehran'),
  SKIP_AUTH: booleanString,
  SESSION_IDLE_HOURS: int(24),
  SESSION_ABSOLUTE_DAYS: int(7),
  INITIAL_PASSWORD_EXPIRY_DAYS: int(7),
  LOGIN_ACCOUNT_MAX_FAILURES: int(5),
  LOGIN_SOURCE_MAX_FAILURES: int(30),
  LOGIN_WINDOW_MINUTES: int(15),
  /** Reverse proxies in front of the web app; the client address is that many entries from the end of X-Forwarded-For. */
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(1),

  // ─── Upload and media (tech spec §6) ───────────────────────────────────
  UPLOAD_MAX_BYTES: int(10 * 1024 * 1024),
  UPLOAD_MAX_FILES: int(50),
  UPLOAD_CONCURRENCY: int(2),
  UPLOAD_TIMEOUT_SECONDS: int(120),
  UPLOAD_SCRATCH_DIR: z.string().optional(),
  UPLOAD_RESERVATION_TTL_MINUTES: int(30),
  FILENAME_DATE_MIN: z.iso.date().default('2020-01-01'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  MEDIA_PROBE_TIMEOUT_MS: int(15_000),

  // ─── Storage, retention and budget (tech spec §10) ─────────────────────
  STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
  STORAGE_FS_ROOT: z.string().default('.storage'),
  STORAGE_ALLOW_FS_IN_PRODUCTION: booleanString,
  STORAGE_ENDPOINT: optionalUrl,
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_BUDGET_BYTES: int(800_000_000),
  STORAGE_ALERT_RATIO: z.coerce.number().min(0).max(1).default(0.7),
  EGRESS_MONTHLY_BYTES: int(5_000_000_000),
  RETENTION_DAYS: int(10),

  // ─── Worker and inference (tech spec §7, §8) ───────────────────────────
  WORKER_CONCURRENCY: int(1),
  WORKER_LEASE_SECONDS: int(120),
  WORKER_POLL_SECONDS: int(5),
  WORKER_MAX_ATTEMPTS: int(3),
  /** First retry delay; later ones grow ×4 up to 30 minutes. */
  WORKER_BACKOFF_BASE_SECONDS: int(30),
  WORKER_SHUTDOWN_GRACE_SECONDS: int(30),
  WORKER_MAINTENANCE_SECONDS: int(300),
  WORKER_SCRATCH_DIR: z.string().optional(),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().optional(),
  INFERENCE_ENGINE: z.enum(['fake', 'openai']).default('fake'),
  INFERENCE_ALLOW_FAKE_IN_PRODUCTION: booleanString,
  /** Development and evaluation only (decision 014): refused in production. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  OPENAI_TRANSCRIBE_MODEL: z.string().min(1).default('gpt-4o-transcribe-diarize'),
  OPENAI_ANALYSIS_MODEL: z.string().min(1).default('gpt-5.5'),
  OPENAI_TIMEOUT_SECONDS: int(300),

  // ─── Logging ───────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

type Parsed = z.infer<typeof schema>;

export type Env = Omit<Parsed, 'DATABASE_URL' | 'APP_ORIGIN'> & {
  /** The connection string for this process role. */
  DATABASE_URL: string;
  APP_ORIGIN: string;
};

export type EnvSource = Record<string, string | undefined>;

export type ParseOptions = {
  /**
   * `next build` evaluates server modules with NODE_ENV=production but only a
   * placeholder DATABASE_URL; runtime-only production requirements are checked
   * when the server boots instead. The SKIP_AUTH refusal applies to builds too.
   */
  building?: boolean;
};

export function parseEnv(source: EnvSource, options: ParseOptions = {}): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}\nSee .env.example.`);
  }
  const data = parsed.data;
  const problems: string[] = [];
  const production = data.NODE_ENV === 'production';
  const productionRuntime = production && !options.building;

  const roleUrl =
    data.PROCESS_ROLE === 'worker'
      ? data.DATABASE_URL_WORKER
      : data.PROCESS_ROLE === 'web'
        ? data.DATABASE_URL_WEB
        : undefined;
  const databaseUrl = roleUrl ?? data.DATABASE_URL;
  if (!databaseUrl) {
    problems.push(
      `DATABASE_URL_${data.PROCESS_ROLE.toUpperCase()} (or DATABASE_URL for local work) is required`,
    );
  }

  if (data.SKIP_AUTH && production) {
    problems.push('SKIP_AUTH=true is not allowed when NODE_ENV=production.');
  }
  if (productionRuntime && data.PROCESS_ROLE === 'web' && !data.APP_ORIGIN) {
    problems.push('APP_ORIGIN is required in production (the canonical https:// origin)');
  }
  if (data.STORAGE_DRIVER === 's3') {
    for (const key of [
      'STORAGE_ENDPOINT',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
    ] as const) {
      if (!data[key]) problems.push(`${key} is required when STORAGE_DRIVER=s3`);
    }
  } else if (
    productionRuntime &&
    data.PROCESS_ROLE !== 'cli' &&
    !data.STORAGE_ALLOW_FS_IN_PRODUCTION
  ) {
    problems.push(
      'STORAGE_DRIVER=fs is for local development; production uses s3 (STORAGE_ALLOW_FS_IN_PRODUCTION=true for a local compose stack)',
    );
  }
  if (
    productionRuntime &&
    data.PROCESS_ROLE === 'worker' &&
    data.INFERENCE_ENGINE === 'fake' &&
    !data.INFERENCE_ALLOW_FAKE_IN_PRODUCTION
  ) {
    problems.push(
      'INFERENCE_ENGINE=fake produces synthetic results; set INFERENCE_ALLOW_FAKE_IN_PRODUCTION=true only on synthetic staging',
    );
  }
  if (data.INFERENCE_ENGINE === 'openai') {
    // Tech spec §2: customer audio and transcripts never go to an external AI API in production.
    if (productionRuntime) {
      problems.push(
        'INFERENCE_ENGINE=openai sends audio to an external API and is for development and evaluation only (tech spec §2, decision 014)',
      );
    }
    if (!data.OPENAI_API_KEY)
      problems.push('OPENAI_API_KEY is required when INFERENCE_ENGINE=openai');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment variables:\n${problems.map((p) => `  ${p}`).join('\n')}\nSee .env.example.`,
    );
  }

  return {
    ...data,
    DATABASE_URL: databaseUrl as string,
    APP_ORIGIN: data.APP_ORIGIN ?? `http://localhost:${data.PORT}`,
  };
}
