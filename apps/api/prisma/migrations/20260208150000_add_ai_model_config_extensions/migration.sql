-- AlterTable
ALTER TABLE "AIModelConfig"
ADD COLUMN     "allowUrlProbe" BOOLEAN DEFAULT true,
ADD COLUMN     "authType" TEXT,
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "modelFetchMode" TEXT,
ADD COLUMN     "pathOverrides" JSONB,
ADD COLUMN     "queryParams" JSONB;
