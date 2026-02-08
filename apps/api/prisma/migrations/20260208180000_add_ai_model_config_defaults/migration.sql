-- AlterTable
ALTER TABLE "AIModelConfig"
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availableModels" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
