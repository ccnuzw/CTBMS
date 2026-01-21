-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('DAILY_REPORT', 'RESEARCH_REPORT', 'POLICY_DOC');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'POLICY', 'RESEARCH', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntelSourceType" ADD VALUE 'RESEARCH_INST';
ALTER TYPE "IntelSourceType" ADD VALUE 'MEDIA';

-- AlterTable
ALTER TABLE "MarketIntel" ADD COLUMN     "contentType" "ContentType";

-- CreateTable
CREATE TABLE "ResearchReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "publishDate" TIMESTAMP(3),
    "source" TEXT,
    "summary" TEXT NOT NULL,
    "keyPoints" JSONB,
    "prediction" JSONB,
    "dataPoints" JSONB,
    "commodities" TEXT[],
    "regions" TEXT[],
    "timeframe" TEXT,
    "intelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchReport_intelId_key" ON "ResearchReport"("intelId");

-- CreateIndex
CREATE INDEX "ResearchReport_reportType_idx" ON "ResearchReport"("reportType");

-- CreateIndex
CREATE INDEX "ResearchReport_publishDate_idx" ON "ResearchReport"("publishDate");

-- CreateIndex
CREATE INDEX "MarketIntel_contentType_idx" ON "MarketIntel"("contentType");

-- AddForeignKey
ALTER TABLE "ResearchReport" ADD CONSTRAINT "ResearchReport_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
