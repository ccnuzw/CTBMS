-- CreateEnum
CREATE TYPE "WorkflowMode" AS ENUM ('LINEAR', 'DAG', 'DEBATE');

-- CreateEnum
CREATE TYPE "WorkflowUsageMethod" AS ENUM ('HEADLESS', 'COPILOT', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "WorkflowDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowTemplateSource" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" "WorkflowMode" NOT NULL,
    "usageMethod" "WorkflowUsageMethod" NOT NULL,
    "status" "WorkflowDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT NOT NULL,
    "templateSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "latestVersionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "versionCode" TEXT NOT NULL,
    "status" "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "dslSnapshot" JSONB NOT NULL,
    "changelog" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_workflowId_key" ON "WorkflowDefinition"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_ownerUserId_status_idx" ON "WorkflowDefinition"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_mode_usageMethod_idx" ON "WorkflowDefinition"("mode", "usageMethod");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_templateSource_isActive_idx" ON "WorkflowDefinition"("templateSource", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowDefinitionId_versionCode_key" ON "WorkflowVersion"("workflowDefinitionId", "versionCode");

-- CreateIndex
CREATE INDEX "WorkflowVersion_workflowDefinitionId_status_idx" ON "WorkflowVersion"("workflowDefinitionId", "status");

-- CreateIndex
CREATE INDEX "WorkflowVersion_createdByUserId_createdAt_idx" ON "WorkflowVersion"("createdByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowVersion"
ADD CONSTRAINT "WorkflowVersion_workflowDefinitionId_fkey"
FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
