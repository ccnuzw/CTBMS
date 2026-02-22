# 知识库 RAG 优化与改造详细设计方案

## 1. 背景与目标

当前系统的 `knowledge-poc` 模块仅为内存模拟实现，不支持持久化向量存储，也无法通过语义检索有效支撑智能体的决策需求。为了构建能够支撑复杂交易决策的“知识底座”，我们需要将知识库从简单的 CRUD 升级为基于 RAG (Retrieval-Augmented Generation) 的智能检索系统。

### 1.1 核心目标
1.  **持久化向量存储**：引入生产级向量数据库，支持海量文档片段的存储与检索。
2.  **混合检索增强**：结合“关键词检索”（精确匹配）与“向量检索”（语义匹配），解决行业术语（如“2405合约”）与模糊概念（如“通胀预期”）的并存检索难题。
3.  **自动化数据链路**：实现从文档上传、解析、分块到向量化的全自动化流程。
4.  **智能体工具化**：将检索能力封装为标准 Agent Tool，供分析师、风控官等不同角色智能体按需调用。

---

## 2. 总体架构设计

我们采用 **PostgreSQL + `pgvector`** 作为核心存储引擎，保持技术栈统一（无需引入 Milvus/Qdrant 等额外运维负担），同时利用 Postgres 的事务特性保证知识与向量的一致性。

### 2.1 逻辑架构图
```mermaid
graph TD
    subgraph Data Ingestion [数据写入与处理]
        A[上传文档 PDF/Docx] -->|解析| B[文本提取]
        B -->|清洗| C[Text Splitter]
        C -->|分块| D[Chunks]
        D -->|Embedding API| E[Vectors]
        E -->|存储| F[(Postgres: KnowledgeVector)]
    end

    subgraph Data Retrieval [数据检索与生成]
        G[用户/Agent Query] -->|关键词提取| H[Keyword Search (tsvector)]
        G -->|Embedding| I[Vector Search (pgvector)]
        H --> J[RRF Fusion Ranking]
        I --> J
        J -->|Top K| K[Context Windows]
        K -->|Prompt Assembly| L[LLM Generation]
        L --> M[Answer]
    end
```

### 2.2 关键技术选型
| 组件 | 选型 | 理由 |
|---|---|---|
| **向量数据库** | **PostgreSQL + `pgvector`** | 纯 SQL 技术栈，支持 `HNSW` 索引，支持与元数据（Metadata）的高效混合查询。 |
| **Embedding 模型** | **OpenAI `text-embedding-3-small`** | 1536 维度，性价比极高，适合通用商情与金融文档。 |
| **分块策略** | **RecursiveCharacterTextSplitter** | 适合结构化文档，支持按段落、句子层级递归分割，保留上下文连贯性。 |
| **重排序 (Rerank)** | **Reciprocal Rank Fusion (RRF)** | 无需训练模型，纯算法实现关键词与向量结果的加权融合，稳定性好。 |

---

## 3. 数据库模型设计 (Schema Design)

我们需要在 `schema.prisma` 中扩展现有的 `KnowledgeItem` 模型，增加向量存储支持。

### 3.1 核心实体关系
*   `KnowledgeItem` (1) <---> (N) `KnowledgeVector`
*   父表存储文档级元数据（标题、来源、发布时间）。
*   子表存储分块后的文本片段及其向量表示。

### 3.2 Schema 定义
```prisma
// 在 schema.prisma 中新增
model KnowledgeVector {
  id              String        @id @default(uuid())
  
  // 关联父文档
  knowledgeItemId String
  knowledgeItem   KnowledgeItem @relation(fields: [knowledgeItemId], references: [id], onDelete: Cascade)
  
  // 分块信息
  chunkIndex      Int           // 片段序号 (0, 1, 2...)
  content         String        @db.Text // 片段文本内容
  tokenCount      Int           // Token 数量估算
  
  // 向量数据 (使用 Unsupported 类型适配 pgvector 插件)
  // 维度：1536 (OpenAI text-embedding-3-small)
  embedding       Unsupported("vector(1536)")? 

  // 元数据 (用于混合检索过滤，如 page_number, section_title)
  metadata        Json?         
  
  createdAt       DateTime      @default(now())
  
  @@index([knowledgeItemId])
  // 注意：HNSW 索引需要在数据库层面手动创建，Prisma 暂不支持直接定义
}
```

---

## 4. 详细流程设计

### 4.1 数据写入链路 (Ingestion Pipeline)
当用户上传一篇研报或创建一条知识条目时：

1.  **触发点**：`KnowledgeService.create()` 或 `update()`。
2.  **预处理**：
    *   **解析**：使用 `pdf-parse` 或 `mammoth` 提取纯文本。
    *   **清洗**：去除乱码、页眉页脚干扰信息。
3.  **分块 (Chunking)**：
    *   策略：`RecursiveCharacterTextSplitter`。
    *   参数：`chunkSize=800` (约 500 中文字符), `chunkOverlap=100`。
    *   元数据保留：记录每个 Chunk 所属的 `pageNumber`。
4.  **向量化 (Embedding)**：
    *   调用 OpenAI Embedding API，批量获取向量。
