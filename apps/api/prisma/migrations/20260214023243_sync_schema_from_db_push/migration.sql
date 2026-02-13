-- CreateEnum
CREATE TYPE "PriceQualityTag" AS ENUM ('RAW', 'IMPUTED', 'CORRECTED', 'LATE');

-- CreateEnum
CREATE TYPE "DecisionAction" AS ENUM ('BUY', 'SELL', 'HOLD', 'REDUCE', 'REVIEW_ONLY');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ABORTED');

-- AlterEnum
ALTER TYPE "IntelTaskStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "WorkflowTemplateSource" ADD VALUE 'COPIED';

-- DropForeignKey
ALTER TABLE "IntelTaskGroup" DROP CONSTRAINT "IntelTaskGroup_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "IntelTaskGroup" DROP CONSTRAINT "IntelTaskGroup_templateId_fkey";

-- DropIndex
DROP INDEX "IntelTaskGroup_groupKey_idx";

-- AlterTable
ALTER TABLE "IntelTask" ADD COLUMN     "returnReason" TEXT;

-- AlterTable
ALTER TABLE "IntelTaskGroup" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IntelTaskRule" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "rejectReason" TEXT;

-- AlterTable
ALTER TABLE "PriceData" ADD COLUMN     "qualityTag" "PriceQualityTag" NOT NULL DEFAULT 'RAW';

