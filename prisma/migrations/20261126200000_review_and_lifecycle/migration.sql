-- AlterTable
ALTER TABLE "issue_findings" ADD COLUMN     "hasEvidence" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "egress_usage" (
    "month" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "egress_usage_pkey" PRIMARY KEY ("month")
);


-- Backfill: a finding had evidence if it was eligible or still has evidence rows.
UPDATE "issue_findings" f SET "hasEvidence" = TRUE
WHERE f."eligible" OR EXISTS (SELECT 1 FROM "evidence" e WHERE e."findingId" = f.id);
