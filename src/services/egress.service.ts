import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { utc } from '@/services/sql';

/**
 * Monthly storage egress (tech spec §10, plan M5-T5): bytes the app reads from
 * storage for playback and worker fetches, counted per UTC month. Logs one
 * alert when the month crosses STORAGE_ALERT_RATIO of EGRESS_MONTHLY_BYTES.
 * Best effort: a failed count never blocks playback or processing.
 */
export async function recordEgress(bytes: number, now = new Date()): Promise<void> {
  if (bytes <= 0) return;
  const month = now.toISOString().slice(0, 7);
  try {
    const rows = await prisma.$queryRaw<{ before: bigint; after: bigint }[]>`
      INSERT INTO egress_usage (month, bytes, "updatedAt") VALUES (${month}, ${bytes}, ${utc(now)})
      ON CONFLICT (month) DO UPDATE SET bytes = egress_usage.bytes + ${bytes}, "updatedAt" = ${utc(now)}
      RETURNING bytes - ${bytes} AS before, bytes AS after`;
    const threshold = env.EGRESS_MONTHLY_BYTES * env.STORAGE_ALERT_RATIO;
    const row = rows[0];
    if (row && Number(row.before) < threshold && Number(row.after) >= threshold) {
      logger.warn({ month, bytes: Number(row.after) }, 'egress_budget_alert');
    }
  } catch (err) {
    logger.error({ err }, 'Recording egress failed');
  }
}
