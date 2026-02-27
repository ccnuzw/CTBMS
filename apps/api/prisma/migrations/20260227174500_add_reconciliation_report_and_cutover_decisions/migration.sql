-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ReconciliationCutoverDecisionStatus'
  ) THEN
    CREATE TYPE "ReconciliationCutoverDecisionStatus" AS ENUM ('APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataReconciliationM1ReadinessReport" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "windowDays" INTEGER NOT NULL DEFAULT 7,
  "targetCoverageRate" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
  "datasets" JSONB NOT NULL,
  "readinessSnapshot" JSONB NOT NULL,
  "reportPayload" JSONB NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataReconciliationM1ReadinessReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataReconciliationCutoverDecision" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "status" "ReconciliationCutoverDecisionStatus" NOT NULL,
  "reasonCodes" JSONB NOT NULL,
  "windowDays" INTEGER NOT NULL DEFAULT 7,
  "targetCoverageRate" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
  "datasets" JSONB NOT NULL,
  "reportFormat" TEXT NOT NULL,
  "reportSnapshotId" TEXT NOT NULL,
  "readinessSummary" JSONB NOT NULL,
  "note" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataReconciliationCutoverDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationM1ReadinessReport_snapshotId_key"
ON "DataReconciliationM1ReadinessReport"("snapshotId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationM1ReadinessReport_requestedByUserId_createdAt_idx"
ON "DataReconciliationM1ReadinessReport"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationM1ReadinessReport_format_createdAt_idx"
ON "DataReconciliationM1ReadinessReport"("format", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationM1ReadinessReport_windowDays_targetCoverageRate_createdAt_idx"
ON "DataReconciliationM1ReadinessReport"("windowDays", "targetCoverageRate", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationCutoverDecision_decisionId_key"
ON "DataReconciliationCutoverDecision"("decisionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverDecision_status_createdAt_idx"
ON "DataReconciliationCutoverDecision"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverDecision_requestedByUserId_createdAt_idx"
ON "DataReconciliationCutoverDecision"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverDecision_reportSnapshotId_createdAt_idx"
ON "DataReconciliationCutoverDecision"("reportSnapshotId", "createdAt");
