/*
  Warnings:

  - A unique constraint covering the columns `[effectiveDate,commodity,location,sourceType,subType]` on the table `PriceData` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PriceSourceType" AS ENUM ('ENTERPRISE', 'REGIONAL', 'PORT');

-- CreateEnum
CREATE TYPE "PriceSubType" AS ENUM ('LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION_ORIGIN', 'STATION_DEST', 'PURCHASE', 'WHOLESALE', 'OTHER');

-- CreateEnum
CREATE TYPE "GeoLevel" AS ENUM ('COUNTRY', 'REGION', 'PROVINCE', 'CITY', 'DISTRICT', 'PORT', 'STATION', 'ENTERPRISE');

-- DropIndex
DROP INDEX "PriceData_effectiveDate_commodity_location_key";

-- AlterTable
ALTER TABLE "PriceData" ADD COLUMN     "city" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "enterpriseId" TEXT,
ADD COLUMN     "enterpriseName" TEXT,
ADD COLUMN     "geoLevel" "GeoLevel" NOT NULL DEFAULT 'CITY',
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "sourceType" "PriceSourceType" NOT NULL DEFAULT 'REGIONAL',
ADD COLUMN     "subType" "PriceSubType" NOT NULL DEFAULT 'LISTED';

-- CreateIndex
CREATE INDEX "PriceData_sourceType_commodity_effectiveDate_idx" ON "PriceData"("sourceType", "commodity", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceData_geoLevel_effectiveDate_idx" ON "PriceData"("geoLevel", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceData_enterpriseId_effectiveDate_idx" ON "PriceData"("enterpriseId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceData_province_city_effectiveDate_idx" ON "PriceData"("province", "city", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "PriceData_effectiveDate_commodity_location_sourceType_subTy_key" ON "PriceData"("effectiveDate", "commodity", "location", "sourceType", "subType");

-- AddForeignKey
ALTER TABLE "PriceData" ADD CONSTRAINT "PriceData_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
