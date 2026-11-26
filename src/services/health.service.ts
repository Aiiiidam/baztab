import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';

/**
 * Readiness (tech spec §11): the database answers and its schema is at least
 * the latest migration this build ships. A web release deployed before
 * `baztab-migrate` ran reports "schema_behind" instead of serving errors.
 */

let latestShipped: string | null | undefined;

async function latestMigration(): Promise<string | null> {
  if (latestShipped !== undefined) return latestShipped;
  try {
    const entries = await readdir(path.join(process.cwd(), 'prisma', 'migrations'), {
      withFileTypes: true,
    });
    latestShipped =
      entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .at(-1) ?? null;
  } catch {
    latestShipped = null;
  }
  return latestShipped;
}

export type Readiness = { database: 'ok' | 'error'; schema: 'ok' | 'behind' | 'unknown' };

export async function checkReadiness(): Promise<Readiness> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return { database: 'error', schema: 'unknown' };
  }
  const latest = await latestMigration();
  if (!latest) return { database: 'ok', schema: 'unknown' };
  try {
    const rows = await prisma.$queryRaw<{ applied: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM _prisma_migrations
        WHERE migration_name = ${latest} AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      ) AS applied`;
    return { database: 'ok', schema: rows[0]?.applied ? 'ok' : 'behind' };
  } catch {
    // The runtime role may not read migration history (Supabase roles revoke it).
    return { database: 'ok', schema: 'unknown' };
  }
}
