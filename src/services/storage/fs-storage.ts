import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey, type ByteRange, type ObjectRead, type ObjectStorage } from './types';

/** Local filesystem storage for development and tests (STORAGE_DRIVER=fs). */
export class FsStorage implements ObjectStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    assertValidKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  async put(key: string, filePath: string): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.partial`;
    await copyFile(filePath, partial);
    await rename(partial, target);
  }

  async read(key: string, range?: ByteRange): Promise<ObjectRead | null> {
    const size = await this.head(key);
    if (!size) return null;
    const file = this.pathFor(key);
    if (!range) {
      return { body: createReadStream(file), contentLength: size.bytes, totalBytes: size.bytes };
    }
    return {
      body: createReadStream(file, { start: range.start, end: range.end }),
      contentLength: range.end - range.start + 1,
      totalBytes: size.bytes,
    };
  }

  async download(key: string, destination: string): Promise<boolean> {
    if (!(await this.head(key))) return false;
    await copyFile(this.pathFor(key), destination);
    return true;
  }

  async head(key: string): Promise<{ bytes: number } | null> {
    try {
      const info = await stat(this.pathFor(key));
      return info.isFile() ? { bytes: info.size } : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async usage(): Promise<{ objects: number; bytes: number }> {
    let objects = 0;
    let bytes = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name === 'original.mp3') {
          objects += 1;
          bytes += (await stat(full)).size;
        }
      }
    };
    await walk(this.root);
    return { objects, bytes };
  }
}
