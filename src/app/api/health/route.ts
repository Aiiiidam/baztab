import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { checkReadiness } from '@/services/health.service';

export const dynamic = 'force-dynamic';

/**
 * Readiness probe (tech spec §11): database reachable and schema at least the
 * latest migration this build ships. Excluded from the auth proxy so
 * orchestrators get a real 200/503. Liveness is /api/health/live.
 */
export async function GET() {
  const checks = await checkReadiness();
  if (checks.database === 'error') logger.error('Health check: database connectivity failed');
  if (checks.schema === 'behind')
    logger.error('Health check: database schema is behind this release');
  const healthy = checks.database === 'ok' && checks.schema !== 'behind';
  return NextResponse.json(
    { status: healthy ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
