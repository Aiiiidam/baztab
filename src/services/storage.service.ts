import { env } from '@/lib/env';
import { FsStorage } from '@/services/storage/fs-storage';
import { S3Storage } from '@/services/storage/s3-storage';
import type { ObjectStorage } from '@/services/storage/types';

/**
 * Private recording storage behind one interface (tech spec §2, §10), so the
 * domain model never depends on the provider. `s3` is Supabase Storage through
 * its S3 endpoint with access keys only; `fs` is local development and tests.
 */
export type { ByteRange, ObjectRead, ObjectStorage } from '@/services/storage/types';

/** Generated object key. Never derived from the filename or any customer input. */
export function objectKeyFor(organizationId: string, callId: string): string {
  return `${organizationId}/${callId}/original.mp3`;
}

let instance: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  instance ??=
    env.STORAGE_DRIVER === 's3'
      ? new S3Storage({
          endpoint: env.STORAGE_ENDPOINT as string,
          region: env.STORAGE_REGION,
          bucket: env.STORAGE_BUCKET as string,
          accessKeyId: env.STORAGE_ACCESS_KEY_ID as string,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY as string,
        })
      : new FsStorage(env.STORAGE_FS_ROOT);
  return instance;
}

/** Test hook: use an explicit implementation (e.g. one that injects failures). */
export function setStorageForTests(storage: ObjectStorage | undefined): void {
  instance = storage;
}
