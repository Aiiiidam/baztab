/**
 * Migration guard (part of `npm run lint:all`). Some constraints and indexes
 * cannot be expressed in schema.prisma and are hand-written in migrations;
 * `prisma migrate diff` / `migrate dev` then propose dropping them in every
 * later migration. This check fails when a migration created after one of
 * them drops it again, so the drop never ships silently.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const HAND_WRITTEN = [
  'processing_jobs_one_active_per_call',
  'storage_ledger_non_negative',
  'storage_ledger_single_row',
  'calls_active_revision_same_call_fkey',
  'issue_findings_category_same_org_fkey',
];

const dir = path.resolve('prisma/migrations');
const migrations = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const problems = [];
for (const name of migrations) {
  const sql = readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
  for (const object of HAND_WRITTEN) {
    const drop = new RegExp(`DROP\\s+(CONSTRAINT|INDEX)\\s+(IF\\s+EXISTS\\s+)?"?${object}"?`, 'i');
    if (drop.test(sql)) problems.push(`${name}: drops hand-written "${object}"`);
  }
}

if (problems.length > 0) {
  console.error(
    'Migration check failed. Remove these generated statements (see AGENTS.md › Database):',
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Migration check passed (${migrations.length} migrations).`);
