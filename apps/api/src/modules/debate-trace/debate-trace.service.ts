import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DebateRoundTraceQueryDto, CreateDebateRoundTraceDto } from '@packages/types';
import { PrismaService } from '../../prisma';

interface DebateTraceRecord {
  roundNumber: number;
  participantCode: string;
  participantName?: string;
  confidence: number | null;
  previousConfidence: number | null;
  isJudgement: boolean;
}

@Injectable()
export class DebateTraceService {
  private readonly logger = new Logger(DebateTraceService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * 批量写入辩论轨迹（由执行器调用）
   */
  async createBatch(traces: CreateDebateRoundTraceDto[]): Promise<{ count: number }> {
    const result = await this.prisma.debateRoundTrace.createMany({
      data: traces.map((trace) => ({
        ...trace,
        evidenceRefs: (trace.evidenceRefs as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        keyPoints: (trace.keyPoints as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      })),
    });
    this.logger.log(`批量写入 ${result.count} 条辩论轨迹`);
    return { count: result.count };
  }

  /**
   * 按执行实例查询全部轨迹
   */
  async findByExecution(query: DebateRoundTraceQueryDto) {
    const where: Prisma.DebateRoundTraceWhereInput = {
      workflowExecutionId: query.workflowExecutionId,
    };
    if (query.roundNumber !== undefined) {
      where.roundNumber = query.roundNumber;
    }
    if (query.participantCode) {
      where.participantCode = query.participantCode;
    }
    if (query.participantRole) {
      where.participantRole = query.participantRole;
    }
    if (query.isJudgement !== undefined) {
      where.isJudgement = query.isJudgement;
    }
    if (query.keyword) {
      where.OR = [
        { statementText: { contains: query.keyword, mode: 'insensitive' } },
        { challengeText: { contains: query.keyword, mode: 'insensitive' } },
        { responseText: { contains: query.keyword, mode: 'insensitive' } },
        { judgementReasoning: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    return this.prisma.debateRoundTrace.findMany({
      where,
      orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * 组装时间线视图
   */
  async getDebateTimeline(executionId: string) {
    const allTraces = await this.prisma.debateRoundTrace.findMany({
      where: { workflowExecutionId: executionId },
      orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
    });

    // 按轮次分组
    // 获取参与者名称映射
    const participantCodes = [...new Set(allTraces.map((t) => t.participantCode))];
    const agentProfiles = await this.prisma.agentProfile.findMany({
      where: { agentCode: { in: participantCodes } },
      select: { agentCode: true, agentName: true },
    });
    const nameMap = new Map(agentProfiles.map((p) => [p.agentCode, p.agentName]));

    // 按轮次分组并填充名称和归一化置信度
    const roundMap = new Map<number, DebateTraceRecord[]>();
    for (const trace of allTraces) {
      const existing = roundMap.get(trace.roundNumber) ?? [];

      // 归一化置信度 (如果大于1则除以100)
      let confidence = trace.confidence;
      if (confidence !== null && confidence > 1) {
        confidence = confidence / 100;
      }

      let previousConfidence = trace.previousConfidence;
      if (previousConfidence !== null && previousConfidence > 1) {
        previousConfidence = previousConfidence / 100;
      }

      const enrichedTrace = {
        ...trace,
        confidence,
        previousConfidence,
        participantName: nameMap.get(trace.participantCode),
      };

      existing.push(enrichedTrace as DebateTraceRecord);
      roundMap.set(trace.roundNumber, existing);
    }

    const rounds = Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([roundNumber, entries]) => {
        const confidences = entries
          .filter((e: DebateTraceRecord) => e.confidence !== null)
          .map((e: DebateTraceRecord) => e.confidence as number);

        const prevConfidences = entries
          .filter((e: DebateTraceRecord) => e.previousConfidence !== null)
          .map((e: DebateTraceRecord) => e.previousConfidence as number);

        const avgConfidence =
          confidences.length > 0
            ? confidences.reduce((sum: number, c: number) => sum + c, 0) / confidences.length
            : null;

        const avgPrevConfidence =
          prevConfidences.length > 0
            ? prevConfidences.reduce((sum: number, c: number) => sum + c, 0) /
            prevConfidences.length
            : null;

        return {
          roundNumber,
          entries,
          roundSummary: {
            participantCount: new Set(entries.map((e: DebateTraceRecord) => e.participantCode))
              .size,
            hasJudgement: entries.some((e: DebateTraceRecord) => e.isJudgement),
            avgConfidence,
            confidenceDelta:
              avgConfidence !== null && avgPrevConfidence !== null
                ? avgConfidence - avgPrevConfidence
                : null,
          },
        };
      });

    return {
      executionId,
      totalRounds: rounds.length,
      rounds,
    };
  }
}
