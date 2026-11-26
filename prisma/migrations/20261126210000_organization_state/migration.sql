-- CreateEnum
CREATE TYPE "OrganizationState" AS ENUM ('ACTIVE', 'DELETING', 'DELETED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "state" "OrganizationState" NOT NULL DEFAULT 'ACTIVE';
