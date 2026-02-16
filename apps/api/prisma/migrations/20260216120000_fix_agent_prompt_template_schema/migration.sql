-- AlterTable
ALTER TABLE "AgentPromptTemplate" ADD COLUMN "guardrails" JSONB;
ALTER TABLE "AgentPromptTemplate" ADD COLUMN "outputSchemaCode" TEXT;
