import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/errors';
import { processJob } from '@/services/analysis.service';
import { resolveSession, signIn } from '@/services/auth.service';
import { acceptUpload } from '@/services/call.service';
import { createFakeEngine } from '@/services/inference/fake';
import {
  activateCandidate,
  deleteOrganization,
  discardCandidate,
  provisionMember,
  reprocessCall,
} from '@/services/operator.service';
import { claimNextJob } from '@/services/queue.service';
import { saveCorrections } from '@/services/review.service';
import { FsStorage } from '@/services/storage/fs-storage';
import { getStorage, setStorageForTests } from '@/services/storage.service';
import type { AuthMember } from '@/types/auth';
import { prisma, resetDatabase } from './db';
import { ledger, scratchCopy } from './fixtures';

beforeEach(resetDatabase);
afterEach(() => setStorageForTests(undefined));

const engine = createFakeEngine();
const signal = new AbortController().signal;
const ORG_A = { nationalId: '10380284790', organizationName: 'الف' };
const ORG_B = { nationalId: '14006278561', organizationName: 'ب' };
const MOBILE = '09120000000';

async function member(org: typeof ORG_A): Promise<AuthMember & { token: string }> {
  const { initialPassword } = await provisionMember({ operator: 'op', ...org, mobile: MOBILE });
  const session = await signIn({ ...org, mobile: MOBILE, password: initialPassword!, source: 'x' });
  const resolved = (await resolveSession(session.token))!;
  return { ...resolved, token: session.token };
}

async function drain() {
  for (;;) {
    await prisma.processingJob.updateMany({
      where: { state: 'QUEUED' },
      data: { runAfter: new Date(0) },
    });
    const job = await claimNextJob();
    if (!job) return;
    await processJob(job, engine, signal);
  }
}

async function upload(m: AuthMember, fixture: string) {
  const result = await acceptUpload(m, await scratchCopy(fixture));
  return (result as { callId: string }).callId;
}

describe('operator reprocess (tech spec §7, M5-T6)', () => {
  it('activates a reprocessed revision when nothing was corrected', async () => {
    const m = await member(ORG_A);
    const callId = await upload(m, '20261020-escalated.mp3');
    await drain();
    await reprocessCall({ operator: 'op', callId });
    await drain();
    const call = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: { activeRevision: true },
    });
    expect(call.activeRevision).toMatchObject({
      version: 2,
      reason: 'REPROCESS',
      status: 'PUBLISHED',
    });
  });

  it('holds the result as a candidate over human-set fields until an audited command decides', async () => {
    const m = await member(ORG_A);
    const callId = await upload(m, '20261020-escalated.mp3');
    await drain();
    const active = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: { activeRevision: { include: { findings: true } } },
    });
    const finding = active.activeRevision!.findings[0];
    const { revisionId: corrected } = await saveCorrections(m, {
      callId,
      revisionId: active.activeRevision!.id,
      findings: [{ findingId: finding.id, categoryId: finding.categoryId, outcome: 'RESOLVED' }],
      scores: [],
    });

    await reprocessCall({ operator: 'op', callId });
    await drain();
    const candidate = await prisma.analysisRevision.findFirstOrThrow({
      where: { callId, status: 'CANDIDATE' },
    });
    expect((await prisma.call.findUniqueOrThrow({ where: { id: callId } })).activeRevisionId).toBe(
      corrected,
    );

    await discardCandidate({ operator: 'op', callId, revisionId: candidate.id });
    expect(
      (await prisma.analysisRevision.findUniqueOrThrow({ where: { id: candidate.id } })).status,
    ).toBe('DISCARDED');

    await reprocessCall({ operator: 'op', callId });
    await drain();
    const second = await prisma.analysisRevision.findFirstOrThrow({
      where: { callId, status: 'CANDIDATE' },
    });
    await activateCandidate({ operator: 'op', callId, revisionId: second.id });
    expect((await prisma.call.findUniqueOrThrow({ where: { id: callId } })).activeRevisionId).toBe(
      second.id,
    );
    const actions = (await prisma.operatorAudit.findMany()).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'call.reprocess',
        'revision.discard_candidate',
        'revision.activate_candidate',
      ]),
    );
  });
});

