-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ReconciliationRollbackDrillStatus'
  ) THEN
    CREATE TYPE "ReconciliationRollbackDrillStatus" AS ENUM ('PLANNED', 'RUNNING', 'PASSED', 'FAILED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataReconciliationRollbackDrill" (
  "id" TEXT NOT NULL,
  "drillId" TEXT NOT NULL,
  "dataset" TEXT NOT NULL,
  "workflowVersionId" TEXT,
  "scenario" TEXT NOT NULL,
  "status" "ReconciliationRollbackDrillStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "durationSeconds" INTEGER,
  "rollbackPath" TEXT,
  "resultSummary" JSONB,
  "notes" TEXT,
  "triggeredByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataReconciliationRollbackDrill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationRollbackDrill_drillId_key"
ON "DataReconciliationRollbackDrill"("drillId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationRollbackDrill_dataset_status_createdAt_idx"
ON "DataReconciliationRollbackDrill"("dataset", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationRollbackDrill_triggeredByUserId_createdAt_idx"
ON "DataReconciliationRollbackDrill"("triggeredByUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationRollbackDrill_workflowVersionId_createdAt_idx"
ON "DataReconciliationRollbackDrill"("workflowVersionId", "createdAt");
