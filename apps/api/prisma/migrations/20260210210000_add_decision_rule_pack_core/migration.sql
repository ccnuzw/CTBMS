-- CreateTable
CREATE TABLE "DecisionRulePack" (
    "id" TEXT NOT NULL,
    "rulePackCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "templateSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRulePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRule" (
    "id" TEXT NOT NULL,
    "rulePackId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fieldPath" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "expectedValue" JSONB,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRulePack_rulePackCode_key" ON "DecisionRulePack"("rulePackCode");

-- CreateIndex
CREATE INDEX "DecisionRulePack_isActive_priority_idx" ON "DecisionRulePack"("isActive", "priority");

-- CreateIndex
CREATE INDEX "DecisionRulePack_ownerUserId_isActive_idx" ON "DecisionRulePack"("ownerUserId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRule_rulePackId_ruleCode_key" ON "DecisionRule"("rulePackId", "ruleCode");

-- CreateIndex
CREATE INDEX "DecisionRule_rulePackId_isActive_priority_idx" ON "DecisionRule"("rulePackId", "isActive", "priority");

-- AddForeignKey
ALTER TABLE "DecisionRule"
ADD CONSTRAINT "DecisionRule_rulePackId_fkey"
FOREIGN KEY ("rulePackId") REFERENCES "DecisionRulePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
