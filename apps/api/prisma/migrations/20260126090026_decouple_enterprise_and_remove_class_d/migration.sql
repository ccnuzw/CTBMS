/*
  Warnings:

  - The values [D_ENTITY] on the enum `IntelCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `enterpriseId` on the `MarketEvent` table. All the data in the column will be lost.
  - You are about to drop the column `enterpriseId` on the `PriceData` table. All the data in the column will be lost.
  - You are about to drop the column `enterpriseName` on the `PriceData` table. All the data in the column will be lost.
  - You are about to drop the `IntelEntityLink` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[templateId,assigneeId,periodStart]` on the table `IntelTask` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "IntelPointLinkType" AS ENUM ('MENTIONED', 'SUBJECT', 'SOURCE');

-- AlterEnum
BEGIN;
CREATE TYPE "IntelCategory_new" AS ENUM ('A_STRUCTURED', 'B_SEMI_STRUCTURED', 'C_DOCUMENT');
ALTER TABLE "MarketIntel" ALTER COLUMN "category" TYPE "IntelCategory_new" USING ("category"::text::"IntelCategory_new");
ALTER TABLE "PromptTemplate" ALTER COLUMN "category" TYPE "IntelCategory_new" USING ("category"::text::"IntelCategory_new");
ALTER TYPE "IntelCategory" RENAME TO "IntelCategory_old";
ALTER TYPE "IntelCategory_new" RENAME TO "IntelCategory";
DROP TYPE "IntelCategory_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "IntelEntityLink" DROP CONSTRAINT "IntelEntityLink_enterpriseId_fkey";

-- DropForeignKey
ALTER TABLE "IntelEntityLink" DROP CONSTRAINT "IntelEntityLink_intelId_fkey";

-- DropForeignKey
ALTER TABLE "MarketEvent" DROP CONSTRAINT "MarketEvent_enterpriseId_fkey";

-- DropForeignKey
ALTER TABLE "PriceData" DROP CONSTRAINT "PriceData_enterpriseId_fkey";

-- DropIndex
DROP INDEX "MarketEvent_enterpriseId_idx";

-- DropIndex
DROP INDEX "PriceData_enterpriseId_effectiveDate_idx";

-- AlterTable
ALTER TABLE "CollectionPoint" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "contactInfo" JSONB,
ADD COLUMN     "isMarketEntity" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "IntelTask" ADD COLUMN     "assigneeDeptId" TEXT,
ADD COLUMN     "assigneeOrgId" TEXT,
ADD COLUMN     "attachmentUrls" TEXT[],
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "isLate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyConfig" JSONB,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "requirements" TEXT;

-- AlterTable
ALTER TABLE "IntelTaskTemplate" ADD COLUMN     "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "activeUntil" TIMESTAMP(3),
ADD COLUMN     "allowLate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dueAtMinute" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "dueDayOfMonth" INTEGER,
ADD COLUMN     "dueDayOfWeek" INTEGER,
ADD COLUMN     "maxBackfillPeriods" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "runAtMinute" INTEGER NOT NULL DEFAULT 540,
ADD COLUMN     "runDayOfMonth" INTEGER,
ADD COLUMN     "runDayOfWeek" INTEGER,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';

-- AlterTable
ALTER TABLE "MarketEvent" DROP COLUMN "enterpriseId";

-- AlterTable
ALTER TABLE "PriceData" DROP COLUMN "enterpriseId",
DROP COLUMN "enterpriseName";

-- DropTable
DROP TABLE "IntelEntityLink";

-- DropEnum
DROP TYPE "IntelEntityLinkType";

-- CreateTable
CREATE TABLE "IntelPointLink" (
    "id" TEXT NOT NULL,
    "intelId" TEXT NOT NULL,
    "collectionPointId" TEXT NOT NULL,
    "linkType" "IntelPointLinkType" NOT NULL DEFAULT 'MENTIONED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelPointLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntelPointLink_collectionPointId_idx" ON "IntelPointLink"("collectionPointId");

-- CreateIndex
CREATE UNIQUE INDEX "IntelPointLink_intelId_collectionPointId_key" ON "IntelPointLink"("intelId", "collectionPointId");

-- CreateIndex
CREATE INDEX "IntelTask_periodKey_idx" ON "IntelTask"("periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntelTask_templateId_assigneeId_periodStart_key" ON "IntelTask"("templateId", "assigneeId", "periodStart");

-- AddForeignKey
ALTER TABLE "IntelPointLink" ADD CONSTRAINT "IntelPointLink_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelPointLink" ADD CONSTRAINT "IntelPointLink_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
