import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AuthMember } from '@/types/auth';
import { prisma } from './db';

export const AUDIO = path.resolve('e2e/fixtures/audio');

/** An organization with one member, as the session would present it. */
export async function makeMember(
  nationalId = '10380284790',
  name = 'سازمان آزمون',
): Promise<AuthMember> {
  const organization = await prisma.organization.create({ data: { nationalId, name } });
  const membership = await prisma.membership.create({
    data: {
      organizationId: organization.id,
      mobile: '09120000000',
      passwordHash: 'x',
      mustChangePassword: false,
    },
  });
  return {
    sessionId: 'test-session',
    membershipId: membership.id,
    organizationId: organization.id,
    organizationName: name,
    mobile: membership.mobile,
    mustChangePassword: false,
  };
}

export type ScratchFile = { filename: string; filePath: string; bytes: number; sha256: string };

/** Copy a fixture into a fresh scratch file, as the upload route would. */
export async function scratchCopy(fixture: string, filename = fixture): Promise<ScratchFile> {
  const dir = await mkdtemp(path.join(tmpdir(), 'baztab-int-'));
  const filePath = path.join(dir, 'upload.bin');
  await copyFile(path.join(AUDIO, fixture), filePath);
  const bytes = (await stat(filePath)).size;
  const sha256 = createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
  return { filename, filePath, bytes, sha256 };
}

/** A valid MP3 with different bytes: the fixture plus an appended unique ID3v1-free tail. */
export async function uniqueMp3(filename = 'unique.mp3'): Promise<ScratchFile> {
  const file = await scratchCopy('20261019_093015_09121234567.mp3', filename);
  const { appendFile } = await import('node:fs/promises');
  // Trailing junk after the last frame is ignored by decoders but changes the hash.
  await appendFile(file.filePath, randomBytes(16));
  const bytes = (await stat(file.filePath)).size;
  const sha256 = createHash('sha256')
    .update(await readFile(file.filePath))
    .digest('hex');
  return { ...file, bytes, sha256 };
}

export async function ledger() {
  const row = await prisma.storageLedger.findUniqueOrThrow({ where: { id: 1 } });
  return { committed: Number(row.committedBytes), reserved: Number(row.reservedBytes) };
}

/** Pretend the shared budget is nearly full: only `freeBytes` remain. */
export async function setFreeBudget(freeBytes: number, budget = 800_000_000) {
  await prisma.storageLedger.update({
    where: { id: 1 },
    data: { committedBytes: BigInt(budget - freeBytes), reservedBytes: 0n },
  });
}
