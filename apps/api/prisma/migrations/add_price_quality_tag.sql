DO $$
BEGIN
  CREATE TYPE "PriceQualityTag" AS ENUM ('RAW', 'IMPUTED', 'CORRECTED', 'LATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PriceData"
  ADD COLUMN IF NOT EXISTS "qualityTag" "PriceQualityTag" NOT NULL DEFAULT 'RAW';

CREATE INDEX IF NOT EXISTS "PriceData_qualityTag_effectiveDate_idx"
  ON "PriceData" ("qualityTag", "effectiveDate");

CREATE INDEX IF NOT EXISTS "price_data_point_analytics_idx"
  ON "PriceData" ("collectionPointId", "commodity", "effectiveDate", "reviewStatus", "inputMethod", "subType");

CREATE INDEX IF NOT EXISTS "price_data_region_analytics_idx"
  ON "PriceData" ("regionCode", "commodity", "effectiveDate", "reviewStatus", "inputMethod", "subType");
