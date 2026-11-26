import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptUpload, reconcileReservations } from '@/services/call.service';
import { FsStorage } from '@/services/storage/fs-storage';
import type { ObjectStorage } from '@/services/storage/types';
import { getStorage, objectKeyFor, setStorageForTests } from '@/services/storage.service';
import { prisma, resetDatabase } from './db';
import { ledger, makeMember, scratchCopy, setFreeBudget, uniqueMp3 } from './fixtures';

beforeEach(resetDatabase);
afterEach(() => setStorageForTests(undefined));

const ACCEPTED_AT = new Date('2026-11-26T08:00:00Z'); // 11:30 Tehran

describe('acceptUpload (P1-01, tech spec §6)', () => {
  it('stores the call, queues the first job and commits the bytes in one step', async () => {
    const member = await makeMember();
    const file = await scratchCopy('20261019_093015_09121234567.mp3');
    const result = await acceptUpload(member, { ...file, acceptedAt: ACCEPTED_AT });

    expect(result).toMatchObject({
      status: 'accepted',
      effectiveDate: '2026-10-19',
      dateSource: 'FILENAME',
      state: 'QUEUED',
      readyAt: '2026-11-27T05:30:00.000Z',
    });
    const callId = (result as { callId: string }).callId;
    const call = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: { recording: true, jobs: true, fingerprint: true },
    });
    expect(call.originalFilename).toBe('20261019_093015_09121234567.mp3');
    expect(call.recording).toMatchObject({
      state: 'STORED',
      objectKey: objectKeyFor(member.organizationId, callId),
      bytes: file.bytes,
      expiresAt: new Date('2026-12-06T08:00:00Z'),
    });
    expect(call.recording!.durationMs).toBeGreaterThanOrEqual(5900);
    expect(call.recording!.durationMs).toBeLessThanOrEqual(6100);
    expect(call.jobs).toHaveLength(1);
    expect(call.jobs[0]).toMatchObject({ state: 'QUEUED', trigger: 'INITIAL', attempt: 0 });
    expect(call.fingerprint?.sha256).toBe(file.sha256);
    expect(await ledger()).toEqual({ committed: file.bytes, reserved: 0 });
    expect(await getStorage().head(call.recording!.objectKey)).toEqual({ bytes: file.bytes });
  });

  it('accepts Persian and date-less names without a warning, dated by the Tehran upload day', async () => {
    const member = await makeMember();
    const persian = await acceptUpload(member, {
      ...(await scratchCopy('تماس پشتیبانی بدون تاریخ.mp3')),
      acceptedAt: new Date('2026-11-26T21:00:00Z'), // 00:30 on 27 Nov in Tehran
    });
    expect(persian).toMatchObject({
      status: 'accepted',
      effectiveDate: '2026-11-27',
      dateSource: 'UPLOAD',
    });
    expect((persian as { readyAt: string }).readyAt).toBe('2026-11-28T05:30:00.000Z');

    const longPrefix = await acceptUpload(member, {
      ...(await scratchCopy('2026101912 long prefix.mp3')),
      acceptedAt: ACCEPTED_AT,
    });
    expect(longPrefix).toMatchObject({ status: 'accepted', dateSource: 'UPLOAD' });
  });

  it.each([
    ['corrupt.mp3', 'invalid_media'],
    ['wav-renamed.mp3', 'invalid_media'],
    ['empty.mp3', 'empty_file'],
    ['notes.txt', 'unsupported_type'],
  ])('rejects %s with %s and stores nothing', async (fixture, errorCode) => {
    const member = await makeMember();
    const result = await acceptUpload(member, await scratchCopy(fixture));
    expect(result).toEqual({ status: 'rejected', errorCode });
    expect(await prisma.call.count()).toBe(0);
    expect(await ledger()).toEqual({ committed: 0, reserved: 0 });
  });

  it('skips an exact duplicate and returns the existing call', async () => {
    const member = await makeMember();
    const first = await acceptUpload(member, await scratchCopy('20261020-escalated.mp3'));
    const again = await acceptUpload(
      member,
      await scratchCopy('20261020-escalated.mp3', 'renamed.mp3'),
    );
    expect(again).toMatchObject({
      status: 'duplicate',
      callId: (first as { callId: string }).callId,
    });
    expect(await prisma.call.count()).toBe(1);
  });

  it('treats the same file in two organizations as two calls', async () => {
    const a = await makeMember('10380284790', 'الف');
    const b = await makeMember('14006278561', 'ب');
    const file = '20261020-escalated.mp3';
    expect((await acceptUpload(a, await scratchCopy(file))).status).toBe('accepted');
    expect((await acceptUpload(b, await scratchCopy(file))).status).toBe('accepted');
    expect(await prisma.call.count()).toBe(2);
  });

  it('turns a race of two identical files into exactly one call', async () => {
    const member = await makeMember();
    const results = await Promise.all([
      acceptUpload(member, await scratchCopy('20261021 insufficient.mp3')),
      acceptUpload(member, await scratchCopy('20261021 insufficient.mp3')),
      acceptUpload(member, await scratchCopy('20261021 insufficient.mp3')),
    ]);
    expect(results.filter((r) => r.status === 'accepted')).toHaveLength(1);
    expect(results.every((r) => ['accepted', 'duplicate', 'in_progress'].includes(r.status))).toBe(
      true,
    );
    expect(await prisma.call.count()).toBe(1);
    expect(await prisma.processingJob.count()).toBe(1);
  });
});

