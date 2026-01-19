-- AlterTable
ALTER TABLE "PriceData" ADD COLUMN     "collectionPointId" TEXT,
ADD COLUMN     "regionCode" TEXT;

-- CreateIndex
CREATE INDEX "PriceData_collectionPointId_effectiveDate_idx" ON "PriceData"("collectionPointId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceData_regionCode_effectiveDate_idx" ON "PriceData"("regionCode", "effectiveDate");

-- AddForeignKey
ALTER TABLE "PriceData" ADD CONSTRAINT "PriceData_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
