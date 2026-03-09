-- AgentSkill 契约增强：添加输出 Schema 和副作用级别

-- 添加 outputSchema 字段（JSON Schema for tool output contract）
ALTER TABLE "AgentSkill" ADD COLUMN IF NOT EXISTS "outputSchema" JSONB;

-- 添加 sideEffectLevel 字段（NONE | READ | WRITE | DESTRUCTIVE）
ALTER TABLE "AgentSkill" ADD COLUMN IF NOT EXISTS "sideEffectLevel" VARCHAR(20) NOT NULL DEFAULT 'NONE';
