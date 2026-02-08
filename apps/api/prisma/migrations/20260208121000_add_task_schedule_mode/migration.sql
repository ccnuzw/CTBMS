-- Ensure enum for task schedule mode exists
DO $$
BEGIN
  CREATE TYPE "TaskScheduleMode" AS ENUM ('POINT_DEFAULT', 'TEMPLATE_OVERRIDE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add schedule mode on task template
ALTER TABLE "IntelTaskTemplate"
  ADD COLUMN IF NOT EXISTS "scheduleMode" "TaskScheduleMode" NOT NULL DEFAULT 'TEMPLATE_OVERRIDE';

-- Default collection templates to point-driven schedule
UPDATE "IntelTaskTemplate"
SET "scheduleMode" = 'POINT_DEFAULT'
WHERE "taskType" = 'COLLECTION';
