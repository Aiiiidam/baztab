import { Readable } from 'node:stream';
import { authenticateRoute } from '@/lib/auth';
import { parseRange } from '@/lib/http-range';
import { logger } from '@/lib/logger';
import { getAudio, recordAccess } from '@/services/call-query.service';
import { recordEgress } from '@/services/egress.service';

/**
 * GET /api/calls/:id/audio — same-origin Range playback (tech spec §6).
 * Session, organization and expiry are checked on every request, so a revoked
 * member or an expired recording stops at once. No storage URL or credential
 * reaches the browser; responses are `private, no-store`. A request starting
 * at byte 0 opens a playback session and writes one access-log row.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = 'private, no-store';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const member = await authenticateRoute(request);
  if (member instanceof Response) return member;
  const { id } = await ctx.params;

  const audio = await getAudio(member, id);
  if (audio.status === 'not_found') {
    return Response.json(
      { error: 'not_found' },
      { status: 404, headers: { 'Cache-Control': NO_STORE } },
    );
  }
  if (audio.status === 'unavailable') {
    return Response.json(
      { error: 'audio_unavailable' },
      { status: 410, headers: { 'Cache-Control': NO_STORE } },
    );
  }

  const range = parseRange(request.headers.get('range'), audio.totalBytes);
  if (range.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${audio.totalBytes}`, 'Cache-Control': NO_STORE },
    });
  }

  const object = await audio.open(range.kind === 'range' ? range : undefined);
  if (!object) {
    logger.error({ callId: id }, 'Recording object missing from storage');
    return Response.json(
      { error: 'audio_unavailable' },
      { status: 410, headers: { 'Cache-Control': NO_STORE } },
    );
  }

  await recordEgress(object.contentLength);
  if (range.kind === 'none' || range.start === 0) {
    await recordAccess(member, id, 'AUDIO_PLAYBACK');
  }

  const headers: Record<string, string> = {
    'Content-Type': audio.contentType,
    'Content-Length': String(object.contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': NO_STORE,
    'Content-Disposition': 'inline',
  };
  if (range.kind === 'range') {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${object.totalBytes}`;
  }
  return new Response(Readable.toWeb(object.body) as ReadableStream, {
    status: range.kind === 'range' ? 206 : 200,
    headers,
  });
}
