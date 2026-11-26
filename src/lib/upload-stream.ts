import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import Busboy from 'busboy';

/**
 * Stream one multipart file field to a scratch file while hashing it (tech
 * spec §6). Bounded: the file is cut off one byte past `maxBytes`, the whole
 * request has a time limit, and only one file part is read. The caller owns
 * the scratch file and must call `cleanup()` on every outcome.
 */

export type StreamedFile = {
  filename: string;
  filePath: string;
  bytes: number;
  sha256: string;
  cleanup: () => Promise<void>;
};

export class UploadStreamError extends Error {
  constructor(readonly code: 'too_large' | 'no_file' | 'malformed' | 'timeout') {
    super(code);
    this.name = 'UploadStreamError';
  }
}

export function scratchDir(configured?: string): string {
  return configured ?? path.join(tmpdir(), 'baztab-uploads');
}

/** Remove scratch files left behind by a crash or restart (older than `maxAgeMs`). */
export async function sweepScratch(dir: string, maxAgeMs: number, now = Date.now()): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(dir, entry);
      try {
        if (now - (await stat(file)).mtimeMs > maxAgeMs) await rm(file, { force: true });
      } catch {
        // Raced with another sweep or the owning request; nothing to do.
      }
    }),
  );
}

export async function streamUploadToScratch(
  request: Request,
  options: { dir: string; maxBytes: number; timeoutMs: number; field?: string },
): Promise<StreamedFile> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!request.body || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new UploadStreamError('malformed');
  }
  await mkdir(options.dir, { recursive: true });
  const filePath = path.join(options.dir, `${randomUUID()}.part`);
  const cleanup = () => rm(filePath, { force: true });

  return new Promise<StreamedFile>((resolve, reject) => {
    let settled = false;
    let sawFile = false;
    let filename = '';
    let bytes = 0;
    let tooLarge = false;
    const hash = createHash('sha256');
    let fileDone: Promise<void> = Promise.resolve();

    const fail = (error: UploadStreamError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      source.destroy();
      void cleanup().finally(() => reject(error));
    };
    const timer = setTimeout(() => fail(new UploadStreamError('timeout')), options.timeoutMs);

    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: { 'content-type': contentType },
        // Persian filenames arrive as UTF-8 in the Content-Disposition header.
        defParamCharset: 'utf8',
        limits: { files: 1, fileSize: options.maxBytes + 1, fields: 4, parts: 6 },
      });
    } catch {
      clearTimeout(timer);
      reject(new UploadStreamError('malformed'));
      return;
    }

    parser.on('file', (field, stream, info) => {
      if (sawFile || (options.field && field !== options.field)) {
        stream.resume();
        return;
      }
      sawFile = true;
      filename = info.filename ?? '';
      const out = createWriteStream(filePath);
      fileDone = new Promise<void>((done, error) => {
        out.on('finish', done);
        out.on('error', error);
      });
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      stream.on('limit', () => {
        tooLarge = true;
      });
      stream.pipe(out);
    });

    parser.on('error', () => fail(new UploadStreamError('malformed')));
    parser.on('close', () => {
      void fileDone.then(
        () => {
          if (settled) return;
          if (!sawFile) return fail(new UploadStreamError('no_file'));
          if (tooLarge || bytes > options.maxBytes) return fail(new UploadStreamError('too_large'));
          settled = true;
          clearTimeout(timer);
          resolve({ filename, filePath, bytes, sha256: hash.digest('hex'), cleanup });
        },
        () => fail(new UploadStreamError('malformed')),
      );
    });

    const source = Readable.fromWeb(request.body as unknown as WebReadableStream);
    source.on('error', () => fail(new UploadStreamError('malformed')));
    source.pipe(parser);
  });
}