-- CreateTable
CREATE TABLE "AgentPromptTemplate" (
    "id" TEXT NOT NULL,
    "promptCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userPromptTemplate" TEXT NOT NULL,
    "fewShotExamples" JSONB,
    "outputFormat" TEXT NOT NULL DEFAULT 'json',
    "variables" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ownerUserId" TEXT,
    "templateSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "workflowExecutionId" TEXT NOT NULL,
    "workflowDefinitionId" TEXT,
    "action" "DecisionAction" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "targetWindow" TEXT,
    "reasoningSummary" TEXT,
    "evidenceSummary" JSONB,
    "paramSnapshot" JSONB,
    "outputSnapshot" JSONB,
    "traceId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewComment" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExperiment" (
    "id" TEXT NOT NULL,
    "experimentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workflowDefinitionId" TEXT NOT NULL,
    "variantAVersionId" TEXT NOT NULL,
    "variantBVersionId" TEXT NOT NULL,
    "trafficSplitPercent" INTEGER NOT NULL DEFAULT 50,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "maxExecutions" INTEGER,
    "currentExecutionsA" INTEGER NOT NULL DEFAULT 0,
    "currentExecutionsB" INTEGER NOT NULL DEFAULT 0,
    "winnerVariant" TEXT,
    "conclusionSummary" TEXT,
    "metricsSnapshot" JSONB,
    "autoStopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "badCaseThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerConfig" (
    "id" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cronConfig" JSONB,
    "apiConfig" JSONB,
    "eventConfig" JSONB,
    "paramOverrides" JSONB,
    "lastTriggeredAt" TIMESTAMP(3),
    "nextFireAt" TIMESTAMP(3),
    "cronState" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriggerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerLog" (
    "id" TEXT NOT NULL,
    "triggerConfigId" TEXT NOT NULL,
    "workflowExecutionId" TEXT,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriggerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterChangeLog" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "parameterItemId" TEXT,
    "operation" TEXT NOT NULL,
    "fieldPath" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changeReason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParameterChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportTask" (
    "id" TEXT NOT NULL,
    "workflowExecutionId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sections" JSONB NOT NULL,
    "reportData" JSONB,
    "downloadUrl" TEXT,
    "errorMessage" TEXT,
    "title" VARCHAR(200),
    "includeRawData" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExperimentRun" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "workflowExecutionId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "nodeCount" INTEGER,
    "failureCategory" VARCHAR(100),
    "action" VARCHAR(60),
    "confidence" DOUBLE PRECISION,
    "riskLevel" VARCHAR(60),
    "metricsPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExperimentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateCatalog" (
    "id" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tags" JSONB,
    "coverImageUrl" TEXT,
    "dslSnapshot" JSONB NOT NULL,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuturesQuoteSnapshot" (
    "id" TEXT NOT NULL,
    "contractCode" VARCHAR(30) NOT NULL,
    "exchange" VARCHAR(10) NOT NULL,
    "lastPrice" DOUBLE PRECISION NOT NULL,
    "openPrice" DOUBLE PRECISION,
    "highPrice" DOUBLE PRECISION,
    "lowPrice" DOUBLE PRECISION,
    "closePrice" DOUBLE PRECISION,
    "settlementPrice" DOUBLE PRECISION,
    "volume" INTEGER,
    "openInterest" INTEGER,
    "bidPrice1" DOUBLE PRECISION,
    "askPrice1" DOUBLE PRECISION,
    "bidVolume1" INTEGER,
    "askVolume1" INTEGER,
    "tradingDay" VARCHAR(10) NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuturesQuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuturesDerivedFeature" (
    "id" TEXT NOT NULL,
    "contractCode" VARCHAR(30) NOT NULL,
    "featureType" VARCHAR(60) NOT NULL,
    "featureValue" DOUBLE PRECISION NOT NULL,
    "parameters" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "tradingDay" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuturesDerivedFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualFuturesPosition" (
    "id" TEXT NOT NULL,
    "accountId" VARCHAR(60) NOT NULL,
    "contractCode" VARCHAR(30) NOT NULL,
    "exchange" VARCHAR(10) NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openPrice" DOUBLE PRECISION NOT NULL,
    "currentPrice" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL,
    "remainingQty" INTEGER NOT NULL,
    "marginRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "marginAmount" DOUBLE PRECISION NOT NULL,
    "floatingPnl" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "stopLossPrice" DOUBLE PRECISION,
    "takeProfitPrice" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "ownerUserId" TEXT NOT NULL,
    "workflowExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VirtualFuturesPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualTradeLedger" (
    "id" TEXT NOT NULL,
    "accountId" VARCHAR(60) NOT NULL,
    "positionId" TEXT,
    "contractCode" VARCHAR(30) NOT NULL,
    "exchange" VARCHAR(10) NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FILLED',
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl" DOUBLE PRECISION,
    "reason" TEXT,
    "workflowExecutionId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "tradedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualTradeLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPromptTemplate_promptCode_key" ON "AgentPromptTemplate"("promptCode");

-- CreateIndex
CREATE INDEX "AgentPromptTemplate_ownerUserId_isActive_idx" ON "AgentPromptTemplate"("ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "AgentPromptTemplate_templateSource_isActive_idx" ON "AgentPromptTemplate"("templateSource", "isActive");

-- CreateIndex
CREATE INDEX "AgentPromptTemplate_roleType_idx" ON "AgentPromptTemplate"("roleType");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRecord_traceId_key" ON "DecisionRecord"("traceId");

-- CreateIndex
CREATE INDEX "DecisionRecord_workflowExecutionId_idx" ON "DecisionRecord"("workflowExecutionId");

-- CreateIndex
CREATE INDEX "DecisionRecord_workflowDefinitionId_createdAt_idx" ON "DecisionRecord"("workflowDefinitionId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionRecord_createdByUserId_createdAt_idx" ON "DecisionRecord"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionRecord_action_riskLevel_idx" ON "DecisionRecord"("action", "riskLevel");

-- CreateIndex
CREATE INDEX "DecisionRecord_isPublished_createdAt_idx" ON "DecisionRecord"("isPublished", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExperiment_experimentCode_key" ON "WorkflowExperiment"("experimentCode");

-- CreateIndex
CREATE INDEX "WorkflowExperiment_workflowDefinitionId_status_idx" ON "WorkflowExperiment"("workflowDefinitionId", "status");

-- CreateIndex
CREATE INDEX "WorkflowExperiment_status_createdAt_idx" ON "WorkflowExperiment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowExperiment_createdByUserId_createdAt_idx" ON "WorkflowExperiment"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TriggerConfig_workflowDefinitionId_triggerType_idx" ON "TriggerConfig"("workflowDefinitionId", "triggerType");

-- CreateIndex
CREATE INDEX "TriggerConfig_status_idx" ON "TriggerConfig"("status");

-- CreateIndex
CREATE INDEX "TriggerConfig_createdByUserId_idx" ON "TriggerConfig"("createdByUserId");

-- CreateIndex
CREATE INDEX "TriggerLog_triggerConfigId_triggeredAt_idx" ON "TriggerLog"("triggerConfigId", "triggeredAt");

-- CreateIndex
CREATE INDEX "TriggerLog_workflowExecutionId_idx" ON "TriggerLog"("workflowExecutionId");

-- CreateIndex
CREATE INDEX "TriggerLog_status_idx" ON "TriggerLog"("status");

-- CreateIndex
CREATE INDEX "ParameterChangeLog_parameterSetId_createdAt_idx" ON "ParameterChangeLog"("parameterSetId", "createdAt");

-- CreateIndex
CREATE INDEX "ParameterChangeLog_parameterItemId_idx" ON "ParameterChangeLog"("parameterItemId");

-- CreateIndex
CREATE INDEX "ParameterChangeLog_changedByUserId_idx" ON "ParameterChangeLog"("changedByUserId");

-- CreateIndex
CREATE INDEX "ExportTask_workflowExecutionId_createdAt_idx" ON "ExportTask"("workflowExecutionId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportTask_status_idx" ON "ExportTask"("status");

-- CreateIndex
CREATE INDEX "ExportTask_createdByUserId_createdAt_idx" ON "ExportTask"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowExperimentRun_experimentId_variant_createdAt_idx" ON "WorkflowExperimentRun"("experimentId", "variant", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowExperimentRun_workflowExecutionId_idx" ON "WorkflowExperimentRun"("workflowExecutionId");

-- CreateIndex
CREATE INDEX "WorkflowExperimentRun_variant_success_idx" ON "WorkflowExperimentRun"("variant", "success");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateCatalog_templateCode_key" ON "TemplateCatalog"("templateCode");

-- CreateIndex
CREATE INDEX "TemplateCatalog_category_status_idx" ON "TemplateCatalog"("category", "status");

-- CreateIndex
CREATE INDEX "TemplateCatalog_status_createdAt_idx" ON "TemplateCatalog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateCatalog_authorUserId_idx" ON "TemplateCatalog"("authorUserId");

-- CreateIndex
CREATE INDEX "TemplateCatalog_isOfficial_status_idx" ON "TemplateCatalog"("isOfficial", "status");

-- CreateIndex
CREATE INDEX "FuturesQuoteSnapshot_contractCode_tradingDay_idx" ON "FuturesQuoteSnapshot"("contractCode", "tradingDay");

-- CreateIndex
CREATE INDEX "FuturesQuoteSnapshot_exchange_tradingDay_idx" ON "FuturesQuoteSnapshot"("exchange", "tradingDay");

-- CreateIndex
CREATE INDEX "FuturesQuoteSnapshot_snapshotAt_idx" ON "FuturesQuoteSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "FuturesDerivedFeature_contractCode_featureType_tradingDay_idx" ON "FuturesDerivedFeature"("contractCode", "featureType", "tradingDay");

-- CreateIndex
CREATE INDEX "FuturesDerivedFeature_tradingDay_idx" ON "FuturesDerivedFeature"("tradingDay");

-- CreateIndex
CREATE INDEX "VirtualFuturesPosition_accountId_status_idx" ON "VirtualFuturesPosition"("accountId", "status");

-- CreateIndex
CREATE INDEX "VirtualFuturesPosition_ownerUserId_accountId_idx" ON "VirtualFuturesPosition"("ownerUserId", "accountId");

-- CreateIndex
CREATE INDEX "VirtualFuturesPosition_contractCode_status_idx" ON "VirtualFuturesPosition"("contractCode", "status");

-- CreateIndex
CREATE INDEX "VirtualFuturesPosition_workflowExecutionId_idx" ON "VirtualFuturesPosition"("workflowExecutionId");

-- CreateIndex
CREATE INDEX "VirtualTradeLedger_accountId_tradedAt_idx" ON "VirtualTradeLedger"("accountId", "tradedAt");

-- CreateIndex
CREATE INDEX "VirtualTradeLedger_positionId_idx" ON "VirtualTradeLedger"("positionId");

-- CreateIndex
CREATE INDEX "VirtualTradeLedger_ownerUserId_tradedAt_idx" ON "VirtualTradeLedger"("ownerUserId", "tradedAt");

-- CreateIndex
CREATE INDEX "VirtualTradeLedger_contractCode_tradedAt_idx" ON "VirtualTradeLedger"("contractCode", "tradedAt");

-- CreateIndex
CREATE INDEX "PriceData_qualityTag_effectiveDate_idx" ON "PriceData"("qualityTag", "effectiveDate");

-- CreateIndex
CREATE INDEX "price_data_point_analytics_idx" ON "PriceData"("collectionPointId", "commodity", "effectiveDate", "reviewStatus", "inputMethod", "subType");

-- CreateIndex
CREATE INDEX "price_data_region_analytics_idx" ON "PriceData"("regionCode", "commodity", "effectiveDate", "reviewStatus", "inputMethod", "subType");

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerLog" ADD CONSTRAINT "TriggerLog_triggerConfigId_fkey" FOREIGN KEY ("triggerConfigId") REFERENCES "TriggerConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExperimentRun" ADD CONSTRAINT "WorkflowExperimentRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "WorkflowExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualTradeLedger" ADD CONSTRAINT "VirtualTradeLedger_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "VirtualFuturesPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "KnowledgeRelation_fromKnowledgeId_toKnowledgeId_relationType_ke" RENAME TO "KnowledgeRelation_fromKnowledgeId_toKnowledgeId_relationTyp_key";

-- RenameIndex
ALTER INDEX "WorkflowExecution_workflowVersionId_triggerUserId_idempotencyKe" RENAME TO "WorkflowExecution_workflowVersionId_triggerUserId_idempoten_key";

