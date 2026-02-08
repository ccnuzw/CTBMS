-- Add collection point frequency config and task rule/group models

CREATE TYPE "CollectionPointFrequencyType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

ALTER TABLE "CollectionPoint"
  ADD COLUMN "frequencyType" "CollectionPointFrequencyType" NOT NULL DEFAULT 'DAILY',
  ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "monthDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "dispatchAtMinute" INTEGER NOT NULL DEFAULT 540,
  ADD COLUMN "shiftConfig" JSONB;

ALTER TABLE "IntelTaskTemplate"
  ADD COLUMN "domain" TEXT;

CREATE TABLE "IntelTaskGroup" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "templateId" TEXT,
  "ruleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "groupKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntelTaskGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntelTaskRule" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "templateId" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeQuery" JSONB,
  "frequencyType" "TaskCycleType" NOT NULL DEFAULT 'DAILY',
  "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "monthDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "dispatchAtMinute" INTEGER NOT NULL DEFAULT 540,
  "duePolicy" JSONB,
  "assigneeStrategy" TEXT NOT NULL DEFAULT 'POINT_OWNER',
  "completionPolicy" TEXT NOT NULL DEFAULT 'EACH',
  "grouping" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntelTaskRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IntelTaskRule"
  ADD CONSTRAINT "IntelTaskRule_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "IntelTaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "IntelTaskRule_templateId_idx" ON "IntelTaskRule"("templateId");

ALTER TABLE "IntelTask"
  ADD COLUMN "taskGroupId" TEXT,
  ADD COLUMN "formId" TEXT,
  ADD COLUMN "workflowId" TEXT;

ALTER TABLE "IntelTask"
  ADD CONSTRAINT "IntelTask_taskGroupId_fkey"
  FOREIGN KEY ("taskGroupId") REFERENCES "IntelTaskGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "IntelTask_taskGroupId_idx" ON "IntelTask"("taskGroupId");
