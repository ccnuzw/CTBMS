-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ReconciliationCutoverExecutionAction'
  ) THEN
    CREATE TYPE "ReconciliationCutoverExecutionAction" AS ENUM ('CUTOVER', 'ROLLBACK', 'AUTOPILOT');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ReconciliationCutoverExecutionStatus'
  ) THEN
    CREATE TYPE "ReconciliationCutoverExecutionStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL', 'COMPENSATED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataReconciliationCutoverExecution" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "action" "ReconciliationCutoverExecutionAction" NOT NULL,
  "status" "ReconciliationCutoverExecutionStatus" NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "datasets" JSONB NOT NULL,
  "decisionId" TEXT,
  "decisionStatus" TEXT,
  "applied" BOOLEAN NOT NULL DEFAULT false,
  "configBefore" JSONB,
  "configAfter" JSONB,
  "stepTrace" JSONB,
  "errorMessage" TEXT,
  "compensationApplied" BOOLEAN NOT NULL DEFAULT false,
  "compensationAt" TIMESTAMP(3),
  "compensationPayload" JSONB,
  "compensationError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataReconciliationCutoverExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationCutoverExecution_executionId_key"
ON "DataReconciliationCutoverExecution"("executionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverExecution_requestedByUserId_createdAt_idx"
ON "DataReconciliationCutoverExecution"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverExecution_action_status_createdAt_idx"
ON "DataReconciliationCutoverExecution"("action", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationCutoverExecution_decisionId_createdAt_idx"
ON "DataReconciliationCutoverExecution"("decisionId", "createdAt");
