-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "IntelCategory" NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "variables" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMappingRule" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "matchMode" TEXT NOT NULL DEFAULT 'CONTAINS',
    "pattern" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMappingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelConfig" (
    "id" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "apiUrl" TEXT,
    "apiKeyEnvVar" TEXT,
    "apiKey" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 8192,
    "topP" DOUBLE PRECISION,
    "topK" INTEGER,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_code_key" ON "PromptTemplate"("code");

-- CreateIndex
CREATE INDEX "PromptTemplate_category_idx" ON "PromptTemplate"("category");

-- CreateIndex
CREATE INDEX "PromptTemplate_isActive_idx" ON "PromptTemplate"("isActive");

-- CreateIndex
CREATE INDEX "BusinessMappingRule_domain_priority_idx" ON "BusinessMappingRule"("domain", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelConfig_configKey_key" ON "AIModelConfig"("configKey");
