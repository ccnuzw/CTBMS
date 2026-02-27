ALTER TABLE "DataReconciliationCutoverCompensationBatch"
  ADD COLUMN IF NOT EXISTS "control" JSONB;

UPDATE "DataReconciliationCutoverCompensationBatch"
SET "control" = '{}'::jsonb
WHERE "control" IS NULL;

ALTER TABLE "DataReconciliationCutoverCompensationBatch"
  ALTER COLUMN "control" SET NOT NULL;