describe('organization deletion (tech spec §4 offboarding, M5-T6)', () => {
  it('blocks access at once, fences in-flight work, survives a storage failure and finishes on re-run', async () => {
    const a = await member(ORG_A);
    const b = await member(ORG_B);
    const callA1 = await upload(a, '20261020-escalated.mp3');
    await upload(a, 'تماس پشتیبانی بدون تاریخ.mp3');
    const callB = await upload(b, '20261019_093015_09121234567.mp3');
    await drain();
    await upload(a, '20261021 insufficient.mp3'); // queued, not yet processed
    await reprocessCall({ operator: 'op', callId: callA1 });
    const inFlight = (await claimNextJob())!; // a running job of org A
    const bBytes = (await prisma.recording.findFirstOrThrow({ where: { callId: callB } })).bytes;

    // Phase 1 succeeds, phase 2 hits a storage failure on every object.
    setStorageForTests(
      Object.assign(Object.create(new FsStorage('.storage-test')), {
        delete: async () => {
          throw new Error('storage down');
        },
      }),
    );
    const first = await deleteOrganization({ operator: 'op', nationalId: ORG_A.nationalId });
    expect(first).toMatchObject({ finished: false, objectsDeleted: 0, objectsFailed: 3 });

    // Access is gone everywhere.
    expect(await resolveSession(a.token)).toBeNull();
    const signInError = await signIn({
      ...ORG_A,
      mobile: MOBILE,
      password: 'x',
      source: 'x',
    }).catch((e) => e);
    expect((signInError as ServiceError).code).toBe('INVALID_CREDENTIALS');
    expect((await acceptUpload(a, await scratchCopy('uncategorized.mp3'))).status).toBe('rejected');
    expect(
      await prisma.processingJob.count({
        where: { organizationId: a.organizationId, state: 'QUEUED' },
      }),
    ).toBe(0);
    // The in-flight job cannot publish.
    setStorageForTests(undefined);
    expect((await processJob(inFlight, engine, signal)).status).not.toBe('published');
    expect(
      await prisma.analysisRevision.count({ where: { callId: callA1, reason: 'REPROCESS' } }),
    ).toBe(0);
    // Rows and manifest are intact while DELETING.
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: a.organizationId } })).state,
    ).toBe('DELETING');
    expect(await prisma.call.count({ where: { organizationId: a.organizationId } })).toBe(3);

    // Re-run with storage back: finishes; one object was already gone (counts as deleted).
    const recordingA = await prisma.recording.findFirstOrThrow({ where: { callId: callA1 } });
    await getStorage().delete(recordingA.objectKey);
    const second = await deleteOrganization({ operator: 'op', nationalId: ORG_A.nationalId });
    expect(second).toMatchObject({ finished: true, objectsFailed: 0, objectsDeleted: 3 });
    expect(await prisma.call.count({ where: { organizationId: a.organizationId } })).toBe(0);
    expect(await prisma.membership.count({ where: { organizationId: a.organizationId } })).toBe(0);
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: a.organizationId } })).state,
    ).toBe('DELETED');

    // Organization B is untouched, and the ledger holds exactly its bytes.
    expect(await resolveSession(b.token)).not.toBeNull();
    expect(await prisma.call.count({ where: { organizationId: b.organizationId } })).toBe(1);
    expect(await ledger()).toEqual({ committed: bBytes, reserved: 0 });

    const audit = await prisma.operatorAudit.findMany({
      where: { organizationId: a.organizationId },
    });
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'organization.delete.start',
        'organization.delete.incomplete',
        'organization.delete.finish',
      ]),
    );
    expect(JSON.stringify(audit)).not.toMatch(/\.mp3|تماس/);
  });
});
