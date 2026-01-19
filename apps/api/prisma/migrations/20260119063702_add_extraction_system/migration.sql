-- AlterTable
ALTER TABLE "CollectionPoint" ADD COLUMN     "isDataSource" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "matchKeywords" TEXT[],
ADD COLUMN     "matchRegionCodes" TEXT[],
ADD COLUMN     "priceSubTypes" TEXT[];

-- CreateTable
CREATE TABLE "EventTypeConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightTypeConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "targetType" TEXT NOT NULL,
    "eventTypeId" TEXT,
    "insightTypeId" TEXT,
    "conditions" JSONB NOT NULL,
    "outputConfig" JSONB,
    "commodities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketEvent" (
    "id" TEXT NOT NULL,
    "intelId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceStart" INTEGER,
    "sourceEnd" INTEGER,
    "sectionIndex" INTEGER,
    "eventTypeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "impact" TEXT,
    "impactLevel" TEXT,
    "sentiment" TEXT,
    "collectionPointId" TEXT,
    "enterpriseId" TEXT,
    "regionCode" TEXT,
    "commodity" TEXT,
    "eventDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketInsight" (
    "id" TEXT NOT NULL,
    "intelId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceStart" INTEGER,
    "sourceEnd" INTEGER,
    "sectionTitle" TEXT,
    "sectionIndex" INTEGER,
    "insightTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "direction" TEXT,
    "timeframe" TEXT,
    "confidence" INTEGER,
    "factors" TEXT[],
    "commodity" TEXT,
    "regionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventTypeConfig_code_key" ON "EventTypeConfig"("code");

-- CreateIndex
CREATE INDEX "EventTypeConfig_isActive_sortOrder_idx" ON "EventTypeConfig"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InsightTypeConfig_code_key" ON "InsightTypeConfig"("code");

-- CreateIndex
CREATE INDEX "InsightTypeConfig_isActive_sortOrder_idx" ON "InsightTypeConfig"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ExtractionRule_targetType_isActive_idx" ON "ExtractionRule"("targetType", "isActive");

-- CreateIndex
CREATE INDEX "MarketEvent_eventTypeId_eventDate_idx" ON "MarketEvent"("eventTypeId", "eventDate");

-- CreateIndex
CREATE INDEX "MarketEvent_intelId_idx" ON "MarketEvent"("intelId");

-- CreateIndex
CREATE INDEX "MarketEvent_enterpriseId_idx" ON "MarketEvent"("enterpriseId");

-- CreateIndex
CREATE INDEX "MarketEvent_collectionPointId_idx" ON "MarketEvent"("collectionPointId");

-- CreateIndex
CREATE INDEX "MarketInsight_insightTypeId_idx" ON "MarketInsight"("insightTypeId");

-- CreateIndex
CREATE INDEX "MarketInsight_intelId_idx" ON "MarketInsight"("intelId");

-- CreateIndex
CREATE INDEX "MarketInsight_commodity_idx" ON "MarketInsight"("commodity");

-- AddForeignKey
ALTER TABLE "ExtractionRule" ADD CONSTRAINT "ExtractionRule_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionRule" ADD CONSTRAINT "ExtractionRule_insightTypeId_fkey" FOREIGN KEY ("insightTypeId") REFERENCES "InsightTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventTypeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketInsight" ADD CONSTRAINT "MarketInsight_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketInsight" ADD CONSTRAINT "MarketInsight_insightTypeId_fkey" FOREIGN KEY ("insightTypeId") REFERENCES "InsightTypeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
