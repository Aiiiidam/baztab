import type { CallState } from '@prisma/client';
import { authenticateRoute } from '@/lib/auth';
import { listCalls } from '@/services/call-query.service';
import { drillDownFilter } from '@/services/report.service';

/**
 * GET /api/calls — the logical list contract of tech spec §9: cursor paging,
 * search by call ID / filename / issue, filters for state, issue and inclusive
 * date bounds, stable order by call date then ID. A thin handler over the same
 * services the page uses (plan A8); no extra business logic.
 */
export const dynamic = 'force-dynamic';

const STATES: CallState[] = ['QUEUED', 'PROCESSING', 'READY', 'FAILED'];

export async function GET(request: Request) {
  const member = await authenticateRoute(request);
  if (member instanceof Response) return member;
  const params = new URL(request.url).searchParams;
  const state = STATES.find((value) => value === params.get('state')) ?? null;
  const drill = await drillDownFilter(member, {
    issue: params.get('issue'),
    from: params.get('from'),
    to: params.get('to'),
  });
  const page = await listCalls(member, {
    search: params.get('q'),
    state,
    cursor: params.get('cursor'),
    limit: Number(params.get('limit') ?? 25) || 25,
    where: drill?.where,
  });
  return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
}
