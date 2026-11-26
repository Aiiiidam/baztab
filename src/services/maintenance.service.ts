import { purgeExpiredSessions } from '@/services/auth.service';
import { reconcileReservations } from '@/services/call.service';
import { reclaimExpiredLeases } from '@/services/queue.service';
import { purgeExpiredRateLimits } from '@/services/rate-limit.service';
import {
  deleteExpiredObjects,
  expireRecordings,
  reconcileLedger,
} from '@/services/retention.service';

/**
 * One bounded maintenance pass run by the worker (decision 010). Each step is
 * idempotent and safe to repeat after a crash; the pass returns counts only.
 */
export async function runMaintenance(now = new Date()) {
  const leases = await reclaimExpiredLeases(now);
  const reservations = await reconcileReservations(now);
  const expired = await expireRecordings(now);
  const objects = await deleteExpiredObjects(now);
  const ledger = await reconcileLedger(now);
  const sessions = await purgeExpiredSessions(now);
  const rateLimits = await purgeExpiredRateLimits(now);
  return {
    leasesRequeued: leases.requeued,
    leasesFailed: leases.failed,
    reservationsFinalized: reservations.finalized,
    reservationsReleased: reservations.released,
    recordingsExpired: expired,
    objectsDeleted: objects.deleted,
    objectDeletesFailed: objects.failed,
    storageUsageRatio: Number(ledger.usageRatio.toFixed(4)),
    sessionsPurged: sessions,
    rateLimitsPurged: rateLimits,
  };
}
