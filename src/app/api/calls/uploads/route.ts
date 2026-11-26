import { authenticateRoute } from '@/lib/auth';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  scratchDir,
  streamUploadToScratch,
  sweepScratch,
  UploadStreamError,
} from '@/lib/upload-stream';
import { acceptUpload, type UploadResult } from '@/services/call.service';

/**
 * POST /api/calls/uploads — one multipart MP3 per request (tech spec §6, §9).
 * Authenticates itself (the proxy does not run for /api/*) and requires the
 * canonical Origin. Responds with a stable code the UI maps to Persian text:
 *
 *   201 accepted · 200 duplicate · 409 in_progress (Retry-After) ·
 *   413 too_large · 422 empty_file | unsupported_type | invalid_media ·
 *   507 storage_limit · 403 inactive_access · 503 transient_failure
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
/** Room for the multipart envelope around a file at the size limit. */
const ENVELOPE_BYTES = 64 * 1024;

function statusFor(result: UploadResult): number {
  switch (result.status) {
    case 'accepted':
      return 201;
    case 'duplicate':
      return 200;
    case 'in_progress':
      return 409;
    case 'rejected':
      switch (result.errorCode) {
        case 'too_large':
          return 413;
        case 'storage_limit':
          return 507;
        case 'inactive_access':
          return 403;
        case 'transient_failure':
          return 503;
        default:
          return 422;
      }
  }
}

function respond(result: UploadResult): Response {
  const headers: Record<string, string> = { ...NO_STORE };
  if (result.status === 'in_progress') headers['Retry-After'] = '5';
  return Response.json(result, { status: statusFor(result), headers });
}

export async function POST(request: Request): Promise<Response> {
  const member = await authenticateRoute(request);
  if (member instanceof Response) return member;

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > env.UPLOAD_MAX_BYTES + ENVELOPE_BYTES) {
    return respond({ status: 'rejected', errorCode: 'too_large' });
  }

  const dir = scratchDir(env.UPLOAD_SCRATCH_DIR);
  await sweepScratch(dir, env.UPLOAD_TIMEOUT_SECONDS * 2_000);

  let file;
  try {
    file = await streamUploadToScratch(request, {
      dir,
      maxBytes: env.UPLOAD_MAX_BYTES,
      timeoutMs: env.UPLOAD_TIMEOUT_SECONDS * 1000,
      field: 'file',
    });
  } catch (error) {
    if (error instanceof UploadStreamError) {
      if (error.code === 'too_large')
        return respond({ status: 'rejected', errorCode: 'too_large' });
      return Response.json(
        { status: 'rejected', errorCode: error.code },
        { status: 400, headers: NO_STORE },
      );
    }
    throw error;
  }

  try {
    return respond(await acceptUpload(member, file));
  } catch (error) {
    logger.error(
      { err: error, organizationId: member.organizationId },
      'Upload failed unexpectedly',
    );
    return respond({ status: 'rejected', errorCode: 'transient_failure' });
  } finally {
    await file.cleanup();
  }
}
