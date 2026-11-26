import { prisma } from '@/lib/prisma';

/** Empty every application table (the migrations table stays). */
export async function resetDatabase(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  // The migration seeds the single storage-ledger row; restore it.
  await prisma.storageLedger.create({ data: { id: 1 } });
}

export { prisma };
