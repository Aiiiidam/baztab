-- CreateEnum
CREATE TYPE "RevisionReason" AS ENUM ('INITIAL', 'RETRY', 'REPROCESS', 'CORRECTION');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('PUBLISHED', 'CANDIDATE', 'DISCARDED');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('AGENT', 'CUSTOMER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IssueOutcome" AS ENUM ('RESOLVED', 'UNRESOLVED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ScoreCriterion" AS ENUM ('UNDERSTANDING', 'CORRECT_ACTION', 'CLEAR_CLOSURE');

-- CreateEnum
CREATE TYPE "ScoreRating" AS ENUM ('MET', 'PARTLY_MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "EvidenceTarget" AS ENUM ('REASON', 'ISSUE', 'OUTCOME', 'SCORE');

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "activeRevisionId" TEXT;

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_revisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" "RevisionReason" NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "parentRevisionId" TEXT,
    "transcriptId" TEXT,
    "outputSchemaVersion" TEXT NOT NULL,
    "transcriberModel" TEXT NOT NULL,
    "analyzerModel" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "callReason" TEXT,
    "callReasonHumanSet" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByMembershipId" TEXT,
    "createdByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "taxonomyVersion" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_findings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "categoryId" TEXT,
    "summary" TEXT,
    "outcome" "IssueOutcome" NOT NULL,
    "outcomeExplanation" TEXT,
    "eligible" BOOLEAN NOT NULL,
    "categoryHumanSet" BOOLEAN NOT NULL DEFAULT false,
    "outcomeHumanSet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "issue_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "criterion" "ScoreCriterion" NOT NULL,
    "rating" "ScoreRating" NOT NULL,
    "explanation" TEXT,
    "humanSet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "target" "EvidenceTarget" NOT NULL,
    "findingId" TEXT,
    "scoreId" TEXT,
    "segmentId" TEXT NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_audits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "resultRevisionId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcripts_organizationId_callId_idx" ON "transcripts"("organizationId", "callId");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_organizationId_id_key" ON "transcripts"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_transcriptId_index_key" ON "transcript_segments"("transcriptId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_segments_organizationId_id_key" ON "transcript_segments"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_revisions_callId_version_key" ON "analysis_revisions"("callId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_revisions_organizationId_id_key" ON "analysis_revisions"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_revisions_organizationId_id_callId_key" ON "analysis_revisions"("organizationId", "id", "callId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_categories_organizationId_key_key" ON "issue_categories"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "issue_categories_organizationId_id_key" ON "issue_categories"("organizationId", "id");

-- CreateIndex
CREATE INDEX "issue_findings_organizationId_categoryId_eligible_idx" ON "issue_findings"("organizationId", "categoryId", "eligible");

-- CreateIndex
CREATE INDEX "issue_findings_organizationId_callId_idx" ON "issue_findings"("organizationId", "callId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_findings_revisionId_position_key" ON "issue_findings"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "scores_revisionId_criterion_key" ON "scores"("revisionId", "criterion");

-- CreateIndex
CREATE INDEX "evidence_revisionId_idx" ON "evidence"("revisionId");

-- CreateIndex
CREATE INDEX "evidence_findingId_idx" ON "evidence"("findingId");

-- CreateIndex
CREATE INDEX "evidence_scoreId_idx" ON "evidence"("scoreId");

-- CreateIndex
CREATE INDEX "correction_audits_organizationId_callId_createdAt_idx" ON "correction_audits"("organizationId", "callId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "calls_activeRevisionId_key" ON "calls"("activeRevisionId");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "analysis_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_organizationId_transcriptId_fkey" FOREIGN KEY ("organizationId", "transcriptId") REFERENCES "transcripts"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_revisions" ADD CONSTRAINT "analysis_revisions_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_revisions" ADD CONSTRAINT "analysis_revisions_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_revisions" ADD CONSTRAINT "analysis_revisions_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES "analysis_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_categories" ADD CONSTRAINT "issue_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_findings" ADD CONSTRAINT "issue_findings_organizationId_revisionId_fkey" FOREIGN KEY ("organizationId", "revisionId") REFERENCES "analysis_revisions"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_findings" ADD CONSTRAINT "issue_findings_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_findings" ADD CONSTRAINT "issue_findings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "issue_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_organizationId_revisionId_fkey" FOREIGN KEY ("organizationId", "revisionId") REFERENCES "analysis_revisions"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organizationId_revisionId_fkey" FOREIGN KEY ("organizationId", "revisionId") REFERENCES "analysis_revisions"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organizationId_segmentId_fkey" FOREIGN KEY ("organizationId", "segmentId") REFERENCES "transcript_segments"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "issue_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_audits" ADD CONSTRAINT "correction_audits_organizationId_callId_fkey" FOREIGN KEY ("organizationId", "callId") REFERENCES "calls"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Hand-written: tenant consistency for nullable links (decision 009) ───
-- The active revision must belong to the same organization and the same call.
ALTER TABLE "calls" ADD CONSTRAINT "calls_active_revision_same_call_fkey"
  FOREIGN KEY ("organizationId", "activeRevisionId", "id")
  REFERENCES "analysis_revisions"("organizationId", "id", "callId");

-- A finding's category must come from the finding's own organization.
ALTER TABLE "issue_findings" ADD CONSTRAINT "issue_findings_category_same_org_fkey"
  FOREIGN KEY ("organizationId", "categoryId")
  REFERENCES "issue_categories"("organizationId", "id");
