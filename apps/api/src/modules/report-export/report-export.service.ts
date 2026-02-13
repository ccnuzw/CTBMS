import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  ExportDebateReportDto,
  ExportTaskQueryDto,
  ExportReportDataDto,
  ReportConclusionDto,
  ReportEvidenceItemDto,
  ReportDebateRoundDto,
  ReportRiskItemDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建导出任务并组装报告数据
   */
  async createExportTask(userId: string, dto: ExportDebateReportDto) {
    // 验证执行实例存在
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: dto.workflowExecutionId },
    });
    if (!execution) {
      throw new NotFoundException(`工作流执行实例不存在: ${dto.workflowExecutionId}`);
    }

    // 创建 PENDING 任务
    const task = await this.prisma.exportTask.create({
      data: {
        workflowExecutionId: dto.workflowExecutionId,
        format: dto.format,
        status: 'PENDING',
        sections: dto.sections as Prisma.InputJsonValue,
        title: dto.title,
        includeRawData: dto.includeRawData,
        createdByUserId: userId,
      },
    });

    // 异步组装报告数据（同步执行简化版）
    try {
      await this.prisma.exportTask.update({
        where: { id: task.id },
        data: { status: 'PROCESSING' },
      });

      const reportData = await this.assembleReportData(dto, execution);

      const completed = await this.prisma.exportTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          reportData: reportData as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      this.logger.log(`报告导出任务完成: ${task.id}, 格式: ${dto.format}`);
      return completed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.exportTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });
      this.logger.error(`报告导出任务失败: ${task.id}`, errorMessage);
      throw new BadRequestException(`报告组装失败: ${errorMessage}`);
    }
  }

  /**
   * 查询导出任务列表
   */
  async findMany(userId: string, query: ExportTaskQueryDto) {
    const where: Prisma.ExportTaskWhereInput = {
      createdByUserId: userId,
    };

    if (query.workflowExecutionId) where.workflowExecutionId = query.workflowExecutionId;
    if (query.format) where.format = query.format;
    if (query.status) where.status = query.status;

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.exportTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.exportTask.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * 查询单条导出任务
   */
  async findOne(userId: string, id: string) {
    const task = await this.prisma.exportTask.findFirst({
      where: { id, createdByUserId: userId },
    });
    if (!task) throw new NotFoundException('导出任务不存在');
    return task;
  }

  /**
   * 删除导出任务
   */
  async remove(userId: string, id: string) {
    const task = await this.prisma.exportTask.findFirst({
      where: { id, createdByUserId: userId },
    });
    if (!task) throw new NotFoundException('导出任务不存在');

    await this.prisma.exportTask.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * 组装完整报告数据
   */
  private async assembleReportData(
    dto: ExportDebateReportDto,
    execution: { id: string; workflowDefinitionId: string; versionId: string | null },
  ): Promise<ExportReportDataDto> {
    // 获取工作流定义名称
    const definition = await this.prisma.workflowDefinition.findUnique({
      where: { id: execution.workflowDefinitionId },
      select: { name: true },
    });

    // 获取版本号
    let versionCode: string | null = null;
    if (execution.versionId) {
      const version = await this.prisma.workflowVersion.findUnique({
        where: { id: execution.versionId },
        select: { versionCode: true },
      });
      versionCode = version?.versionCode ?? null;
    }

    const reportData: ExportReportDataDto = {
      title: dto.title ?? `${definition?.name ?? '工作流'} 辩论报告`,
      generatedAt: new Date().toISOString(),
      workflowExecutionId: dto.workflowExecutionId,
      workflowName: definition?.name ?? null,
      versionCode,
    };

    // 按需组装各段落
    const sections = dto.sections;

    if (sections.includes('CONCLUSION')) {
      reportData.conclusion = await this.assembleConclusion(dto.workflowExecutionId);
    }

    if (sections.includes('EVIDENCE')) {
      reportData.evidenceItems = await this.assembleEvidence(dto.workflowExecutionId);
    }

    if (sections.includes('DEBATE_PROCESS')) {
      reportData.debateRounds = await this.assembleDebateRounds(dto.workflowExecutionId);
    }

    if (sections.includes('RISK_ASSESSMENT')) {
      reportData.riskItems = await this.assembleRiskItems(dto.workflowExecutionId);
    }

    if (dto.includeRawData) {
      reportData.paramSnapshot = await this.assembleParamSnapshot(dto.workflowExecutionId);
    }

    return reportData;
  }

  /**
   * 组装结论数据 — 从决策记录和裁决轨迹中提取
   */
  private async assembleConclusion(executionId: string): Promise<ReportConclusionDto | null> {
    // 从 DecisionRecord 获取结论
    const decisionRecord = await this.prisma.decisionRecord.findFirst({
      where: { workflowExecutionId: executionId },
      orderBy: { createdAt: 'desc' },
    });

    if (decisionRecord) {
      return {
        action: decisionRecord.action,
        confidence: decisionRecord.confidence,
        riskLevel: decisionRecord.riskLevel,
        targetWindow: decisionRecord.targetWindow,
        reasoningSummary: decisionRecord.reasoningSummary,
        judgementVerdict: null,
        judgementReasoning: null,
      };
    }

    // 回退：从辩论裁决轨迹获取
    const judgement = await this.prisma.debateRoundTrace.findFirst({
      where: { workflowExecutionId: executionId, isJudgement: true },
      orderBy: { roundNumber: 'desc' },
    });

    if (judgement) {
      return {
        action: judgement.judgementVerdict ?? 'UNKNOWN',
        confidence: judgement.confidence,
        riskLevel: null,
        targetWindow: null,
        reasoningSummary: null,
        judgementVerdict: judgement.judgementVerdict,
        judgementReasoning: judgement.judgementReasoning,
      };
    }

    return null;
  }

  /**
   * 组装证据数据 — 从节点执行的输出中提取
   */
  private async assembleEvidence(executionId: string): Promise<ReportEvidenceItemDto[]> {
    const nodeExecutions = await this.prisma.nodeExecution.findMany({
      where: {
        workflowExecutionId: executionId,
        nodeType: { in: ['DATA_FETCH', 'CONTEXT_BUILDER', 'EVIDENCE_COLLECTOR'] },
        status: 'COMPLETED',
      },
      select: { nodeName: true, nodeType: true, outputData: true },
      orderBy: { startedAt: 'asc' },
    });

    const items: ReportEvidenceItemDto[] = [];

    for (const node of nodeExecutions) {
      const output = node.outputData as Record<string, unknown> | null;
      if (!output) continue;

      // 尝试从输出中提取证据条目
      if (Array.isArray(output.evidenceItems)) {
        for (const item of output.evidenceItems) {
          const evidence = item as Record<string, unknown>;
          items.push({
            source: (evidence.source as string) ?? node.nodeName,
            category: (evidence.category as string) ?? node.nodeType,
            content: (evidence.content as string) ?? JSON.stringify(evidence),
            weight: (evidence.weight as number) ?? null,
          });
        }
      } else {
        // 整个输出作为一条证据
        items.push({
          source: node.nodeName,
          category: node.nodeType,
          content: JSON.stringify(output).slice(0, 2000),
          weight: null,
        });
      }
    }

    return items;
  }

  /**
   * 组装辩论过程数据
   */
  private async assembleDebateRounds(executionId: string): Promise<ReportDebateRoundDto[]> {
    const traces = await this.prisma.debateRoundTrace.findMany({
      where: { workflowExecutionId: executionId },
      orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
    });

    return traces.map((trace) => ({
      roundNumber: trace.roundNumber,
      participantCode: trace.participantCode,
      participantRole: trace.participantRole,
      stance: trace.stance,
      confidence: trace.confidence,
      statementSummary: trace.statementText.length > 500
        ? trace.statementText.slice(0, 500) + '...'
        : trace.statementText,
      challengeText: trace.challengeText,
      challengeTarget: trace.challengeTargetCode,
      isJudgement: trace.isJudgement,
    }));
  }

  /**
   * 组装风险评估数据 — 从 risk-gate 节点输出提取
   */
  private async assembleRiskItems(executionId: string): Promise<ReportRiskItemDto[]> {
    const riskNodes = await this.prisma.nodeExecution.findMany({
      where: {
        workflowExecutionId: executionId,
        nodeType: 'RISK_GATE',
        status: 'COMPLETED',
      },
      select: { outputData: true },
      orderBy: { startedAt: 'asc' },
    });

    const items: ReportRiskItemDto[] = [];

    for (const node of riskNodes) {
      const output = node.outputData as Record<string, unknown> | null;
      if (!output) continue;

      if (Array.isArray(output.riskItems)) {
        for (const item of output.riskItems) {
          const risk = item as Record<string, unknown>;
          items.push({
            riskType: (risk.riskType as string) ?? 'UNKNOWN',
            level: (risk.level as string) ?? 'MEDIUM',
            description: (risk.description as string) ?? '',
            mitigationAction: (risk.mitigationAction as string) ?? null,
          });
        }
      } else if (output.riskLevel) {
        items.push({
          riskType: 'OVERALL',
          level: output.riskLevel as string,
          description: (output.riskSummary as string) ?? '综合风险评估',
          mitigationAction: (output.mitigationAction as string) ?? null,
        });
      }
    }

    return items;
  }

  /**
   * 组装参数快照
   */
  private async assembleParamSnapshot(executionId: string): Promise<Record<string, unknown> | null> {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      select: { inputParams: true },
    });

    return (execution?.inputParams as Record<string, unknown>) ?? null;
  }
}
