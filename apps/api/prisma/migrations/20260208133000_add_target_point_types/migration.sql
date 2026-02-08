-- Add multi-select target point types for templates
ALTER TABLE "IntelTaskTemplate"
  ADD COLUMN IF NOT EXISTS "targetPointTypes" "CollectionPointType"[] NOT NULL DEFAULT ARRAY[]::"CollectionPointType"[];

-- Backfill from legacy single targetPointType when present
UPDATE "IntelTaskTemplate"
SET "targetPointTypes" = ARRAY["targetPointType"]::"CollectionPointType"[]
WHERE "targetPointType" IS NOT NULL
  AND (array_length("targetPointTypes", 1) IS NULL OR array_length("targetPointTypes", 1) = 0);
