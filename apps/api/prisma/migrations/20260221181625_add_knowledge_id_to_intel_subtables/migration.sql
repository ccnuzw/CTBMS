-- AlterTable
ALTER TABLE "MarketEvent" ADD COLUMN     "knowledgeId" TEXT,
ALTER COLUMN "intelId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MarketInsight" ADD COLUMN     "knowledgeId" TEXT,
ALTER COLUMN "intelId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PriceData" ADD COLUMN     "knowledgeId" TEXT;

-- CreateIndex
CREATE INDEX "MarketEvent_knowledgeId_idx" ON "MarketEvent"("knowledgeId");

-- CreateIndex
CREATE INDEX "MarketInsight_knowledgeId_idx" ON "MarketInsight"("knowledgeId");

-- CreateIndex
CREATE INDEX "PriceData_knowledgeId_idx" ON "PriceData"("knowledgeId");

-- AddForeignKey
ALTER TABLE "PriceData" ADD CONSTRAINT "PriceData_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketEvent" ADD CONSTRAINT "MarketEvent_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketInsight" ADD CONSTRAINT "MarketInsight_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
