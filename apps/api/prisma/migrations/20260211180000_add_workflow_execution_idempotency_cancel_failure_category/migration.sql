-- CreateEnum
CREATE TYPE "WorkflowFailureCategory" AS ENUM ('VALIDATION', 'EXECUTOR', 'TIMEOUT', 'CANCELED', 'INTERNAL');

-- AlterTable
ALTER TABLE "WorkflowExecution"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "failureCategory" "WorkflowFailureCategory",
ADD COLUMN "failureCode" TEXT;

-- AlterTable
ALTER TABLE "NodeExecution"
ADD COLUMN "failureCategory" "WorkflowFailureCategory",
ADD COLUMN "failureCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExecution_workflowVersionId_triggerUserId_idempotencyKey_key"
ON "WorkflowExecution"("workflowVersionId", "triggerUserId", "idempotencyKey");
