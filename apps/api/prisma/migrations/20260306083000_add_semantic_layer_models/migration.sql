-- 补齐语义层模型落库
-- WHY: schema.prisma 已定义 MasterCommodity/MasterRegion/MetricDefinition/DataLineage，
-- 但历史迁移中未创建对应表，导致语义层接口在部分环境出现 P2021 (table not exists)。

-- CreateTable
CREATE TABLE IF NOT EXISTS "MasterCommodity" (
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "nameEn" VARCHAR(60),
    "category" VARCHAR(20) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "futuresSymbols" JSONB NOT NULL DEFAULT '[]',
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCommodity_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MasterRegion" (
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameEn" VARCHAR(80),
    "regionType" VARCHAR(20) NOT NULL,
    "parentCode" VARCHAR(30),
    "country" VARCHAR(4) NOT NULL DEFAULT 'CN',
    "province" VARCHAR(30),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterRegion_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MetricDefinition" (
    "metricCode" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120),
    "domain" VARCHAR(20) NOT NULL,
    "dataType" VARCHAR(20) NOT NULL,
    "unit" VARCHAR(20),
    "formula" VARCHAR(2000),
    "description" VARCHAR(1000),
    "frequency" VARCHAR(20) NOT NULL,
    "ttlMinutes" INTEGER NOT NULL,
    "sourceConnectors" JSONB NOT NULL DEFAULT '[]',
    "version" VARCHAR(20) NOT NULL DEFAULT 'v1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricDefinition_pkey" PRIMARY KEY ("metricCode")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataLineage" (
    "id" TEXT NOT NULL,
    "executionId" VARCHAR(64) NOT NULL,
    "nodeExecutionId" VARCHAR(64),
    "sourceType" VARCHAR(30) NOT NULL,
    "sourceId" VARCHAR(120) NOT NULL,
    "sourceEndpoint" VARCHAR(120),
    "targetType" VARCHAR(30) NOT NULL,
    "targetId" VARCHAR(120) NOT NULL,
    "datasetCode" VARCHAR(60),
    "recordCount" INTEGER,
    "transformations" JSONB NOT NULL DEFAULT '[]',
    "qualityScore" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataLineage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MasterCommodity_category_idx" ON "MasterCommodity"("category");
CREATE INDEX IF NOT EXISTS "MasterCommodity_isActive_idx" ON "MasterCommodity"("isActive");

CREATE INDEX IF NOT EXISTS "MasterRegion_regionType_idx" ON "MasterRegion"("regionType");
CREATE INDEX IF NOT EXISTS "MasterRegion_parentCode_idx" ON "MasterRegion"("parentCode");
CREATE INDEX IF NOT EXISTS "MasterRegion_isActive_idx" ON "MasterRegion"("isActive");

CREATE INDEX IF NOT EXISTS "MetricDefinition_domain_idx" ON "MetricDefinition"("domain");
CREATE INDEX IF NOT EXISTS "MetricDefinition_frequency_idx" ON "MetricDefinition"("frequency");
CREATE INDEX IF NOT EXISTS "MetricDefinition_isActive_idx" ON "MetricDefinition"("isActive");

CREATE INDEX IF NOT EXISTS "DataLineage_executionId_idx" ON "DataLineage"("executionId");
CREATE INDEX IF NOT EXISTS "DataLineage_sourceType_sourceId_idx" ON "DataLineage"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "DataLineage_targetType_targetId_idx" ON "DataLineage"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "DataLineage_createdAt_idx" ON "DataLineage"("createdAt");
