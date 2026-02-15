-- AlterTable
ALTER TABLE "WorkflowExecution"
ADD COLUMN "sourceExecutionId" TEXT;

-- CreateIndex
CREATE INDEX "WorkflowExecution_sourceExecutionId_idx" ON "WorkflowExecution"("sourceExecutionId");

-- AddForeignKey
ALTER TABLE "WorkflowExecution"
ADD CONSTRAINT "WorkflowExecution_sourceExecutionId_fkey"
FOREIGN KEY ("sourceExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
