-- CreateEnum
CREATE TYPE "IntelTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskCycleType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ONE_TIME');

-- AlterEnum
ALTER TYPE "IntelSourceType" ADD VALUE 'INTERNAL_REPORT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntelTaskType" ADD VALUE 'DAILY_REPORT';
ALTER TYPE "IntelTaskType" ADD VALUE 'WEEKLY_REPORT';
ALTER TYPE "IntelTaskType" ADD VALUE 'MONTHLY_REPORT';
ALTER TYPE "IntelTaskType" ADD VALUE 'RESEARCH_REPORT';
ALTER TYPE "IntelTaskType" ADD VALUE 'PRICE_COLLECTION';
ALTER TYPE "IntelTaskType" ADD VALUE 'INVENTORY_CHECK';
ALTER TYPE "IntelTaskType" ADD VALUE 'FIELD_VISIT';
ALTER TYPE "IntelTaskType" ADD VALUE 'COMPETITOR_INFO';
ALTER TYPE "IntelTaskType" ADD VALUE 'POLICY_ANALYSIS';
ALTER TYPE "IntelTaskType" ADD VALUE 'URGENT_VERIFICATION';
ALTER TYPE "IntelTaskType" ADD VALUE 'EXHIBITION_REPORT';
ALTER TYPE "IntelTaskType" ADD VALUE 'RESOURCE_UPDATE';

-- AlterTable
ALTER TABLE "IntelTask" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "priority" "IntelTaskPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "IntelTaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "taskType" "IntelTaskType" NOT NULL,
    "priority" "IntelTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "cycleType" "TaskCycleType" NOT NULL DEFAULT 'ONE_TIME',
    "cycleConfig" JSONB,
    "deadlineOffset" INTEGER NOT NULL DEFAULT 24,
    "assigneeMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "assigneeIds" TEXT[],
    "departmentIds" TEXT[],
    "organizationIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntelTaskTemplate_isActive_nextRunAt_idx" ON "IntelTaskTemplate"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "IntelTask_templateId_idx" ON "IntelTask"("templateId");

-- AddForeignKey
ALTER TABLE "IntelTask" ADD CONSTRAINT "IntelTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntelTaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
