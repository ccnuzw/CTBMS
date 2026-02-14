-- ParameterItem: ownership/source/version extensions
ALTER TABLE "ParameterItem"
  ADD COLUMN IF NOT EXISTS "inheritedFrom" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerType" TEXT NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "itemSource" "WorkflowTemplateSource" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Replace legacy unique key with scope-aware unique key
DROP INDEX IF EXISTS "ParameterItem_parameterSetId_paramCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ParameterItem_parameterSetId_paramCode_scopeLevel_scopeValue_key"
  ON "ParameterItem"("parameterSetId", "paramCode", "scopeLevel", "scopeValue");

CREATE INDEX IF NOT EXISTS "ParameterItem_ownerUserId_isActive_idx"
  ON "ParameterItem"("ownerUserId", "isActive");

-- DecisionRulePack: layered rule governance fields
ALTER TABLE "DecisionRulePack"
  ADD COLUMN IF NOT EXISTS "applicableScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "ruleLayer" TEXT NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN IF NOT EXISTS "ownerType" TEXT NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "publishedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastPublishComment" TEXT;

CREATE INDEX IF NOT EXISTS "DecisionRulePack_ruleLayer_isActive_priority_idx"
  ON "DecisionRulePack"("ruleLayer", "isActive", "priority");

CREATE INDEX IF NOT EXISTS "DecisionRulePack_publishedAt_idx"
  ON "DecisionRulePack"("publishedAt");
