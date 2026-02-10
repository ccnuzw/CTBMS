-- CreateEnum
CREATE TYPE "WorkflowBackfillTaskType" AS ENUM ('RISK_GATE_SUMMARY');

-- CreateEnum
CREATE TYPE "WorkflowBackfillStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "WorkflowBackfillAudit" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "taskType" "WorkflowBackfillTaskType" NOT NULL,
    "status" "WorkflowBackfillStatus" NOT NULL,
    "mode" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "maxScanLimit" INTEGER NOT NULL,
    "batchSize" INTEGER NOT NULL,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "eligible" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skippedNoNodeOutput" INTEGER NOT NULL DEFAULT 0,
    "skippedNoSummary" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "batchCount" INTEGER NOT NULL DEFAULT 0,
    "optionsSnapshot" JSONB,
    "statsSnapshot" JSONB,
    "samplesSnapshot" JSONB,
    "failuresTruncated" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowBackfillAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowBackfillAudit_runId_key" ON "WorkflowBackfillAudit"("runId");

-- CreateIndex
CREATE INDEX "WorkflowBackfillAudit_taskType_createdAt_idx" ON "WorkflowBackfillAudit"("taskType", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowBackfillAudit_status_createdAt_idx" ON "WorkflowBackfillAudit"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowBackfillAudit_ownerUserId_createdAt_idx" ON "WorkflowBackfillAudit"("ownerUserId", "createdAt");
