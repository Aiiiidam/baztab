import { authenticateRoute } from '@/lib/auth';
import { defaultRange, getIssueReport, parseRange } from '@/services/report.service';

/**
 * GET /api/reports/issues — analyzed-call total and ranks for inclusive date
 * bounds, each with the drill-down filter that lists exactly its calls
 * (tech spec §9).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const member = await authenticateRoute(request);
  if (member instanceof Response) return member;
  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get('from'), params.get('to')) ?? defaultRange();
  const report = await getIssueReport(member, range);
  return Response.json(
    {
      ...report,
      ranks: report.ranks.map((rank) => ({
        ...rank,
        drillDown: { issue: rank.categoryId, from: range.from, to: range.to },
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
