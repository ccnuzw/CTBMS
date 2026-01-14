/*
  Warnings:

  - The values [VEHICLE] on the enum `TagScope` will be removed. If these variants are still used in the database, this will fail.
  - The values [VEHICLE] on the enum `TaggableEntityType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TagScope_new" AS ENUM ('GLOBAL', 'CUSTOMER', 'SUPPLIER', 'LOGISTICS', 'CONTRACT', 'MARKET_INFO');
ALTER TABLE "Tag" ALTER COLUMN "scopes" DROP DEFAULT;
ALTER TABLE "Tag" ALTER COLUMN "scopes" TYPE "TagScope_new"[] USING ("scopes"::text::"TagScope_new"[]);
ALTER TYPE "TagScope" RENAME TO "TagScope_old";
ALTER TYPE "TagScope_new" RENAME TO "TagScope";
DROP TYPE "TagScope_old";
ALTER TABLE "Tag" ALTER COLUMN "scopes" SET DEFAULT ARRAY['GLOBAL']::"TagScope"[];
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TaggableEntityType_new" AS ENUM ('CUSTOMER', 'SUPPLIER', 'LOGISTICS', 'CONTRACT', 'MARKET_INFO');
ALTER TABLE "EntityTag" ALTER COLUMN "entityType" TYPE "TaggableEntityType_new" USING ("entityType"::text::"TaggableEntityType_new");
ALTER TYPE "TaggableEntityType" RENAME TO "TaggableEntityType_old";
ALTER TYPE "TaggableEntityType_new" RENAME TO "TaggableEntityType";
DROP TYPE "TaggableEntityType_old";
COMMIT;
