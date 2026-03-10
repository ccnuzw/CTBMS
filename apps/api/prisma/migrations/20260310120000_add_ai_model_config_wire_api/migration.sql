-- Add wireApi to AIModelConfig for OpenAI/Sub2API protocol selection

ALTER TABLE "AIModelConfig" ADD COLUMN IF NOT EXISTS "wireApi" TEXT;
