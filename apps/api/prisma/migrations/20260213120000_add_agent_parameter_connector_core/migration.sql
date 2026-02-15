-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "objective" TEXT,
    "modelConfigKey" TEXT NOT NULL,
    "agentPromptCode" TEXT NOT NULL,
    "memoryPolicy" TEXT NOT NULL DEFAULT 'none',
    "toolPolicy" JSONB,
    "guardrails" JSONB,
    "outputSchemaCode" TEXT NOT NULL,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "retryPolicy" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ownerUserId" TEXT,
    "templateSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterSet" (
    "id" TEXT NOT NULL,
    "setCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "templateSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParameterSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterItem" (
    "id" TEXT NOT NULL,
    "parameterSetId" TEXT NOT NULL,
    "paramCode" TEXT NOT NULL,
    "paramName" TEXT NOT NULL,
    "paramType" TEXT NOT NULL,
    "unit" TEXT,
    "value" JSONB,
    "defaultValue" JSONB,
    "minValue" JSONB,
    "maxValue" JSONB,
    "scopeLevel" TEXT NOT NULL,
    "scopeValue" TEXT,
    "source" TEXT,
    "changeReason" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParameterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataConnector" (
    "id" TEXT NOT NULL,
    "connectorCode" TEXT NOT NULL,
    "connectorName" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "endpointConfig" JSONB,
    "queryTemplates" JSONB,
    "responseMapping" JSONB,
    "freshnessPolicy" JSONB,
    "rateLimitConfig" JSONB,
    "healthCheckConfig" JSONB,
    "fallbackConnectorCode" TEXT,
    "ownerType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataConnector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_agentCode_key" ON "AgentProfile"("agentCode");

-- CreateIndex
CREATE INDEX "AgentProfile_ownerUserId_isActive_idx" ON "AgentProfile"("ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "AgentProfile_templateSource_isActive_idx" ON "AgentProfile"("templateSource", "isActive");

-- CreateIndex
CREATE INDEX "AgentProfile_roleType_idx" ON "AgentProfile"("roleType");

-- CreateIndex
CREATE UNIQUE INDEX "ParameterSet_setCode_key" ON "ParameterSet"("setCode");

-- CreateIndex
CREATE INDEX "ParameterSet_ownerUserId_isActive_idx" ON "ParameterSet"("ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "ParameterSet_templateSource_isActive_idx" ON "ParameterSet"("templateSource", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ParameterItem_parameterSetId_paramCode_key" ON "ParameterItem"("parameterSetId", "paramCode");

-- CreateIndex
CREATE INDEX "ParameterItem_parameterSetId_scopeLevel_isActive_idx" ON "ParameterItem"("parameterSetId", "scopeLevel", "isActive");

-- CreateIndex
CREATE INDEX "ParameterItem_paramCode_scopeLevel_scopeValue_idx" ON "ParameterItem"("paramCode", "scopeLevel", "scopeValue");

-- CreateIndex
CREATE UNIQUE INDEX "DataConnector_connectorCode_key" ON "DataConnector"("connectorCode");

-- CreateIndex
CREATE INDEX "DataConnector_category_isActive_idx" ON "DataConnector"("category", "isActive");

-- CreateIndex
CREATE INDEX "DataConnector_connectorType_isActive_idx" ON "DataConnector"("connectorType", "isActive");

-- AddForeignKey
ALTER TABLE "ParameterItem"
ADD CONSTRAINT "ParameterItem_parameterSetId_fkey"
FOREIGN KEY ("parameterSetId") REFERENCES "ParameterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
