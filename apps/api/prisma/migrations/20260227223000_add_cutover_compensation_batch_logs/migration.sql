-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ReconciliationCutoverCompensationBatchStatus'
  ) THEN
    CREATE TYPE "ReconciliationCutoverCompensationBatchStatus" AS ENUM ('DRY_RUN', 'SUCCESS', 'PARTIAL', 'FAILED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataReconciliationCutoverCompensationBatch" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "status" "ReconciliationCutoverCompensationBatchStatus" NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "replayed" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "windowDays" INTEGER NOT NULL DEFAULT 7,
  "datasets" JSONB NOT NULL,
  "requestedLimit" INTEGER NOT NULL DEFAULT 20,
  "disableReconciliationGate" BOOLEAN NOT NULL DEFAULT true,
  "workflowVersionId" TEXT,
  "note" TEXT,
  "reason" TEXT,
  "storage" TEXT NOT NULL,
  "scanned" INTEGER NOT NULL DEFAULT 0,
  "matched" INTEGER NOT NULL DEFAULT 0,
  "attempted" INTEGER NOT NULL DEFAULT 0,
  "results" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataReconciliationCutoverCompensationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationCutoverCompensationBatch_batchId_key"
ON "DataReconciliationCutoverCompensationBatch"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationCutoverCompensationBatch_requestedByUserId_idempotencyKey_key"
ON "DataReconciliationCutoverCompensationBatch"("requestedByUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverCompensationBatch_requestedByUserId_createdAt_idx"
ON "DataReconciliationCutoverCompensationBatch"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverCompensationBatch_status_dryRun_createdAt_idx"
ON "DataReconciliationCutoverCompensationBatch"("status", "dryRun", "createdAt");
