-- Knowledge V2 enums
CREATE TYPE "KnowledgeType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'RESEARCH', 'POLICY', 'FLASH', 'THIRD_PARTY');
CREATE TYPE "KnowledgePeriodType" AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'ADHOC');
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "KnowledgeContentFormat" AS ENUM ('PLAIN', 'MARKDOWN', 'HTML');
CREATE TYPE "KnowledgeRelationType" AS ENUM ('DERIVED_FROM', 'CITES', 'SAME_TOPIC', 'FOLLOW_UP', 'CONTRADICTS', 'WEEKLY_ROLLUP_OF');
CREATE TYPE "KnowledgeTagSource" AS ENUM ('AI', 'RULE', 'MANUAL');

-- Knowledge item
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "title" TEXT NOT NULL,
    "contentFormat" "KnowledgeContentFormat" NOT NULL DEFAULT 'HTML',
    "contentPlain" TEXT NOT NULL,
    "contentRich" TEXT,
    "sourceType" TEXT,
    "publishAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "periodType" "KnowledgePeriodType" NOT NULL DEFAULT 'ADHOC',
    "periodKey" TEXT,
    "location" TEXT,
    "region" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commodities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentVersionId" TEXT,
    "originLegacyType" TEXT,
    "originLegacyId" TEXT,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- Knowledge analysis
CREATE TABLE "KnowledgeAnalysis" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "summary" TEXT,
    "sentiment" TEXT,
    "confidenceScore" INTEGER,
    "reportType" TEXT,
    "reportPeriod" TEXT,
    "keyPoints" JSONB,
    "prediction" JSONB,
    "dataPoints" JSONB,
    "events" JSONB,
    "insights" JSONB,
    "marketSentiment" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "traceLogs" JSONB,
    "modelName" TEXT,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeAnalysis_pkey" PRIMARY KEY ("id")
);

-- Attachment
CREATE TABLE "KnowledgeAttachment" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "ocrText" TEXT,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAttachment_pkey" PRIMARY KEY ("id")
);

-- Relation
CREATE TABLE "KnowledgeRelation" (
    "id" TEXT NOT NULL,
    "fromKnowledgeId" TEXT NOT NULL,
    "toKnowledgeId" TEXT NOT NULL,
    "relationType" "KnowledgeRelationType" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRelation_pkey" PRIMARY KEY ("id")
);

-- Tag map
CREATE TABLE "KnowledgeTagMap" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "tagCode" TEXT NOT NULL,
    "tagSource" "KnowledgeTagSource" NOT NULL DEFAULT 'AI',
    "score" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeTagMap_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "KnowledgeItem_type_publishAt_idx" ON "KnowledgeItem"("type", "publishAt");
CREATE INDEX "KnowledgeItem_periodType_periodKey_idx" ON "KnowledgeItem"("periodType", "periodKey");
CREATE INDEX "KnowledgeItem_status_publishAt_idx" ON "KnowledgeItem"("status", "publishAt");
CREATE INDEX "KnowledgeItem_sourceType_status_idx" ON "KnowledgeItem"("sourceType", "status");
CREATE INDEX "KnowledgeItem_authorId_idx" ON "KnowledgeItem"("authorId");
CREATE INDEX "KnowledgeItem_originLegacyType_originLegacyId_idx" ON "KnowledgeItem"("originLegacyType", "originLegacyId");

CREATE UNIQUE INDEX "KnowledgeAnalysis_knowledgeId_key" ON "KnowledgeAnalysis"("knowledgeId");
CREATE INDEX "KnowledgeAttachment_knowledgeId_idx" ON "KnowledgeAttachment"("knowledgeId");
CREATE UNIQUE INDEX "KnowledgeRelation_fromKnowledgeId_toKnowledgeId_relationType_key" ON "KnowledgeRelation"("fromKnowledgeId", "toKnowledgeId", "relationType");
CREATE INDEX "KnowledgeRelation_fromKnowledgeId_idx" ON "KnowledgeRelation"("fromKnowledgeId");
CREATE INDEX "KnowledgeRelation_toKnowledgeId_idx" ON "KnowledgeRelation"("toKnowledgeId");
CREATE UNIQUE INDEX "KnowledgeTagMap_knowledgeId_tagCode_tagSource_key" ON "KnowledgeTagMap"("knowledgeId", "tagCode", "tagSource");
CREATE INDEX "KnowledgeTagMap_knowledgeId_idx" ON "KnowledgeTagMap"("knowledgeId");
CREATE INDEX "KnowledgeTagMap_tagCode_idx" ON "KnowledgeTagMap"("tagCode");

-- Foreign keys
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_parentVersionId_fkey"
    FOREIGN KEY ("parentVersionId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeAnalysis" ADD CONSTRAINT "KnowledgeAnalysis_knowledgeId_fkey"
    FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeAttachment" ADD CONSTRAINT "KnowledgeAttachment_knowledgeId_fkey"
    FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_fromKnowledgeId_fkey"
    FOREIGN KEY ("fromKnowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_toKnowledgeId_fkey"
    FOREIGN KEY ("toKnowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeTagMap" ADD CONSTRAINT "KnowledgeTagMap_knowledgeId_fkey"
    FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