5.  **存储**：
    *   在一个 Transaction 中写入 `KnowledgeVector` 记录。
    *   **重要**：写入时直接包含 `vector` 数据（需使用 Prisma `$executeRaw` 或特定的 SQL 写入方式，因为 `Unsupported` 类型无法直接通过 ORM 写入）。

### 4.2 混合检索链路 (Hybrid Retrieval Pipeline)
当 Agent 发起查询 "2023年东北港口玉米库存趋势" 时：

1.  **并行检索**：
    *   **路 A (Keyword)**：对 Query 进行分词，在 Postgres 中使用 `to_tsquery` 对 `content` 字段进行全文检索。
    *   **路 B (Vector)**：调用 Embedding API 获取 Query Vector，在 Postgres 中使用 `<=>` (Cosine Distance) 算子检索最相似的 Top 20。
2.  **融合排序 (RRF)**：
    *   应用 Reciprocal Rank Fusion 算法：
        $$ Score(d) = \sum_{r \in R} \frac{1}{k + rank(d, r)} $$
    *   其中 $k=60$ 是常数平滑因子。
    *   此步骤确保即使向量检索漏掉了精确匹配（如特定合约代码），关键词检索也能将其捞回。
3.  **结果截断**：
    *   取融合分数最高的 Top K (如 Top 5)。
4.  **上下文组装**：
    *   将这 5 个片段的内容拼接为 Context，连同原始问题发送给 LLM。

---

## 5. 接口与服务设计

### 5.1 服务层接口 (`KnowledgeRetrievalService`)
```typescript
interface RetrievalResult {
  id: string;
  content: string;
  score: number;
  metadata: any;
  sourceId: string;
  sourceTitle: string;
}

class KnowledgeRetrievalService {
  /**
   * 混合检索入口
   */
  async search(query: string, options?: {
    topK?: number;
    filter?: { sourceType?: string; timeRange?: [Date, Date] };
  }): Promise<RetrievalResult[]> {
    // 1. Keyword Search
    // 2. Vector Search
    // 3. RRF Fusion
    // 4. Return enriched results
  }
}
```

### 5.2 Agent Tool 定义
```typescript
export const KnowledgeBaseTool = {
  name: "search_knowledge_base",
  description: "搜索内部知识库、研报和历史商情。当需要查询具体数据、历史事件或行业知识时使用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词或自然语言问题",
      },
      time_range_start: { type: "string", format: "date" },
      time_range_end: { type: "string", format: "date" }
    },
    required: ["query"],
  }
};
```

---

## 6. 实施路线图

1.  **基础设施准备**：
    *   在 Postgres 数据库开启 `vector` 扩展。
    *   更新 Prisma Schema 并执行 Migration。
2.  **核心服务开发**：
    *   实现 `KnowledgeIngestService` (写入端)。
    *   实现 `KnowledgeRetrievalService` (读取端)。
3.  **数据迁移**：
    *   编写脚本，将现有 `KnowledgeItem` 全量重新 Embedding 入库。
4.  **Agent 对接**：
    *   替换现有的 Mock Tool，接入真实服务。
5.  **效果调优**：
    *   调整 Chunk Size 和 Overlap 参数。
    *   调整 RRF 的 $k$ 值。

---

## 7. 风险与对策

*   **向量维度不匹配**：严格锁定模型为 `text-embedding-3-small`，禁止混用不同模型。
*   **写入性能**：当上传大文件（如 100 页研报）时，Embedding API 可能超时。**对策**：实现队列机制，异步分批处理 Embedding。
*   **Token 成本**：**对策**：计算 Hash 值，内容未变更的文档跳过重算 Embedding。

---

## 8. 进阶优化策略 (Phase 2)

在基础 RAG 建设完成后，可引入以下策略进一步提升检索准确率：

### 8.1 查询重写与扩展 (Query Rewriting & Expansion)
用户的原始提问往往含糊或缺失上下文。
*   **Query Rewrite**: 使用 LLM 将用户 Query 改写为更适合检索的形式。例如将 "它最近的库存怎么样？" 改写为 "2024年大连港玉米库存趋势"。
*   **Multi-Query**: 对复杂问题生成 3-5 个子查询，并行检索后去重。

### 8.2 重排序 (Re-ranking)
RRF 融合后的 Top K 结果虽然覆盖率高，但排序精度有限。
*   **Cross-Encoder**: 引入专门的 Re-rank 模型（如 BGE-Reranker 或 Cohere Rerank API）。
*   **流程**：
    1.  检索阶段：Top 50 (Keyword + Vector)
    2.  粗排：RRF 融合得到 Top 20
    3.  精排：使用 Re-rank 模型对 Top 20 进行语义打分
    4.  最终输出：Top 5

### 8.3 元数据过滤 (Metadata Filtering)
防止检索到过期或不相关的文档。
*   **Time Filter**: 仅检索 `publishDate` 在最近 1 年内的文档。
*   **Category Filter**: 针对 "研报" 问题，仅检索 `contentType = 'RESEARCH_REPORT'`。
*   **Implementation**: 在 Vector Search 的 SQL `WHERE` 子句中直接加入 JSONB 查询。

### 8.4 反馈闭环 (Feedback Loop)
*   **Explicit Feedback**: 用户对 Agent 回答点赞/点踩。
*   **Implicit Feedback**: 记录用户引用了哪篇文档。
*   **Optimization**: 将高频引用的 Chunk 加入 "精选集" 或提升其权重。
