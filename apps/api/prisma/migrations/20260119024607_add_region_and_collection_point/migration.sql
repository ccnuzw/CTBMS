-- CreateEnum
CREATE TYPE "RegionLevel" AS ENUM ('COUNTRY', 'PROVINCE', 'CITY', 'DISTRICT', 'TOWN');

-- CreateEnum
CREATE TYPE "CollectionPointType" AS ENUM ('ENTERPRISE', 'PORT', 'STATION', 'REGION', 'MARKET');

-- CreateTable
CREATE TABLE "AdministrativeRegion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "level" "RegionLevel" NOT NULL,
    "parentCode" TEXT,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AdministrativeRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPoint" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "aliases" TEXT[],
    "type" "CollectionPointType" NOT NULL,
    "regionCode" TEXT,
    "address" TEXT,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "commodities" TEXT[],
    "defaultSubType" TEXT,
    "enterpriseId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "CollectionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeRegion_code_key" ON "AdministrativeRegion"("code");

-- CreateIndex
CREATE INDEX "AdministrativeRegion_level_idx" ON "AdministrativeRegion"("level");

-- CreateIndex
CREATE INDEX "AdministrativeRegion_parentCode_idx" ON "AdministrativeRegion"("parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPoint_code_key" ON "CollectionPoint"("code");

-- CreateIndex
CREATE INDEX "CollectionPoint_type_idx" ON "CollectionPoint"("type");

-- CreateIndex
CREATE INDEX "CollectionPoint_regionCode_idx" ON "CollectionPoint"("regionCode");

-- CreateIndex
CREATE INDEX "CollectionPoint_isActive_priority_idx" ON "CollectionPoint"("isActive", "priority");

-- AddForeignKey
ALTER TABLE "AdministrativeRegion" ADD CONSTRAINT "AdministrativeRegion_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "AdministrativeRegion"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "AdministrativeRegion"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
