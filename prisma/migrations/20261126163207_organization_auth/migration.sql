-- CreateEnum
CREATE TYPE "RateLimitScope" AS ENUM ('ACCOUNT', 'SOURCE');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "nationalId" VARCHAR(11) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mobile" VARCHAR(11) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "initialPasswordExpiresAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" TEXT NOT NULL,
    "scope" "RateLimitScope" NOT NULL,
    "failures" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lastFailureAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "operator_audit" (
    "id" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "organizationId" TEXT,
    "membershipId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_nationalId_key" ON "organizations"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_mobile_key" ON "memberships"("organizationId", "mobile");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_id_key" ON "memberships"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "member_sessions_tokenHash_key" ON "member_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "member_sessions_organizationId_membershipId_idx" ON "member_sessions"("organizationId", "membershipId");

-- CreateIndex
CREATE INDEX "member_sessions_absoluteExpiresAt_idx" ON "member_sessions"("absoluteExpiresAt");

-- CreateIndex
CREATE INDEX "auth_rate_limits_expiresAt_idx" ON "auth_rate_limits"("expiresAt");

-- CreateIndex
CREATE INDEX "operator_audit_organizationId_createdAt_idx" ON "operator_audit"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "memberships"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
