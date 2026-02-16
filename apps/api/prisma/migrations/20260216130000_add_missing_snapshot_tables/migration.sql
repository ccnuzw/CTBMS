-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentPromptTemplateSnapshot" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "promptCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "AgentPromptTemplateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentProfileSnapshot" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "AgentProfileSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentPromptTemplateSnapshot_templateId_version_idx" ON "AgentPromptTemplateSnapshot"("templateId", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentProfileSnapshot_profileId_version_idx" ON "AgentProfileSnapshot"("profileId", "version");
