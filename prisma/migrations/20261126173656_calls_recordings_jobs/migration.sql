-- CreateEnum
CREATE TYPE "CallState" AS ENUM ('UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DateSource" AS ENUM ('FILENAME', 'UPLOAD');

-- CreateEnum
CREATE TYPE "RecordingState" AS ENUM ('PENDING', 'STORED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "JobOperation" AS ENUM ('ANALYZE');

-- CreateEnum
CREATE TYPE "JobTrigger" AS ENUM ('INITIAL', 'RETRY', 'REPROCESS');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('AUDIO_PLAYBACK', 'TRANSCRIPT_VIEW');

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "filenameDate" DATE,
    "effectiveDate" DATE NOT NULL,
    "dateSource" "DateSource" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "state" "CallState" NOT NULL DEFAULT 'UPLOADING',
    "failureCode" TEXT,
    "failureRetryable" BOOLEAN NOT NULL DEFAULT false,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "state" "RecordingState" NOT NULL DEFAULT 'PENDING',
    "storedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_fingerprints" (
    "organizationId" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "callId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_fingerprints_pkey" PRIMARY KEY ("organizationId","sha256")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "operation" "JobOperation" NOT NULL DEFAULT 'ANALYZE',
    "trigger" "JobTrigger" NOT NULL DEFAULT 'INITIAL',
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "runAfter" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "stage" TEXT,
    "errorCode" TEXT,
    "enqueuedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "action" "AccessAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_ledger" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "committedBytes" BIGINT NOT NULL DEFAULT 0,
    "reservedBytes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_organizationId_effectiveDate_id_idx" ON "calls"("organizationId", "effectiveDate" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "calls_organizationId_state_idx" ON "calls"("organizationId", "state");

-- CreateIndex
CREATE INDEX "calls_state_createdAt_idx" ON "calls"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "calls_organizationId_id_key" ON "calls"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_objectKey_key" ON "recordings"("objectKey");

-- CreateIndex
CREATE INDEX "recordings_state_expiresAt_idx" ON "recordings"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_organizationId_callId_key" ON "recordings"("organizationId", "callId");

-- CreateIndex
CREATE UNIQUE INDEX "recording_fingerprints_organizationId_callId_key" ON "recording_fingerprints"("organizationId", "callId");

-- CreateIndex
CREATE INDEX "processing_jobs_state_runAfter_idx" ON "processing_jobs"("state", "runAfter");

-- CreateIndex
CREATE INDEX "processing_jobs_state_leaseExpiresAt_idx" ON "processing_jobs"("state", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "processing_jobs_organizationId_callId_idx" ON "processing_jobs"("organizationId", "callId");

-- CreateIndex
CREATE INDEX "access_logs_organizationId_callId_createdAt_idx" ON "access_logs"("organizationId", "callId", "createdAt");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_fingerprints" ADD CONSTRAINT "recording_fingerprints_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written (Prisma cannot express these) ──────────────────────────
-- Only one active (QUEUED or RUNNING) job per call and operation (tech spec §5, §7).
CREATE UNIQUE INDEX "processing_jobs_one_active_per_call"
  ON "processing_jobs" ("organizationId", "callId", "operation")
  WHERE "state" IN ('QUEUED', 'RUNNING');

-- Access logs carry the member who listened or read; the member must belong to the call's organization.
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_organizationId_membershipId_fkey"
  FOREIGN KEY ("organizationId", "membershipId") REFERENCES "memberships"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The storage ledger never goes negative, and there is exactly one row.
ALTER TABLE "storage_ledger" ADD CONSTRAINT "storage_ledger_non_negative"
  CHECK ("committedBytes" >= 0 AND "reservedBytes" >= 0);
ALTER TABLE "storage_ledger" ADD CONSTRAINT "storage_ledger_single_row" CHECK ("id" = 1);
INSERT INTO "storage_ledger" ("id", "committedBytes", "reservedBytes", "updatedAt")
  VALUES (1, 0, 0, CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
