-- 数据迁移说明
-- 问题: 重构 ReportType 枚举导致枚举值变更
-- 原枚举值: WEEKLY, MONTHLY, QUARTERLY, ANNUAL, POLICY, RESEARCH, OTHER
-- 新枚举值: POLICY, MARKET, RESEARCH, INDUSTRY
-- 
-- 解决方案: 在修改枚举前,先将现有数据映射到新枚举值

-- Step 1: 创建新的枚举类型
CREATE TYPE "ReportType_new" AS ENUM ('POLICY', 'MARKET', 'RESEARCH', 'INDUSTRY');

-- Step 2: 创建新的周期枚举
CREATE TYPE "ReportPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ADHOC');

-- Step 3: 添加临时列用于数据迁移
ALTER TABLE "ResearchReport" ADD COLUMN "reportType_new" "ReportType_new";
ALTER TABLE "ResearchReport" ADD COLUMN "reportPeriod" "ReportPeriod";

-- Step 4: 数据迁移 - 将旧的 reportType 映射到新的类型系统
-- 周期类型 → reportPeriod
UPDATE "ResearchReport" SET "reportPeriod" = 'WEEKLY' WHERE "reportType" = 'WEEKLY';
UPDATE "ResearchReport" SET "reportPeriod" = 'MONTHLY' WHERE "reportType" = 'MONTHLY';
UPDATE "ResearchReport" SET "reportPeriod" = 'QUARTERLY' WHERE "reportType" = 'QUARTERLY';
UPDATE "ResearchReport" SET "reportPeriod" = 'ANNUAL' WHERE "reportType" = 'ANNUAL';

-- 内容类型 → reportType_new
UPDATE "ResearchReport" SET "reportType_new" = 'POLICY' WHERE "reportType" = 'POLICY';
UPDATE "ResearchReport" SET "reportType_new" = 'RESEARCH' WHERE "reportType" = 'RESEARCH';
UPDATE "ResearchReport" SET "reportType_new" = 'MARKET' WHERE "reportType" = 'OTHER'; -- OTHER 映射为 MARKET

-- 对于周期类型,默认设置为 RESEARCH (深度研究)
UPDATE "ResearchReport" SET "reportType_new" = 'RESEARCH' 
WHERE "reportType" IN ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL') AND "reportType_new" IS NULL;

-- Step 5: 删除旧列
ALTER TABLE "ResearchReport" DROP COLUMN "reportType";

-- Step 6: 重命名新列
ALTER TABLE "ResearchReport" RENAME COLUMN "reportType_new" TO "reportType";

-- Step 7: 设置非空约束
ALTER TABLE "ResearchReport" ALTER COLUMN "reportType" SET NOT NULL;

-- Step 8: 删除旧枚举类型
DROP TYPE "ReportType";

-- Step 9: 重命名新枚举类型
ALTER TYPE "ReportType_new" RENAME TO "ReportType";

-- Step 10: 添加索引
CREATE INDEX "ResearchReport_reportPeriod_idx" ON "ResearchReport"("reportPeriod");

-- Step 11: 更新 ReviewStatus 枚举,添加 ARCHIVED
ALTER TYPE "ReviewStatus" ADD VALUE 'ARCHIVED';
