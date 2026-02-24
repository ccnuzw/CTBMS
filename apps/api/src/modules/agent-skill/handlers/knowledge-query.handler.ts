import { Injectable, Logger } from '@nestjs/common';
import { IToolHandler } from '../interfaces/tool-handler.interface';
import { KnowledgeRetrievalService } from '../../knowledge/services/knowledge-retrieval.service';

/**
 * 知识库查询助手 (核心 AgentSkill)
 * 将本地 RAG 或直接匹配系统包装成可被大模型随时路由的外部工具。
 */
@Injectable()
export class KnowledgeQueryToolHandler implements IToolHandler {
  private readonly logger = new Logger(KnowledgeQueryToolHandler.name);

  constructor(private readonly retrievalService: KnowledgeRetrievalService) {}

  getHandlerCode(): string {
    return 'knowledge_search';
  }

  getDescription(): string {
    return '业务知识库查询接口：通过自然语言或语义搜索内部文件与情报';
  }

  /**
   * 工具的业务执行主干
   */
  async execute(args: Record<string, unknown>, _context?: unknown): Promise<string> {
    const query = args.query;
    const limit = typeof args.limit === 'number' ? args.limit : 5;
    const similarityThreshold =
      typeof args.similarityThreshold === 'number' ? args.similarityThreshold : undefined;
    const useHybrid = typeof args.useHybrid === 'boolean' ? args.useHybrid : undefined;

    if (!query || typeof query !== 'string') {
      return JSON.stringify({ error: '无效请求：必须提供 `query` (字符串类型) 作为搜索短语。' });
    }

    try {
      this.logger.log(
        `>> Agent 唤起 Knowledge Search: [${query}], limit=${limit}, threshold=${similarityThreshold ?? 'default'}, hybrid=${useHybrid ?? 'default'}`,
      );

      // 直接对接系统中真实的混合检索底层服务！
      const results = await this.retrievalService.search(query, {
        topK: limit,
        ...(similarityThreshold !== undefined ? { similarityThreshold } : {}),
        ...(useHybrid !== undefined ? { useHybrid } : {}),
      });

      if (!results || results.length === 0) {
        return JSON.stringify({ message: '检索到了 0 条相关的内部知识。' });
      }

      // 为了确保大模型能够“读懂”搜索结果，裁剪出有用字段拼接给上下文
      const summaries = results.map((node) => {
        return {
          id: node.id,
          snippet: node.content?.substring(0, 500) || '', // 取前 500 字防止 Context 超长溢出
          relevanceScore: node.score,
          metadata: node.metadata,
          sourceId: node.sourceId,
        };
      });

      return JSON.stringify({
        status: 'success',
        matchCount: summaries.length,
        results: summaries,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`KnowledgeQuery execution failed`, error);
      return JSON.stringify({ error: `知识库系统发生内部错误: ${message}` });
    }
  }
}
