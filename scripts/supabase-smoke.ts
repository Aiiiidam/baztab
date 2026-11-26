/**
 * Smoke test for a deployed Supabase project (tech spec §11, §12 "Infrastructure").
 * Uses only the credentials the web and worker receive, plus the migrate URL:
 *
 *   - each runtime role connects over verified TLS through Supavisor session mode,
 *     can read and write application tables, and cannot change the schema or
 *     read migration history;
 *   - every committed migration is applied;
 *   - the S3 adapter can put, head, read a range, download, list and delete a
 *     synthetic MP3 in the private bucket; the bucket rejects anonymous reads
 *     and non-MP3 content.
 *
 * Writes nothing that outlives the run.
 *
 *   npx tsx --env-file=.env.supabase scripts/supabase-smoke.ts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { S3Storage } from '@/services/storage/s3-storage';

const FIXTURE = 'e2e/fixtures/audio/20261020-escalated.mp3';

let failures = 0;
function check(name: string, passed: boolean, detail = ''): void {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function rejects(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.split('\n').at(-1)!.trim() : String(error);
  }
}

async function checkRuntimeRole(label: string, url: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const [who] = await prisma.$queryRaw<{ user: string; path: string }[]>`
      SELECT current_user AS "user", current_setting('search_path') AS path`;
    check(`${label}: connects over TLS`, true, `${who.user}, search_path ${who.path}`);

    const organizations = await prisma.organization.count();
    check(`${label}: reads application tables`, true, `${organizations} organizations`);

    // DML inside a transaction that is always rolled back.
    const wrote = await prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE organizations SET name = name WHERE false`;
        throw new Error('rollback');
      })
      .catch((error: Error) => error.message === 'rollback');
    check(`${label}: may write application tables`, wrote);

    const ddl = await rejects(prisma.$executeRawUnsafe('CREATE TABLE smoke_ddl (i int)'));
    check(`${label}: cannot create tables`, ddl !== null, ddl ?? 'table was created');
    if (ddl === null) await prisma.$executeRawUnsafe('DROP TABLE smoke_ddl');

    const history = await rejects(prisma.$queryRawUnsafe('SELECT 1 FROM _prisma_migrations'));
    check(`${label}: cannot read migration history`, history !== null);
  } catch (error) {
    check(`${label}: connects over TLS`, false, (error as Error).message.split('\n').at(-1));
  } finally {
    await prisma.$disconnect();
  }
}

async function checkMigrations(url: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const expected = readdirSync('prisma/migrations').filter((name) =>
      statSync(path.join('prisma/migrations', name)).isDirectory(),
    );
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const applied = new Set(rows.map((row) => row.migration_name));
    const missing = expected.filter((name) => !applied.has(name));
    check(
      'migrate: every local migration is applied',
      missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : `${applied.size} applied`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function checkStorage(): Promise<void> {
  const endpoint = required('STORAGE_ENDPOINT');
  const bucket = required('STORAGE_BUCKET');
  const storage = new S3Storage({
    endpoint,
    region: required('STORAGE_REGION'),
    bucket,
    accessKeyId: required('STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required('STORAGE_SECRET_ACCESS_KEY'),
  });
  const key = `smoke${Date.now().toString(36)}/smoke/original.mp3`;
  const bytes = statSync(FIXTURE).size;
  const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const scratch = path.join(tmpdir(), `baztab-smoke-${process.pid}.mp3`);

  try {
    await storage.put(key, FIXTURE, bytes, 'audio/mpeg');
    check('storage: put MP3', true, `${bytes} bytes`);

    const head = await storage.head(key);
    check('storage: head reports size', head?.bytes === bytes, `${head?.bytes}`);

    const range = await storage.read(key, { start: 100, end: 1123 });
    range?.body.resume();
    check(
      'storage: Range read',
      range?.contentLength === 1024 && range.totalBytes === bytes,
      `${range?.contentLength} of ${range?.totalBytes}`,
    );

    const downloaded = await storage.download(key, scratch);
    check('storage: download is byte-identical', downloaded && sha(scratch) === sha(FIXTURE));

    const usage = await storage.usage();
    check(
      'storage: list for usage',
      usage.objects >= 1,
      `${usage.objects} objects, ${usage.bytes} bytes`,
    );

    // Anonymous access through the public object URL must not work for a private bucket.
    const base = endpoint.replace(/\/s3\/?$/, '');
    const anonymous = await fetch(`${base}/object/public/${bucket}/${key}`);
    check('storage: anonymous read refused', !anonymous.ok, `HTTP ${anonymous.status}`);

    writeFileSync(scratch, 'not audio');
    const wrongType = await rejects(storage.put(key, scratch, 9, 'text/plain'));
    check('storage: non-MP3 content type refused', wrongType !== null, wrongType ?? 'accepted');
  } finally {
    await storage.delete(key);
    check('storage: delete', (await storage.head(key)) === null);
    rmSync(scratch, { force: true });
  }
}

async function main(): Promise<void> {
  await checkRuntimeRole('web', required('DATABASE_URL_WEB'));
  await checkRuntimeRole('worker', required('DATABASE_URL_WORKER'));
  await checkMigrations(required('DATABASE_URL_MIGRATE'));
  await checkStorage();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures ? 1 : 0;
}

void main();
