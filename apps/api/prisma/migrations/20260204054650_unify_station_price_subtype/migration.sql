/*
  Warnings:

  - The values [STATION_ORIGIN,STATION_DEST] on the enum `PriceSubType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PriceSubType_new" AS ENUM ('LISTED', 'TRANSACTION', 'ARRIVAL', 'FOB', 'STATION', 'PURCHASE', 'WHOLESALE', 'OTHER');
ALTER TABLE "PriceData" ALTER COLUMN "subType" DROP DEFAULT;
ALTER TABLE "PriceData" ALTER COLUMN "subType" TYPE "PriceSubType_new" USING ("subType"::text::"PriceSubType_new");
ALTER TYPE "PriceSubType" RENAME TO "PriceSubType_old";
ALTER TYPE "PriceSubType_new" RENAME TO "PriceSubType";
DROP TYPE "PriceSubType_old";
ALTER TABLE "PriceData" ALTER COLUMN "subType" SET DEFAULT 'LISTED';
COMMIT;
