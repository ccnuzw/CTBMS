-- Ensure enum for collection point frequency exists
DO $$
BEGIN
  CREATE TYPE "CollectionPointFrequencyType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add collection point frequency fields if missing
ALTER TABLE "CollectionPoint" ADD COLUMN IF NOT EXISTS "frequencyType" "CollectionPointFrequencyType" NOT NULL DEFAULT 'DAILY';
ALTER TABLE "CollectionPoint" ADD COLUMN IF NOT EXISTS "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "CollectionPoint" ADD COLUMN IF NOT EXISTS "monthDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "CollectionPoint" ADD COLUMN IF NOT EXISTS "dispatchAtMinute" INTEGER NOT NULL DEFAULT 540;
ALTER TABLE "CollectionPoint" ADD COLUMN IF NOT EXISTS "shiftConfig" JSONB;

-- Add task template domain if missing
ALTER TABLE "IntelTaskTemplate" ADD COLUMN IF NOT EXISTS "domain" TEXT;

-- Create rule table if missing
CREATE TABLE IF NOT EXISTS "IntelTaskRule" (
  "id" TEXT NOT NULL,
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

-- Create task group table if missing
CREATE TABLE IF NOT EXISTS "IntelTaskGroup" (
  "id" TEXT NOT NULL,
  "templateId" TEXT,
  "ruleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "groupKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntelTaskGroup_pkey" PRIMARY KEY ("id")
);

-- Add IntelTask fields for rule and workflow bindings if missing
ALTER TABLE "IntelTask" ADD COLUMN IF NOT EXISTS "taskGroupId" TEXT;
ALTER TABLE "IntelTask" ADD COLUMN IF NOT EXISTS "formId" TEXT;
ALTER TABLE "IntelTask" ADD COLUMN IF NOT EXISTS "workflowId" TEXT;
ALTER TABLE "IntelTask" ADD COLUMN IF NOT EXISTS "ruleId" TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS "IntelTask_ruleId_idx" ON "IntelTask" ("ruleId");
CREATE INDEX IF NOT EXISTS "IntelTask_taskGroupId_idx" ON "IntelTask" ("taskGroupId");
CREATE INDEX IF NOT EXISTS "IntelTaskRule_templateId_idx" ON "IntelTaskRule" ("templateId");
CREATE INDEX IF NOT EXISTS "IntelTaskGroup_groupKey_idx" ON "IntelTaskGroup" ("groupKey");

-- Foreign keys (ignore if already exist)
DO $$
BEGIN
  ALTER TABLE "IntelTaskRule"
    ADD CONSTRAINT "IntelTaskRule_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "IntelTaskTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "IntelTask"
    ADD CONSTRAINT "IntelTask_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "IntelTaskRule"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "IntelTask"
    ADD CONSTRAINT "IntelTask_taskGroupId_fkey"
    FOREIGN KEY ("taskGroupId") REFERENCES "IntelTaskGroup"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "IntelTaskGroup"
    ADD CONSTRAINT "IntelTaskGroup_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "IntelTaskTemplate"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "IntelTaskGroup"
    ADD CONSTRAINT "IntelTaskGroup_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "IntelTaskRule"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
