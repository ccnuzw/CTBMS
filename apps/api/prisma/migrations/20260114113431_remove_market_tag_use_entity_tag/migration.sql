/*
  Warnings:

  - You are about to drop the `MarketTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_InfoTags` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_InfoTags" DROP CONSTRAINT "_InfoTags_A_fkey";

-- DropForeignKey
ALTER TABLE "_InfoTags" DROP CONSTRAINT "_InfoTags_B_fkey";

-- DropTable
DROP TABLE "MarketTag";

-- DropTable
DROP TABLE "_InfoTags";
