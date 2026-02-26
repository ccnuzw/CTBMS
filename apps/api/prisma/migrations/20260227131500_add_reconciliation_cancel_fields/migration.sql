-- AlterEnum
ALTER TYPE "ReconcileJobStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable
ALTER TABLE "DataReconciliationJob"
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationJob_status_cancelledAt_createdAt_idx"
ON "DataReconciliationJob"("status", "cancelledAt", "createdAt");
