import { authenticateRoute } from '@/lib/auth';
import { getCallDetail, recordAccess } from '@/services/call-query.service';

/**
 * GET /api/calls/:id — effective date and source, state, expected ready time,
 * audio/transcript availability and removal date, active analysis and review
 * (tech spec §9). A foreign or missing ID is the same generic 404.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const member = await authenticateRoute(request);
  if (member instanceof Response) return member;
  const { id } = await ctx.params;
  const call = await getCallDetail(member, id);
  if (!call) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  if (call.transcript) await recordAccess(member, call.id, 'TRANSCRIPT_VIEW');
  return Response.json(call, { headers: NO_STORE });
}
