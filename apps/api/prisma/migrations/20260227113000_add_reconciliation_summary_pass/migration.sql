-- AlterTable
ALTER TABLE "DataReconciliationJob"
ADD COLUMN IF NOT EXISTS "summaryPass" BOOLEAN;

-- AlterTable
ALTER TABLE "DataReconciliationJob"
ADD COLUMN IF NOT EXISTS "retriedFromJobId" TEXT,
ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from summary JSON
UPDATE "DataReconciliationJob"
SET "summaryPass" = CASE
  WHEN "summary" IS NULL THEN NULL
  WHEN ("summary"->>'pass') IN ('true', 'false') THEN ("summary"->>'pass')::boolean
  ELSE NULL
END
WHERE "summaryPass" IS NULL;

-- Backfill retry count default
UPDATE "DataReconciliationJob"
SET "retryCount" = 0
WHERE "retryCount" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationJob_owner_pass_createdAt_idx"
ON "DataReconciliationJob"("createdByUserId", "summaryPass", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationJob_pass_status_createdAt_idx"
ON "DataReconciliationJob"("summaryPass", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationJob_retriedFromJobId_createdAt_idx"
ON "DataReconciliationJob"("retriedFromJobId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationJob_owner_retryCount_createdAt_idx"
ON "DataReconciliationJob"("createdByUserId", "retryCount", "createdAt");
