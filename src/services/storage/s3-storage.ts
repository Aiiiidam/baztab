import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { assertValidKey, type ByteRange, type ObjectRead, type ObjectStorage } from './types';

/**
 * Supabase Storage through its S3-compatible endpoint (tech spec §4, §11).
 * Access keys only: never the service-role or anon key. Errors never include
 * the object key in what we log upstream; callers log codes only.
 */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata.httpStatusCode === 404)
  );
}

function totalFromContentRange(header: string | undefined, fallback: number): number {
  const total = header ? Number(/\/(\d+)$/.exec(header)?.[1]) : NaN;
  return Number.isFinite(total) ? total : fallback;
}

export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, filePath: string, bytes: number, contentType: string): Promise<void> {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: bytes,
        ContentType: contentType,
      }),
    );
  }

  async read(key: string, range?: ByteRange): Promise<ObjectRead | null> {
    assertValidKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      );
      const contentLength = response.ContentLength ?? 0;
      return {
        body: response.Body as Readable,
        contentLength,
        totalBytes: totalFromContentRange(response.ContentRange, contentLength),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async download(key: string, destination: string): Promise<boolean> {
    const object = await this.read(key);
    if (!object) return false;
    await pipeline(object.body, createWriteStream(destination));
    return true;
  }

  async head(key: string): Promise<{ bytes: number } | null> {
    assertValidKey(key);
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { bytes: response.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async usage(): Promise<{ objects: number; bytes: number }> {
    let objects = 0;
    let bytes = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) {
        objects += 1;
        bytes += item.Size ?? 0;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return { objects, bytes };
  }
}
