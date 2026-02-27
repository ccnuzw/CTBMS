-- CreateTable
CREATE TABLE IF NOT EXISTS "DataReconciliationDailyMetric" (
  "id" TEXT NOT NULL,
  "dataset" TEXT NOT NULL,
  "metricDate" TIMESTAMP(3) NOT NULL,
  "windowDays" INTEGER NOT NULL DEFAULT 7,
  "totalJobs" INTEGER NOT NULL,
  "doneJobs" INTEGER NOT NULL,
  "passedJobs" INTEGER NOT NULL,
  "dayPassed" BOOLEAN NOT NULL,
  "consecutivePassedDays" INTEGER NOT NULL,
  "meetsWindowTarget" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL,
  "payload" JSONB,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataReconciliationDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DataReconciliationDailyMetric_dataset_metricDate_windowDays_key"
ON "DataReconciliationDailyMetric"("dataset", "metricDate", "windowDays");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationDailyMetric_dataset_generatedAt_idx"
ON "DataReconciliationDailyMetric"("dataset", "generatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DataReconciliationDailyMetric_metricDate_meetsWindowTarget_idx"
ON "DataReconciliationDailyMetric"("metricDate", "meetsWindowTarget");
