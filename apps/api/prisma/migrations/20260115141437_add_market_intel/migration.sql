-- CreateEnum
CREATE TYPE "IntelCategory" AS ENUM ('A_STRUCTURED', 'B_SEMI_STRUCTURED', 'C_DOCUMENT', 'D_ENTITY');

-- CreateEnum
CREATE TYPE "IntelSourceType" AS ENUM ('FIRST_LINE', 'COMPETITOR', 'OFFICIAL');

-- CreateTable
CREATE TABLE "MarketIntel" (
    "id" TEXT NOT NULL,
    "category" "IntelCategory" NOT NULL,
    "sourceType" "IntelSourceType" NOT NULL,
    "effectiveTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "region" TEXT[],
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "gpsVerified" BOOLEAN NOT NULL DEFAULT false,
    "rawContent" TEXT NOT NULL,
    "summary" TEXT,
    "aiAnalysis" JSONB,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "scarcityScore" INTEGER NOT NULL DEFAULT 0,
    "validationScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIntel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIntelStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "monthlyPoints" INTEGER NOT NULL DEFAULT 0,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "accuracyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "highValueCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIntelStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketIntel_category_idx" ON "MarketIntel"("category");

-- CreateIndex
CREATE INDEX "MarketIntel_sourceType_idx" ON "MarketIntel"("sourceType");

-- CreateIndex
CREATE INDEX "MarketIntel_effectiveTime_idx" ON "MarketIntel"("effectiveTime");

-- CreateIndex
CREATE INDEX "MarketIntel_authorId_idx" ON "MarketIntel"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIntelStats_userId_key" ON "UserIntelStats"("userId");

-- AddForeignKey
ALTER TABLE "MarketIntel" ADD CONSTRAINT "MarketIntel_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntelStats" ADD CONSTRAINT "UserIntelStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
