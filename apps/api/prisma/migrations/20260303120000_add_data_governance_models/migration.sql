-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DataFreshnessStatus') THEN
    CREATE TYPE "DataFreshnessStatus" AS ENUM ('WITHIN_TTL', 'NEAR_EXPIRE', 'EXPIRED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DataSourceType') THEN
    CREATE TYPE "DataSourceType" AS ENUM (
      'INTERNAL',
      'PUBLIC',
      'FUTURES_API',
      'WEATHER_API',
      'LOGISTICS_API',
      'MANUAL'
    );
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MetricStatus') THEN
    CREATE TYPE "MetricStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EvidenceConflictResolution') THEN
    CREATE TYPE "EvidenceConflictResolution" AS ENUM (
      'PREFER_SOURCE_A',
      'PREFER_SOURCE_B',
      'MANUAL_REVIEW',
      'KEEP_BOTH'
    );
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QualityIssueSeverity') THEN
    CREATE TYPE "QualityIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WeatherObservation" (
  "id" TEXT NOT NULL,
  "connectorId" TEXT,
  "regionCode" TEXT NOT NULL,
  "stationCode" TEXT,
  "dataTime" TIMESTAMP(3) NOT NULL,
  "tempC" DECIMAL(10, 2),
  "rainfallMm" DECIMAL(10, 2),
  "windSpeed" DECIMAL(10, 2),
  "anomalyScore" DECIMAL(10, 4),
  "eventLevel" TEXT,
  "freshnessStatus" "DataFreshnessStatus" NOT NULL DEFAULT 'WITHIN_TTL',
  "qualityScore" DECIMAL(5, 4) NOT NULL,
  "sourceType" "DataSourceType" NOT NULL,
  "sourceRecordId" TEXT,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeatherObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LogisticsRouteSnapshot" (
  "id" TEXT NOT NULL,
  "connectorId" TEXT,
  "routeCode" TEXT NOT NULL,
  "originRegionCode" TEXT NOT NULL,
  "destinationRegionCode" TEXT NOT NULL,
  "transportMode" TEXT NOT NULL,
  "dataTime" TIMESTAMP(3) NOT NULL,
  "freightCost" DECIMAL(18, 4) NOT NULL,
  "transitHours" DECIMAL(10, 2),
  "delayIndex" DECIMAL(10, 4),
  "capacityUtilization" DECIMAL(10, 4),
  "eventFlag" TEXT,
  "freshnessStatus" "DataFreshnessStatus" NOT NULL DEFAULT 'WITHIN_TTL',
  "qualityScore" DECIMAL(5, 4) NOT NULL,
  "sourceType" "DataSourceType" NOT NULL,
  "sourceRecordId" TEXT,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LogisticsRouteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MetricCatalog" (
  "id" TEXT NOT NULL,
  "metricCode" TEXT NOT NULL,
  "metricName" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL,
  "expression" TEXT NOT NULL,
  "unit" TEXT,
  "granularity" TEXT,
  "dimensions" JSONB,
  "status" "MetricStatus" NOT NULL DEFAULT 'DRAFT',
  "ownerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetricCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MetricValueSnapshot" (
  "id" TEXT NOT NULL,
  "metricCatalogId" TEXT NOT NULL,
  "metricCode" TEXT NOT NULL,
  "metricVersion" TEXT NOT NULL,
  "value" DECIMAL(20, 6) NOT NULL,
  "valueText" TEXT,
  "dimensions" JSONB,
  "dataTime" TIMESTAMP(3) NOT NULL,
  "freshnessStatus" "DataFreshnessStatus" NOT NULL DEFAULT 'WITHIN_TTL',
  "qualityScore" DECIMAL(5, 4) NOT NULL,
  "confidenceScore" DECIMAL(5, 4),
  "sourceSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetricValueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EvidenceBundle" (
  "id" TEXT NOT NULL,
  "conversationSessionId" TEXT,
  "workflowExecutionId" TEXT,
  "title" TEXT,
  "confidenceScore" DECIMAL(5, 4),
  "consistencyScore" DECIMAL(5, 4),
  "summary" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EvidenceClaim" (
  "id" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "claimText" TEXT NOT NULL,
  "claimType" TEXT,
  "confidenceScore" DECIMAL(5, 4),
  "evidenceItems" JSONB NOT NULL,
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "dataTimestamp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EvidenceConflict" (
  "id" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "sourceA" TEXT NOT NULL,
  "sourceB" TEXT NOT NULL,
  "valueA" JSONB,
  "valueB" JSONB,
  "resolution" "EvidenceConflictResolution" NOT NULL,
  "reason" TEXT,
  "impactLevel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataQualityIssue" (
  "id" TEXT NOT NULL,
  "datasetName" TEXT NOT NULL,
  "sourceType" "DataSourceType" NOT NULL,
  "connectorId" TEXT,
  "issueType" TEXT NOT NULL,
  "severity" "QualityIssueSeverity" NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolverUserId" TEXT,
  "resolutionNote" TEXT,
  CONSTRAINT "DataQualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DataSourceHealthSnapshot" (
  "id" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "sourceType" "DataSourceType" NOT NULL,
  "windowStartAt" TIMESTAMP(3) NOT NULL,
  "windowEndAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "p95LatencyMs" INTEGER,
  "avgLatencyMs" INTEGER,
  "availabilityRatio" DECIMAL(6, 4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataSourceHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StandardizationMappingRule" (
  "id" TEXT NOT NULL,
  "datasetName" TEXT NOT NULL,
  "mappingVersion" TEXT NOT NULL,
  "sourceField" TEXT NOT NULL,
  "targetField" TEXT NOT NULL,
  "transformExpr" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "nullPolicy" TEXT NOT NULL DEFAULT 'FAIL',
  "defaultValue" JSONB,
  "rulePriority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandardizationMappingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WeatherObservation_regionCode_dataTime_idx"
ON "WeatherObservation"("regionCode", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WeatherObservation_connectorId_dataTime_idx"
ON "WeatherObservation"("connectorId", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WeatherObservation_freshnessStatus_dataTime_idx"
ON "WeatherObservation"("freshnessStatus", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LogisticsRouteSnapshot_routeCode_dataTime_idx"
ON "LogisticsRouteSnapshot"("routeCode", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LogisticsRouteSnapshot_originRegionCode_destinationRegionCode_dataTime_idx"
ON "LogisticsRouteSnapshot"("originRegionCode", "destinationRegionCode", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LogisticsRouteSnapshot_freshnessStatus_dataTime_idx"
ON "LogisticsRouteSnapshot"("freshnessStatus", "dataTime");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MetricCatalog_metricCode_version_key"
ON "MetricCatalog"("metricCode", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetricCatalog_status_updatedAt_idx"
ON "MetricCatalog"("status", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetricValueSnapshot_metricCode_dataTime_idx"
ON "MetricValueSnapshot"("metricCode", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetricValueSnapshot_metricCatalogId_dataTime_idx"
ON "MetricValueSnapshot"("metricCatalogId", "dataTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvidenceBundle_conversationSessionId_createdAt_idx"
ON "EvidenceBundle"("conversationSessionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvidenceBundle_workflowExecutionId_createdAt_idx"
ON "EvidenceBundle"("workflowExecutionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvidenceClaim_bundleId_createdAt_idx"
ON "EvidenceClaim"("bundleId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvidenceConflict_bundleId_createdAt_idx"
ON "EvidenceConflict"("bundleId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvidenceConflict_topic_createdAt_idx"
ON "EvidenceConflict"("topic", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataQualityIssue_datasetName_detectedAt_idx"
ON "DataQualityIssue"("datasetName", "detectedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataQualityIssue_severity_detectedAt_idx"
ON "DataQualityIssue"("severity", "detectedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataQualityIssue_connectorId_detectedAt_idx"
ON "DataQualityIssue"("connectorId", "detectedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataSourceHealthSnapshot_connectorId_windowEndAt_idx"
ON "DataSourceHealthSnapshot"("connectorId", "windowEndAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataSourceHealthSnapshot_sourceType_windowEndAt_idx"
ON "DataSourceHealthSnapshot"("sourceType", "windowEndAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StandardizationMappingRule_datasetName_isActive_idx"
ON "StandardizationMappingRule"("datasetName", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StandardizationMappingRule_datasetName_mappingVersion_idx"
ON "StandardizationMappingRule"("datasetName", "mappingVersion");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StandardizationMappingRule_datasetName_mappingVersion_sourceField_targetField_key"
ON "StandardizationMappingRule"("datasetName", "mappingVersion", "sourceField", "targetField");

-- AddForeignKey
ALTER TABLE "WeatherObservation"
ADD CONSTRAINT "WeatherObservation_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "DataConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsRouteSnapshot"
ADD CONSTRAINT "LogisticsRouteSnapshot_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "DataConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricCatalog"
ADD CONSTRAINT "MetricCatalog_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricValueSnapshot"
ADD CONSTRAINT "MetricValueSnapshot_metricCatalogId_fkey"
FOREIGN KEY ("metricCatalogId") REFERENCES "MetricCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceBundle"
ADD CONSTRAINT "EvidenceBundle_conversationSessionId_fkey"
FOREIGN KEY ("conversationSessionId") REFERENCES "ConversationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceBundle"
ADD CONSTRAINT "EvidenceBundle_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceBundle"
ADD CONSTRAINT "EvidenceBundle_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim"
ADD CONSTRAINT "EvidenceClaim_bundleId_fkey"
FOREIGN KEY ("bundleId") REFERENCES "EvidenceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceConflict"
ADD CONSTRAINT "EvidenceConflict_bundleId_fkey"
FOREIGN KEY ("bundleId") REFERENCES "EvidenceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue"
ADD CONSTRAINT "DataQualityIssue_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "DataConnector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue"
ADD CONSTRAINT "DataQualityIssue_resolverUserId_fkey"
FOREIGN KEY ("resolverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourceHealthSnapshot"
ADD CONSTRAINT "DataSourceHealthSnapshot_connectorId_fkey"
FOREIGN KEY ("connectorId") REFERENCES "DataConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardizationMappingRule"
ADD CONSTRAINT "StandardizationMappingRule_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
