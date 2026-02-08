/*
  Warnings:

  - A unique constraint covering the columns `[priceSubmissionId]` on the table `IntelTask` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[templateId,assigneeId,periodStart,collectionPointId,commodity]` on the table `IntelTask` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[effectiveDate,collectionPointId,commodity,sourceType,subType]` on the table `PriceData` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PriceInputMethod" AS ENUM ('AI_EXTRACTED', 'MANUAL_ENTRY', 'BULK_IMPORT');

-- CreateEnum
CREATE TYPE "PriceReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIAL_APPROVED', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntelTaskStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "IntelTaskStatus" ADD VALUE 'RETURNED';

-- DropIndex
DROP INDEX "IntelTask_templateId_assigneeId_periodStart_key";

-- AlterTable
ALTER TABLE "CollectionPoint" ADD COLUMN     "commodityConfigs" JSONB;

-- AlterTable
ALTER TABLE "IntelTask" ADD COLUMN     "collectionPointId" TEXT,
ADD COLUMN     "commodity" TEXT,
ADD COLUMN     "priceSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "IntelTaskTemplate" ADD COLUMN     "collectionPointId" TEXT,
ADD COLUMN     "collectionPointIds" TEXT[],
ADD COLUMN     "targetPointType" "CollectionPointType";

-- AlterTable
ALTER TABLE "PriceData" ADD COLUMN     "inputMethod" "PriceInputMethod" NOT NULL DEFAULT 'AI_EXTRACTED',
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "PriceReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submissionId" TEXT;

-- CreateTable
CREATE TABLE "CollectionPointAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionPointId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commodity" TEXT,
    "remark" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionPointAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSubmission" (
    "id" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "collectionPointId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelTaskHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelTaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionPointAllocation_userId_isActive_idx" ON "CollectionPointAllocation"("userId", "isActive");

-- CreateIndex
CREATE INDEX "CollectionPointAllocation_collectionPointId_isActive_idx" ON "CollectionPointAllocation"("collectionPointId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPointAllocation_userId_collectionPointId_commodit_key" ON "CollectionPointAllocation"("userId", "collectionPointId", "commodity");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSubmission_batchCode_key" ON "PriceSubmission"("batchCode");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSubmission_taskId_key" ON "PriceSubmission"("taskId");

-- CreateIndex
CREATE INDEX "PriceSubmission_collectionPointId_effectiveDate_idx" ON "PriceSubmission"("collectionPointId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceSubmission_submittedById_status_idx" ON "PriceSubmission"("submittedById", "status");

-- CreateIndex
CREATE INDEX "IntelTaskHistory_taskId_idx" ON "IntelTaskHistory"("taskId");

-- CreateIndex
CREATE INDEX "IntelTaskHistory_operatorId_idx" ON "IntelTaskHistory"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "IntelTask_priceSubmissionId_key" ON "IntelTask"("priceSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "IntelTask_templateId_assigneeId_periodStart_collectionPoint_key" ON "IntelTask"("templateId", "assigneeId", "periodStart", "collectionPointId", "commodity");

-- CreateIndex
CREATE INDEX "PriceData_inputMethod_effectiveDate_idx" ON "PriceData"("inputMethod", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceData_reviewStatus_idx" ON "PriceData"("reviewStatus");

-- CreateIndex
CREATE INDEX "PriceData_submissionId_idx" ON "PriceData"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "price_data_collection_point_unique" ON "PriceData"("effectiveDate", "collectionPointId", "commodity", "sourceType", "subType");

-- AddForeignKey
ALTER TABLE "PriceData" ADD CONSTRAINT "PriceData_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PriceSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPointAllocation" ADD CONSTRAINT "CollectionPointAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPointAllocation" ADD CONSTRAINT "CollectionPointAllocation_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSubmission" ADD CONSTRAINT "PriceSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSubmission" ADD CONSTRAINT "PriceSubmission_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTask" ADD CONSTRAINT "IntelTask_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTask" ADD CONSTRAINT "IntelTask_priceSubmissionId_fkey" FOREIGN KEY ("priceSubmissionId") REFERENCES "PriceSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTaskTemplate" ADD CONSTRAINT "IntelTaskTemplate_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTaskHistory" ADD CONSTRAINT "IntelTaskHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "IntelTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTaskHistory" ADD CONSTRAINT "IntelTaskHistory_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "PriceData_effectiveDate_commodity_location_sourceType_subTy_key" RENAME TO "price_data_location_unique";
