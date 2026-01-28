/*
  Warnings:

  - The values [WEEKLY,MONTHLY,QUARTERLY,ANNUAL,OTHER] on the enum `ReportType` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReportPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ADHOC');

-- AlterEnum
BEGIN;
CREATE TYPE "ReportType_new" AS ENUM ('POLICY', 'MARKET', 'RESEARCH', 'INDUSTRY');
ALTER TABLE "ResearchReport" ALTER COLUMN "reportType" TYPE "ReportType_new" USING ("reportType"::text::"ReportType_new");
ALTER TYPE "ReportType" RENAME TO "ReportType_old";
ALTER TYPE "ReportType_new" RENAME TO "ReportType";
DROP TYPE "ReportType_old";
COMMIT;

-- AlterEnum
ALTER TYPE "ReviewStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "ResearchReport" ADD COLUMN     "reportPeriod" "ReportPeriod";

-- CreateIndex
CREATE INDEX "ResearchReport_reportPeriod_idx" ON "ResearchReport"("reportPeriod");
