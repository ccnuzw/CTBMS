/*
  Warnings:

  - You are about to drop the column `timeoutMs` on the `AIModelConfig` table. All the data in the column will be lost.
  - You are about to drop the column `timeoutMs` on the `AgentProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AIModelConfig" DROP COLUMN "timeoutMs",
ADD COLUMN     "timeoutSeconds" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "AgentProfile" DROP COLUMN "timeoutMs",
ADD COLUMN     "skillCodes" JSONB,
ADD COLUMN     "timeoutSeconds" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "DecisionRulePack" ADD COLUMN     "conditionAST" JSONB;

-- AlterTable
ALTER TABLE "ParameterItem" ADD COLUMN     "optionsSourceId" TEXT,
ADD COLUMN     "uiComponent" TEXT,
ADD COLUMN     "uiProps" JSONB;

-- AlterTable
ALTER TABLE "WorkflowDefinition" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stars" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AgentSkill" (
    "id" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "handlerCode" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "templateSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkill_skillCode_key" ON "AgentSkill"("skillCode");

-- CreateIndex
CREATE INDEX "AgentSkill_ownerUserId_isActive_idx" ON "AgentSkill"("ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "AgentSkill_templateSource_isActive_idx" ON "AgentSkill"("templateSource", "isActive");

-- CreateIndex
CREATE INDEX "AgentSkill_handlerCode_idx" ON "AgentSkill"("handlerCode");
