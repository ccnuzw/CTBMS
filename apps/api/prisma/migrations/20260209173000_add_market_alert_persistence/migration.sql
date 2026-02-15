-- Market alert persistence enums
CREATE TYPE "MarketAlertRuleType" AS ENUM ('DAY_CHANGE_ABS', 'DAY_CHANGE_PCT', 'DEVIATION_FROM_MEAN_PCT', 'CONTINUOUS_DAYS');
CREATE TYPE "MarketAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "MarketAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'CLOSED');
CREATE TYPE "MarketAlertAction" AS ENUM ('CREATE', 'UPDATE_HIT', 'ACK', 'CLOSE', 'REOPEN', 'AUTO_CLOSE');

-- Alert rule definition
CREATE TABLE "MarketAlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketAlertRuleType" NOT NULL,
    "threshold" DECIMAL(10,2),
    "days" INTEGER,
    "direction" TEXT,
    "severity" "MarketAlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketAlertRule_pkey" PRIMARY KEY ("id")
);

-- Alert instance
CREATE TABLE "MarketAlertInstance" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" "MarketAlertStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "MarketAlertSeverity" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "pointName" TEXT NOT NULL,
    "pointType" TEXT NOT NULL,
    "regionLabel" TEXT,
    "commodity" TEXT NOT NULL,
    "triggerDate" TIMESTAMP(3) NOT NULL,
    "firstTriggeredAt" TIMESTAMP(3) NOT NULL,
    "lastTriggeredAt" TIMESTAMP(3) NOT NULL,
    "triggerValue" DECIMAL(10,2) NOT NULL,
    "thresholdValue" DECIMAL(10,2) NOT NULL,
    "message" TEXT NOT NULL,
    "note" TEXT,
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketAlertInstance_pkey" PRIMARY KEY ("id")
);

-- Alert status log
CREATE TABLE "MarketAlertStatusLog" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "action" "MarketAlertAction" NOT NULL,
    "fromStatus" "MarketAlertStatus",
    "toStatus" "MarketAlertStatus" NOT NULL,
    "operator" TEXT NOT NULL,
    "note" TEXT,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketAlertStatusLog_pkey" PRIMARY KEY ("id")
);

-- Unique and normal indexes
CREATE UNIQUE INDEX "MarketAlertRule_legacyRuleId_key" ON "MarketAlertRule"("legacyRuleId");
CREATE INDEX "MarketAlertRule_isActive_priority_idx" ON "MarketAlertRule"("isActive", "priority");
CREATE INDEX "MarketAlertRule_type_idx" ON "MarketAlertRule"("type");

CREATE INDEX "MarketAlertInstance_ruleId_createdAt_idx" ON "MarketAlertInstance"("ruleId", "createdAt");
CREATE INDEX "MarketAlertInstance_status_severity_triggerDate_idx" ON "MarketAlertInstance"("status", "severity", "triggerDate");
CREATE INDEX "MarketAlertInstance_commodity_triggerDate_idx" ON "MarketAlertInstance"("commodity", "triggerDate");
CREATE INDEX "MarketAlertInstance_dedupeKey_idx" ON "MarketAlertInstance"("dedupeKey");

-- Enforce at most one active alert instance per dedupe key
CREATE UNIQUE INDEX "market_alert_instance_active_dedupe_uniq"
ON "MarketAlertInstance" ("dedupeKey")
WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');

CREATE INDEX "MarketAlertStatusLog_instanceId_createdAt_idx" ON "MarketAlertStatusLog"("instanceId", "createdAt");
CREATE INDEX "MarketAlertStatusLog_action_createdAt_idx" ON "MarketAlertStatusLog"("action", "createdAt");

-- Foreign keys
ALTER TABLE "MarketAlertInstance" ADD CONSTRAINT "MarketAlertInstance_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "MarketAlertRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketAlertStatusLog" ADD CONSTRAINT "MarketAlertStatusLog_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "MarketAlertInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
