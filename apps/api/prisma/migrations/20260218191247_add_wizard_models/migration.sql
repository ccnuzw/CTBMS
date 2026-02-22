-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "outputSchema" JSONB;

-- AlterTable
ALTER TABLE "AgentPromptTemplate" ADD COLUMN     "outputSchema" JSONB;

-- CreateTable
CREATE TABLE "AgentPersona" (
    "id" TEXT NOT NULL,
    "personaCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleType" TEXT NOT NULL,
    "icon" TEXT,
    "defaultConfig" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WizardSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'personaSelection',
    "sessionData" JSONB,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WizardSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPersona_personaCode_key" ON "AgentPersona"("personaCode");

-- CreateIndex
CREATE INDEX "WizardSession_userId_isCompleted_idx" ON "WizardSession"("userId", "isCompleted");
