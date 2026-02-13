import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants, createWriteStream } from 'node:fs';
import path from 'node:path';
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
import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx';

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(private readonly prisma: PrismaService) { }

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
      const artifact = await this.persistArtifact(task.id, dto.format, reportData);

      const completed = await this.prisma.exportTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          reportData: reportData as unknown as Prisma.InputJsonValue,
          downloadUrl: artifact.downloadUrl,
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

  async resolveDownload(userId: string, id: string) {
    const task = await this.prisma.exportTask.findFirst({
      where: { id, createdByUserId: userId },
    });
    if (!task) {
      throw new NotFoundException('导出任务不存在');
    }
    if (task.status !== 'COMPLETED') {
      throw new BadRequestException('导出任务尚未完成');
    }

    const { filePath, fileName, contentType } = this.getArtifactMeta(task.id, task.format);
    const fileExists = await this.fileExists(filePath);
    if (!fileExists) {
      throw new NotFoundException('导出文件不存在，请重新生成');
    }

    return {
      filePath,
      fileName,
      contentType,
    };
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
    const { filePath } = this.getArtifactMeta(task.id, task.format);
    await rm(filePath, { force: true });
    return { deleted: true };
  }

  /**
   * 组装完整报告数据
   */
  private async assembleReportData(
    dto: ExportDebateReportDto,
    execution: { id: string; workflowVersionId: string },
  ): Promise<ExportReportDataDto> {
    // 获取版本和定义信息
    const version = await this.prisma.workflowVersion.findUnique({
      where: { id: execution.workflowVersionId },
      include: { workflowDefinition: true },
    });

    const definition = version?.workflowDefinition;
    const versionCode = version?.versionCode ?? null;

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
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      select: { outputSnapshot: true },
    });
    const executionOutput = execution?.outputSnapshot as Record<string, unknown> | null;
    const embeddedEvidence = executionOutput?.evidenceBundle as
      | { evidence?: Array<Record<string, unknown>> }
      | undefined;
    if (Array.isArray(embeddedEvidence?.evidence) && embeddedEvidence.evidence.length > 0) {
      return embeddedEvidence.evidence.map((item) => ({
        source: (item.sourceNodeId as string) ?? 'workflow-execution',
        category: (item.type as string) ?? 'EVIDENCE',
        content: (item.summary as string) ?? JSON.stringify(item).slice(0, 2000),
        weight: typeof item.confidence === 'number' ? item.confidence : null,
      }));
    }

    const nodeExecutions = await this.prisma.nodeExecution.findMany({
      where: {
        workflowExecutionId: executionId,
        nodeType: {
          in: [
            'data-fetch',
            'context-builder',
            'knowledge-fetch',
            'report-fetch',
            'external-api-fetch',
            'DATA_FETCH',
            'CONTEXT_BUILDER',
            'EVIDENCE_COLLECTOR',
          ],
        },
        status: 'SUCCESS',
      },
      select: { nodeId: true, nodeType: true, outputSnapshot: true },
      orderBy: { startedAt: 'asc' },
    });

    const items: ReportEvidenceItemDto[] = [];

    for (const node of nodeExecutions) {
      const output = node.outputSnapshot as Record<string, unknown> | null;
      if (!output) continue;

      // 尝试从输出中提取证据条目
      if (Array.isArray(output.evidenceItems)) {
        for (const item of output.evidenceItems) {
          const evidence = item as Record<string, unknown>;
          items.push({
            source: (evidence.source as string) ?? node.nodeId,
            category: (evidence.category as string) ?? node.nodeType,
            content: (evidence.content as string) ?? JSON.stringify(evidence),
            weight: (evidence.weight as number) ?? null,
          });
        }
      } else {
        // 整个输出作为一条证据
        items.push({
          source: node.nodeId,
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
        nodeType: { in: ['risk-gate', 'RISK_GATE'] },
        status: 'SUCCESS',
      },
      select: { outputSnapshot: true },
      orderBy: { startedAt: 'asc' },
    });

    const items: ReportRiskItemDto[] = [];

    for (const node of riskNodes) {
      const output = node.outputSnapshot as Record<string, unknown> | null;
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
      select: { paramSnapshot: true },
    });

    return (execution?.paramSnapshot as Record<string, unknown>) ?? null;
  }

  private async persistArtifact(taskId: string, format: string, reportData: ExportReportDataDto) {
    const { filePath, fileName, downloadUrl } = this.getArtifactMeta(taskId, format);
    await mkdir(path.dirname(filePath), { recursive: true });

    if (format === 'JSON') {
      await writeFile(filePath, JSON.stringify(reportData, null, 2), 'utf-8');
    } else if (format === 'PDF') {
      await this.renderPdfReport(filePath, reportData);
    } else if (format === 'WORD') {
      await this.renderWordReport(filePath, reportData);
    } else {
      await writeFile(filePath, this.renderPlainTextReport(reportData), 'utf-8');
    }

    return {
      filePath,
      fileName,
      downloadUrl,
    };
  }

  private renderPlainTextReport(reportData: ExportReportDataDto): string {
    const lines: string[] = [];
    lines.push(`# ${reportData.title}`);
    lines.push(`生成时间: ${reportData.generatedAt}`);
    lines.push(`执行实例: ${reportData.workflowExecutionId}`);
    lines.push(`流程名称: ${reportData.workflowName ?? '-'}`);
    lines.push(`版本号: ${reportData.versionCode ?? '-'}`);
    lines.push('');

    if (reportData.conclusion) {
      lines.push('## 结论');
      lines.push(`动作: ${reportData.conclusion.action}`);
      lines.push(`置信度: ${reportData.conclusion.confidence ?? '-'}`);
      lines.push(`风险等级: ${reportData.conclusion.riskLevel ?? '-'}`);
      lines.push(`目标窗口: ${reportData.conclusion.targetWindow ?? '-'}`);
      lines.push(`推理摘要: ${reportData.conclusion.reasoningSummary ?? '-'}`);
      lines.push('');
    }

    if (reportData.evidenceItems?.length) {
      lines.push('## 证据');
      reportData.evidenceItems.forEach((item, index) => {
        lines.push(
          `${index + 1}. [${item.category ?? 'UNKNOWN'}] ${item.source}: ${item.content}`,
        );
      });
      lines.push('');
    }

    if (reportData.debateRounds?.length) {
      lines.push('## 辩论过程');
      reportData.debateRounds.forEach((round) => {
        lines.push(
          `Round ${round.roundNumber} ${round.participantRole}/${round.participantCode}: ${round.statementSummary}`,
        );
      });
      lines.push('');
    }

    if (reportData.riskItems?.length) {
      lines.push('## 风险评估');
      reportData.riskItems.forEach((risk) => {
        lines.push(
          `- ${risk.riskType} [${risk.level}] ${risk.description} (缓解: ${risk.mitigationAction ?? '-'})`,
        );
      });
      lines.push('');
    }

    if (reportData.paramSnapshot) {
      lines.push('## 参数快照');
      lines.push(JSON.stringify(reportData.paramSnapshot, null, 2));
      lines.push('');
    }

    return lines.join('\n');
  }

  private getArtifactMeta(taskId: string, format: string) {
    const extMap: Record<string, string> = {
      JSON: 'json',
      PDF: 'pdf',
      WORD: 'docx',
    };
    const contentTypeMap: Record<string, string> = {
      JSON: 'application/json; charset=utf-8',
      PDF: 'application/pdf',
      WORD: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const ext = extMap[format] ?? 'txt';
    const fileName = `report-export-${taskId}.${ext}`;
    const directory = path.resolve(process.cwd(), 'tmp', 'report-exports');
    const filePath = path.join(directory, fileName);
    return {
      fileName,
      filePath,
      downloadUrl: `/report-exports/${taskId}/download`,
      contentType: contentTypeMap[format] ?? 'text/plain; charset=utf-8',
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * PDF 报告渲染 — 使用 pdfkit
   */
  private async renderPdfReport(filePath: string, data: ExportReportDataDto): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      // 标题
      doc.fontSize(20).text(data.title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666')
        .text(`生成时间: ${data.generatedAt}  |  执行实例: ${data.workflowExecutionId}`, { align: 'center' });
      if (data.workflowName) {
        doc.text(`流程: ${data.workflowName}  |  版本: ${data.versionCode ?? '-'}`, { align: 'center' });
      }
      doc.moveDown(1);
      doc.fillColor('#000');

      // 结论
      if (data.conclusion) {
        doc.fontSize(16).text('一、结论', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(11);
        doc.text(`推荐操作: ${data.conclusion.action}`);
        if (data.conclusion.confidence !== null && data.conclusion.confidence !== undefined) {
          doc.text(`置信度: ${(data.conclusion.confidence * 100).toFixed(1)}%`);
        }
        if (data.conclusion.riskLevel) doc.text(`风险等级: ${data.conclusion.riskLevel}`);
        if (data.conclusion.targetWindow) doc.text(`目标窗口: ${data.conclusion.targetWindow}`);
        if (data.conclusion.reasoningSummary) {
          doc.moveDown(0.2);
          doc.text(`推理摘要: ${data.conclusion.reasoningSummary}`, { width: 500 });
        }
        if (data.conclusion.judgementVerdict) {
          doc.text(`裁决: ${data.conclusion.judgementVerdict}`);
        }
        if (data.conclusion.judgementReasoning) {
          doc.text(`裁决依据: ${data.conclusion.judgementReasoning}`, { width: 500 });
        }
        doc.moveDown(1);
      }

      // 证据
      if (data.evidenceItems?.length) {
        doc.fontSize(16).text('二、证据链', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10);
        data.evidenceItems.forEach((item, idx) => {
          doc.text(`${idx + 1}. [${item.category ?? 'N/A'}] ${item.source}`, { continued: false });
          doc.text(`   ${item.content.slice(0, 300)}${item.content.length > 300 ? '...' : ''}`, { width: 480 });
          if (item.weight !== null && item.weight !== undefined) {
            doc.text(`   权重: ${item.weight}`, { width: 480 });
          }
          doc.moveDown(0.2);
        });
        doc.moveDown(0.5);
      }

      // 辩论过程
      if (data.debateRounds?.length) {
        doc.fontSize(16).text('三、辩论过程', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10);
        let currentRoundNum = 0;
        data.debateRounds.forEach((round) => {
          if (round.roundNumber !== currentRoundNum) {
            currentRoundNum = round.roundNumber;
            doc.moveDown(0.3);
            doc.fontSize(12).text(`第 ${round.roundNumber} 轮`, { underline: false });
            doc.fontSize(10);
          }
          const stanceTag = round.stance ? ` [${round.stance}]` : '';
          const confidenceTag = round.confidence !== null && round.confidence !== undefined
            ? ` (${(round.confidence * 100).toFixed(0)}%)`
            : '';
          doc.text(`  ${round.participantCode} (${round.participantRole})${stanceTag}${confidenceTag}:`);
          doc.text(`    ${round.statementSummary.slice(0, 400)}`, { width: 460 });
          if (round.isJudgement) {
            doc.fillColor('#722ed1').text('    [裁决]', { continued: false }).fillColor('#000');
          }
          doc.moveDown(0.15);
        });
        doc.moveDown(0.5);
      }

      // 风险评估
      if (data.riskItems?.length) {
        doc.fontSize(16).text('四、风险评估', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10);
        data.riskItems.forEach((risk) => {
          const levelColor = risk.level === 'HIGH' || risk.level === 'CRITICAL' ? '#ff4d4f' : '#000';
          doc.fillColor(levelColor).text(`[${risk.level}] ${risk.riskType}: ${risk.description}`, { width: 480 });
          doc.fillColor('#000');
          if (risk.mitigationAction) {
            doc.text(`  缓解措施: ${risk.mitigationAction}`, { width: 460 });
          }
          doc.moveDown(0.2);
        });
        doc.moveDown(0.5);
      }

      // 参数快照
      if (data.paramSnapshot) {
        doc.fontSize(16).text('五、参数快照', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(8).text(JSON.stringify(data.paramSnapshot, null, 2), { width: 500 });
      }

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Word 报告渲染 — 使用 docx
   */
  private async renderWordReport(filePath: string, data: ExportReportDataDto): Promise<void> {
    const children: Paragraph[] = [];

    // 标题
    children.push(
      new Paragraph({
        text: data.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `生成时间: ${data.generatedAt}  |  执行实例: ${data.workflowExecutionId}`, size: 18, color: '666666' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    );
    if (data.workflowName) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `流程: ${data.workflowName}  |  版本: ${data.versionCode ?? '-'}`, size: 18, color: '666666' }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      );
    }
    children.push(new Paragraph({ text: '' }));

    // 结论
    if (data.conclusion) {
      children.push(new Paragraph({ text: '一、结论', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({
        children: [new TextRun({ text: `推荐操作: `, bold: true }), new TextRun(data.conclusion.action)],
      }));
      if (data.conclusion.confidence !== null && data.conclusion.confidence !== undefined) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `置信度: `, bold: true }), new TextRun(`${(data.conclusion.confidence * 100).toFixed(1)}%`)],
        }));
      }
      if (data.conclusion.riskLevel) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `风险等级: `, bold: true }), new TextRun(data.conclusion.riskLevel)],
        }));
      }
      if (data.conclusion.targetWindow) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `目标窗口: `, bold: true }), new TextRun(data.conclusion.targetWindow)],
        }));
      }
      if (data.conclusion.reasoningSummary) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `推理摘要: `, bold: true }), new TextRun(data.conclusion.reasoningSummary)],
        }));
      }
      if (data.conclusion.judgementVerdict) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `裁决: `, bold: true }), new TextRun(data.conclusion.judgementVerdict)],
        }));
      }
      if (data.conclusion.judgementReasoning) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `裁决依据: `, bold: true }), new TextRun(data.conclusion.judgementReasoning)],
        }));
      }
      children.push(new Paragraph({ text: '' }));
    }

    // 证据
    if (data.evidenceItems?.length) {
      children.push(new Paragraph({ text: '二、证据链', heading: HeadingLevel.HEADING_1 }));
      data.evidenceItems.forEach((item, idx) => {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${idx + 1}. [${item.category ?? 'N/A'}] `, bold: true }),
            new TextRun({ text: `${item.source}: `, italics: true }),
            new TextRun(item.content.slice(0, 500)),
          ],
        }));
      });
      children.push(new Paragraph({ text: '' }));
    }

    // 辩论过程
    if (data.debateRounds?.length) {
      children.push(new Paragraph({ text: '三、辩论过程', heading: HeadingLevel.HEADING_1 }));
      let currentRoundNum = 0;
      data.debateRounds.forEach((round) => {
        if (round.roundNumber !== currentRoundNum) {
          currentRoundNum = round.roundNumber;
          children.push(new Paragraph({ text: `第 ${round.roundNumber} 轮`, heading: HeadingLevel.HEADING_2 }));
        }
        const stanceTag = round.stance ? ` [${round.stance}]` : '';
        const confidenceTag = round.confidence !== null && round.confidence !== undefined
          ? ` (${(round.confidence * 100).toFixed(0)}%)`
          : '';
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${round.participantCode} (${round.participantRole})${stanceTag}${confidenceTag}: `, bold: true }),
            new TextRun(round.statementSummary),
            ...(round.isJudgement ? [new TextRun({ text: ' [裁决]', color: '722ed1', bold: true })] : []),
          ],
        }));
      });
      children.push(new Paragraph({ text: '' }));
    }

    // 风险评估
    if (data.riskItems?.length) {
      children.push(new Paragraph({ text: '四、风险评估', heading: HeadingLevel.HEADING_1 }));
      data.riskItems.forEach((risk) => {
        const isHighRisk = risk.level === 'HIGH' || risk.level === 'CRITICAL';
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `[${risk.level}] ${risk.riskType}: `, bold: true, color: isHighRisk ? 'FF4D4F' : '000000' }),
            new TextRun(risk.description),
          ],
        }));
        if (risk.mitigationAction) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `  缓解措施: `, italics: true }), new TextRun(risk.mitigationAction)],
          }));
        }
      });
      children.push(new Paragraph({ text: '' }));
    }

    // 参数快照
    if (data.paramSnapshot) {
      children.push(new Paragraph({ text: '五、参数快照', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({
        children: [new TextRun({ text: JSON.stringify(data.paramSnapshot, null, 2), size: 16, font: 'Courier New' })],
      }));
    }

    const doc = new Document({
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, buffer);
  }
}
