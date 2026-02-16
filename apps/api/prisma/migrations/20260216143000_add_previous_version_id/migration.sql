-- AlterTable
ALTER TABLE "AgentPromptTemplate" ADD COLUMN IF NOT EXISTS "previousVersionId" TEXT;
