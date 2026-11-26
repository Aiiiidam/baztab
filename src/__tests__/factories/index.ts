import { Factory } from 'fishery';
import type { MemberSession, Membership, Organization } from '@prisma/client';

/**
 * Full Prisma rows for mocking `prisma.*` results. Two organizations are the
 * norm in service tests (decision 009): build them with distinct `id`s.
 */

export const organizationFactory = Factory.define<Organization>(({ sequence }) => ({
  id: `org-${sequence}`,
  nationalId: '10380284790',
  name: `سازمان ${sequence}`,
  isActive: true,
  state: 'ACTIVE',
  retentionDays: 10,
  createdAt: new Date('2026-11-01T08:00:00Z'),
  updatedAt: new Date('2026-11-01T08:00:00Z'),
}));

export const membershipFactory = Factory.define<Membership>(({ sequence }) => ({
  id: `member-${sequence}`,
  organizationId: 'org-1',
  mobile: '09120000001',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$placeholder$placeholder',
  mustChangePassword: false,
  initialPasswordExpiresAt: null,
  passwordChangedAt: new Date('2026-11-02T08:00:00Z'),
  activatedAt: new Date('2026-11-01T08:00:00Z'),
  revokedAt: null,
  lastSignInAt: null,
  createdAt: new Date('2026-11-01T08:00:00Z'),
  updatedAt: new Date('2026-11-01T08:00:00Z'),
}));

export const memberSessionFactory = Factory.define<MemberSession>(({ sequence }) => ({
  id: `session-${sequence}`,
  organizationId: 'org-1',
  membershipId: 'member-1',
  tokenHash: 'a'.repeat(64),
  idleExpiresAt: new Date('2026-11-27T08:00:00Z'),
  absoluteExpiresAt: new Date('2026-12-02T08:00:00Z'),
  lastSeenAt: new Date('2026-11-26T08:00:00Z'),
  createdAt: new Date('2026-11-25T08:00:00Z'),
}));
