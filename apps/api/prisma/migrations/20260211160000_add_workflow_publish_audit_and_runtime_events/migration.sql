-- CreateEnum
CREATE TYPE "WorkflowRuntimeEventLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkflowPublishOperation" AS ENUM ('PUBLISH');

-- CreateTable
CREATE TABLE "WorkflowRuntimeEvent" (
    "id" TEXT NOT NULL,
    "workflowExecutionId" TEXT NOT NULL,
    "nodeExecutionId" TEXT,
    "eventType" TEXT NOT NULL,
    "level" "WorkflowRuntimeEventLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRuntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowPublishAudit" (
    "id" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "operation" "WorkflowPublishOperation" NOT NULL DEFAULT 'PUBLISH',
    "publishedByUserId" TEXT NOT NULL,
    "comment" TEXT,
    "snapshot" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowPublishAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRuntimeEvent_workflowExecutionId_occurredAt_idx"
ON "WorkflowRuntimeEvent"("workflowExecutionId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkflowRuntimeEvent_nodeExecutionId_idx"
ON "WorkflowRuntimeEvent"("nodeExecutionId");

-- CreateIndex
CREATE INDEX "WorkflowPublishAudit_workflowDefinitionId_publishedAt_idx"
ON "WorkflowPublishAudit"("workflowDefinitionId", "publishedAt");

-- CreateIndex
CREATE INDEX "WorkflowPublishAudit_workflowVersionId_idx"
ON "WorkflowPublishAudit"("workflowVersionId");

-- CreateIndex
CREATE INDEX "WorkflowPublishAudit_publishedByUserId_publishedAt_idx"
ON "WorkflowPublishAudit"("publishedByUserId", "publishedAt");

-- AddForeignKey
ALTER TABLE "WorkflowRuntimeEvent"
ADD CONSTRAINT "WorkflowRuntimeEvent_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRuntimeEvent"
ADD CONSTRAINT "WorkflowRuntimeEvent_nodeExecutionId_fkey"
FOREIGN KEY ("nodeExecutionId") REFERENCES "NodeExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPublishAudit"
ADD CONSTRAINT "WorkflowPublishAudit_workflowDefinitionId_fkey"
FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPublishAudit"
ADD CONSTRAINT "WorkflowPublishAudit_workflowVersionId_fkey"
FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
