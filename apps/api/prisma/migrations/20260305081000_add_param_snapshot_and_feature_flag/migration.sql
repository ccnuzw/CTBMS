-- 本迁移为 Batch 3-4 实施新增的两个 model:
-- 1. ParameterSetSnapshot (参数包版本快照)
-- 2. FeatureFlag (灰度开关)

-- CreateTable
CREATE TABLE IF NOT EXISTS "ParameterSetSnapshot" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "ParameterSetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL,
    "flagKey" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "allowUserIds" JSONB NOT NULL DEFAULT '[]',
    "environments" JSONB NOT NULL DEFAULT '["production"]',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (ParameterSetSnapshot)
CREATE INDEX IF NOT EXISTS "ParameterSetSnapshot_parameterSetId_version_idx" ON "ParameterSetSnapshot"("parameterSetId", "version");
CREATE INDEX IF NOT EXISTS "ParameterSetSnapshot_parameterSetId_createdAt_idx" ON "ParameterSetSnapshot"("parameterSetId", "createdAt");

-- CreateIndex (FeatureFlag)
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_flagKey_key" ON "FeatureFlag"("flagKey");
CREATE INDEX IF NOT EXISTS "FeatureFlag_flagKey_idx" ON "FeatureFlag"("flagKey");
CREATE INDEX IF NOT EXISTS "FeatureFlag_isEnabled_idx" ON "FeatureFlag"("isEnabled");
