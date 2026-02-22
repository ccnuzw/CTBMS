-- ==========================================
-- 1. 创建 pgvector HNSW 索引
-- 目的：加速知识库向量检索，防止全表扫描
-- 注意：需要预先安装 pgvector 插件 (CREATE EXTENSION IF NOT EXISTS vector)
-- ==========================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS "KnowledgeVector_embedding_hnsw_idx" 
ON "KnowledgeVector" USING hnsw (embedding vector_cosine_ops);

-- ==========================================
-- 2. 中文全文检索配置说明 (zhparser)
-- 目的：替换默认的 simple 分词器，提升 hybrid search 中的关键词召回率
-- ==========================================
-- 必须先在系统级安装 scws 和 zhparser，然后：
-- CREATE EXTENSION IF NOT EXISTS scws;
-- CREATE EXTENSION IF NOT EXISTS zhparser;

-- 创建中文检索配置 'zhcfg'
-- CREATE TEXT SEARCH CONFIGURATION zhcfg (PARSER = zhparser);
-- ALTER TEXT SEARCH CONFIGURATION zhcfg ADD MAPPING FOR n,v,a,i,e,l WITH simple;

-- 如果配置成功，请将 apps/api/src/modules/knowledge/services/knowledge-retrieval.service.ts 
-- 中的 'simple' 替换为 'zhcfg'
