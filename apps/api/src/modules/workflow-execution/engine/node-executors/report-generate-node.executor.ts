import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeService } from '../../../knowledge/knowledge.service';
import { WorkflowNode } from '@packages/types';
import {
  NodeExecutionContext,
  NodeExecutionResult,
  WorkflowNodeExecutor,
} from '../node-executor.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportGenerateNodeExecutor implements WorkflowNodeExecutor {
  readonly name = 'ReportGenerateNodeExecutor';
  private readonly logger = new Logger(ReportGenerateNodeExecutor.name);

  constructor(private readonly knowledgeService: KnowledgeService) {}

  supports(node: WorkflowNode): boolean {
    return node.type === 'report-generate';
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    try {
      const nodeConfig = context.node.config as Record<string, unknown>;
      // 1. 获取通过运行流转下来的合并数据（如大模型生成的正文、结论）
      // 如果前面是 Agent 分析，文本通常放在 input 里
      const inputStr =
        typeof context.input === 'string' ? context.input : JSON.stringify(context.input, null, 2);

      const title =
        typeof nodeConfig.title === 'string'
          ? nodeConfig.title
          : `智能生成分析报告 - ${new Date().toLocaleDateString()}`;
      const region =
        typeof nodeConfig.implicitRegion === 'string' ? [nodeConfig.implicitRegion] : [];
      const commodities = Array.isArray(nodeConfig.implicitCommodities)
        ? nodeConfig.implicitCommodities.filter((item): item is string => typeof item === 'string')
        : [];
      const reportType =
        typeof nodeConfig.reportType === 'string' ? nodeConfig.reportType : 'MARKET';

      // 提取前置节点可能带过来的摘要或洞察点
      const summary =
        typeof context.input.summary === 'string'
          ? context.input.summary
          : typeof context.input.verdict === 'string'
            ? context.input.verdict
            : '';

      // 2. 调用真实底层库服务创建实体报告
      const report = await this.knowledgeService.createResearchReport({
        title,
        contentPlain: inputStr,
        reportType,
        sourceType: 'WORKFLOW_GENERATED',
        authorId: context.triggerUserId || 'system',
        region,
        commodities,
        summary: summary ? String(summary) : undefined,
        keyPoints: JSON.parse(JSON.stringify(context.input)) as Prisma.InputJsonValue,
        triggerAnalysis: true, // 允许它使用 AI 自己提炼大纲和标签
      });

      this.logger.log(`Flow execution ${context.executionId} generated report: ${report.id}`);

      // 3. 返回产出执行追踪数据
      return {
        status: 'SUCCESS',
        output: {
          ...context.input,
          reportGenerated: true,
          reportId: report.id,
          reportTitle: report.title,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to generate report for node ${context.node.id}:`, error);
      return {
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Report Generation Failed',
        output: {
          ...context.input,
          reportGenerated: false,
          error: String(error),
        },
      };
    }
  }
}
