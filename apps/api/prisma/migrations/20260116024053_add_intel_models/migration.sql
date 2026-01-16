-- CreateEnum
CREATE TYPE "IntelEntityLinkType" AS ENUM ('MENTIONED', 'SUBJECT', 'SOURCE');

-- CreateEnum
CREATE TYPE "IntelTaskType" AS ENUM ('PRICE_REPORT', 'FIELD_CHECK', 'DOCUMENT_SCAN');

-- CreateEnum
CREATE TYPE "IntelTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'OVERDUE');

-- CreateTable
CREATE TABLE "PriceData" (
    "id" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "commodity" TEXT NOT NULL,
    "grade" TEXT,
    "location" TEXT NOT NULL,
    "region" TEXT[],
    "price" DECIMAL(10,2) NOT NULL,
    "moisture" DECIMAL(5,2),
    "bulkDensity" INTEGER,
    "toxin" DECIMAL(5,2),
    "freight" DECIMAL(10,2),
    "inventory" INTEGER,
    "foldPrice" DECIMAL(10,2),
    "dayChange" DECIMAL(10,2),
    "yearChange" DECIMAL(10,2),
    "intelId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelAttachment" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "ocrText" TEXT,
    "intelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelEntityLink" (
    "id" TEXT NOT NULL,
    "intelId" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "linkType" "IntelEntityLinkType" NOT NULL DEFAULT 'MENTIONED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelEntityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "IntelTaskType" NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" "IntelTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "intelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceData_commodity_effectiveDate_idx" ON "PriceData"("commodity", "effectiveDate");

-- CreateIndex
CREATE INDEX "PriceData_location_effectiveDate_idx" ON "PriceData"("location", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "PriceData_effectiveDate_commodity_location_key" ON "PriceData"("effectiveDate", "commodity", "location");

-- CreateIndex
CREATE INDEX "IntelAttachment_intelId_idx" ON "IntelAttachment"("intelId");

-- CreateIndex
CREATE INDEX "IntelEntityLink_enterpriseId_idx" ON "IntelEntityLink"("enterpriseId");

-- CreateIndex
CREATE UNIQUE INDEX "IntelEntityLink_intelId_enterpriseId_key" ON "IntelEntityLink"("intelId", "enterpriseId");

-- CreateIndex
CREATE INDEX "IntelTask_assigneeId_status_idx" ON "IntelTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "IntelTask_deadline_idx" ON "IntelTask"("deadline");

-- AddForeignKey
ALTER TABLE "PriceData" ADD CONSTRAINT "PriceData_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelAttachment" ADD CONSTRAINT "IntelAttachment_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelEntityLink" ADD CONSTRAINT "IntelEntityLink_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelEntityLink" ADD CONSTRAINT "IntelEntityLink_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTask" ADD CONSTRAINT "IntelTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelTask" ADD CONSTRAINT "IntelTask_intelId_fkey" FOREIGN KEY ("intelId") REFERENCES "MarketIntel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
