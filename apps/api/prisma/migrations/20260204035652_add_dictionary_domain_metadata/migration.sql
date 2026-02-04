-- AlterTable
ALTER TABLE "DictionaryDomain" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isSystemDomain" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usageHint" TEXT,
ADD COLUMN     "usageLocations" TEXT[];
