-- AlterTable
ALTER TABLE "AgentPromptTemplate" ADD COLUMN IF NOT EXISTS "guardrails" JSONB;
ALTER TABLE "AgentPromptTemplate" ADD COLUMN IF NOT EXISTS "outputSchemaCode" TEXT;
