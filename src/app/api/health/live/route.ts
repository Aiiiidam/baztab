export const dynamic = 'force-dynamic';

/** Liveness (tech spec §11): the process answers. No database, so a DB outage never restarts the web. */
export function GET() {
  return Response.json({ status: 'alive' }, { headers: { 'Cache-Control': 'no-store' } });
}