describe('storage budget (tech spec §10, plan M2-T5 quota reservation)', () => {
  it('admits exactly one of two different files when only one fits', async () => {
    const member = await makeMember();
    const one = await uniqueMp3('a.mp3');
    const two = await uniqueMp3('b.mp3');
    await setFreeBudget(one.bytes + Math.floor(two.bytes / 2));

    const results = await Promise.all([acceptUpload(member, one), acceptUpload(member, two)]);
    const statuses = results.map((r) => (r.status === 'rejected' ? r.errorCode : r.status)).sort();
    expect(statuses).toEqual(['accepted', 'storage_limit']);
  });

  it('never pushes committed + reserved above the cap under ten parallel uploads', async () => {
    const member = await makeMember();
    const files = await Promise.all(Array.from({ length: 10 }, (_, i) => uniqueMp3(`p${i}.mp3`)));
    const fits = 4;
    await setFreeBudget(files[0].bytes * fits + 3);

    const results = await Promise.all(files.map((file) => acceptUpload(member, file)));
    const accepted = results.filter((r) => r.status === 'accepted').length;
    expect(accepted).toBe(fits);
    const after = await ledger();
    expect(after.reserved).toBe(0);
    expect(after.committed).toBeLessThanOrEqual(800_000_000);
  });

  it('releases the reserved bytes when storing the object fails', async () => {
    const member = await makeMember();
    const failing: ObjectStorage = Object.assign(Object.create(new FsStorage('.storage-test')), {
      put: async () => {
        throw new Error('storage down');
      },
    });
    setStorageForTests(failing);
    const result = await acceptUpload(member, await uniqueMp3());
    expect(result).toEqual({ status: 'rejected', errorCode: 'transient_failure' });
    expect(await ledger()).toEqual({ committed: 0, reserved: 0 });
    expect(await prisma.call.count()).toBe(0);

    // A retry of the same file is now safe.
    setStorageForTests(undefined);
    expect((await acceptUpload(member, await uniqueMp3())).status).toBe('accepted');
  });
});

describe('reconcileReservations', () => {
  async function strandedReservation(storeObject: boolean) {
    const member = await makeMember();
    const file = await uniqueMp3();
    // Simulate a crash between reservation and finalization.
    const call = await prisma.call.create({
      data: {
        organizationId: member.organizationId,
        acceptedAt: new Date('2026-11-26T07:00:00Z'),
        effectiveDate: new Date('2026-11-26T00:00:00Z'),
        dateSource: 'UPLOAD',
        originalFilename: file.filename,
        state: 'UPLOADING',
        createdAt: new Date('2026-11-26T07:00:00Z'),
      },
    });
    const objectKey = objectKeyFor(member.organizationId, call.id);
    await prisma.recording.create({
      data: {
        organizationId: member.organizationId,
        callId: call.id,
        objectKey,
        bytes: file.bytes,
        durationMs: 6000,
        contentType: 'audio/mpeg',
        expiresAt: new Date('2026-12-06T07:00:00Z'),
      },
    });
    await prisma.recordingFingerprint.create({
      data: { organizationId: member.organizationId, sha256: file.sha256, callId: call.id },
    });
    await prisma.storageLedger.update({ where: { id: 1 }, data: { reservedBytes: file.bytes } });
    if (storeObject) await getStorage().put(objectKey, file.filePath, file.bytes, 'audio/mpeg');
    return { call, file };
  }

  it('finalizes a reservation whose object was stored intact', async () => {
    const { call, file } = await strandedReservation(true);
    expect(await reconcileReservations(new Date('2026-11-26T08:00:00Z'))).toEqual({
      finalized: 1,
      released: 0,
    });
    expect((await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).state).toBe('QUEUED');
    expect(await prisma.processingJob.count()).toBe(1);
    expect(await ledger()).toEqual({ committed: file.bytes, reserved: 0 });
  });

  it('releases a reservation whose object never arrived, and skips fresh ones', async () => {
    await strandedReservation(false);
    expect(await reconcileReservations(new Date('2026-11-26T07:10:00Z'))).toEqual({
      finalized: 0,
      released: 0,
    });
    expect(await reconcileReservations(new Date('2026-11-26T08:00:00Z'))).toEqual({
      finalized: 0,
      released: 1,
    });
    expect(await prisma.call.count()).toBe(0);
    expect(await ledger()).toEqual({ committed: 0, reserved: 0 });
  });
});

describe('tenant-consistent foreign keys (decision 009)', () => {
  it('rejects a child row that points at another organization’s call', async () => {
    const a = await makeMember('10380284790', 'الف');
    const b = await makeMember('14006278561', 'ب');
    const result = await acceptUpload(a, await uniqueMp3());
    const callId = (result as { callId: string }).callId;
    await expect(
      prisma.processingJob.create({
        data: {
          organizationId: b.organizationId,
          callId,
          maxAttempts: 3,
          runAfter: new Date(),
          enqueuedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/);
    await expect(
      prisma.accessLog.create({
        data: {
          organizationId: a.organizationId,
          callId,
          membershipId: b.membershipId,
          action: 'AUDIO_PLAYBACK',
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/);
  });

  it('allows only one active job per call', async () => {
    const member = await makeMember();
    const result = await acceptUpload(member, await uniqueMp3());
    const callId = (result as { callId: string }).callId;
    await expect(
      prisma.processingJob.create({
        data: {
          organizationId: member.organizationId,
          callId,
          maxAttempts: 3,
          runAfter: new Date(),
          enqueuedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });
});
