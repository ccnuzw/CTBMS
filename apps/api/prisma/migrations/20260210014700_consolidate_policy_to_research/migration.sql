-- Step 1: Migrate existing POLICY KnowledgeItems to RESEARCH
UPDATE "KnowledgeItem" SET "type" = 'RESEARCH' WHERE "type" = 'POLICY';

-- Step 2: Migrate existing POLICY_DOC MarketIntel to RESEARCH_REPORT
UPDATE "MarketIntel" SET "contentType" = 'RESEARCH_REPORT' WHERE "contentType" = 'POLICY_DOC';

-- Step 3: Remove POLICY from KnowledgeType enum and add AI_REPORT
ALTER TYPE "KnowledgeType" RENAME TO "KnowledgeType_old";
CREATE TYPE "KnowledgeType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'RESEARCH', 'FLASH', 'THIRD_PARTY', 'AI_REPORT');
ALTER TABLE "KnowledgeItem" ALTER COLUMN "type" TYPE "KnowledgeType" USING "type"::text::"KnowledgeType";
DROP TYPE "KnowledgeType_old";

-- Step 4: Remove POLICY_DOC from ContentType enum
ALTER TYPE "ContentType" RENAME TO "ContentType_old";
CREATE TYPE "ContentType" AS ENUM ('DAILY_REPORT', 'RESEARCH_REPORT');
ALTER TABLE "MarketIntel" ALTER COLUMN "contentType" TYPE "ContentType" USING "contentType"::text::"ContentType";
DROP TYPE "ContentType_old";
