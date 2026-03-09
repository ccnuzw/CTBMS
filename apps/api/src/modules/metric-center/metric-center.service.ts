import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, DataFreshnessStatus, MetricStatus } from '@prisma/client';
import {
  MetricComputeRequestDto,
  MetricComputeResponseDto,
  MetricSnapshotRunRequestDto,
} from '@packages/types';
import { PrismaService } from '../../prisma';

type EvaluationResult = {
  value: number;
  variables: Record<string, number>;
};

@Injectable()
export class MetricCenterService {
  private readonly logger = new Logger(MetricCenterService.name);
  private readonly allowedFunctions = new Set([
    'abs',
    'min',
    'max',
    'round',
    'ceil',
    'floor',
    'pow',
    'sqrt',
    'log',
    'exp',
  ]);
  private readonly reservedIdentifiers = new Set([
    'Math',
    'PI',
    'E',
    'e',
    ...this.allowedFunctions,
  ]);
  private readonly forbiddenTokens = /(__proto__|prototype|constructor|Function|require|process|global|window|this)/i;

  constructor(private readonly prisma: PrismaService) { }

  async computeMetric(dto: MetricComputeRequestDto): Promise<MetricComputeResponseDto> {
    const metricCatalog = await this.resolveMetricCatalog(dto.metricCode, dto.metricVersion);
    const evaluation = this.evaluateExpression(metricCatalog.expression, dto.variables);
    const dataTime = dto.dataTime ? new Date(dto.dataTime) : new Date();
    const normalizedDataTime = this.normalizeDataTime(dataTime, metricCatalog.granularity ?? undefined);
    const { freshnessStatus, qualityScore, confidenceScore } = this.resolveSnapshotScores(
      metricCatalog,
      normalizedDataTime,
      dto.qualityScore,
      dto.confidenceScore,
    );

    let snapshotId: string | undefined;
    if (dto.persistSnapshot) {
      const snapshot = await this.prisma.metricValueSnapshot.create({
        data: {
          metricCatalogId: metricCatalog.id,
          metricCode: metricCatalog.metricCode,
          metricVersion: metricCatalog.version,
          value: new Prisma.Decimal(evaluation.value),
          valueText: evaluation.value.toString(),
          dimensions: dto.dimensions ? (dto.dimensions as Prisma.InputJsonValue) : undefined,
          dataTime: normalizedDataTime,
          freshnessStatus,
          qualityScore: new Prisma.Decimal(qualityScore),
          confidenceScore: confidenceScore ? new Prisma.Decimal(confidenceScore) : null,
          sourceSummary: {
            variables: evaluation.variables,
          } as Prisma.InputJsonValue,
        },
      });
      snapshotId = snapshot.id;
    }

    return {
      metricCatalogId: metricCatalog.id,
      metricCode: metricCatalog.metricCode,
      metricVersion: metricCatalog.version,
      value: evaluation.value,
      dataTime: normalizedDataTime.toISOString(),
      snapshotId,
    };
  }

  async runSnapshotJob(dto: MetricSnapshotRunRequestDto) {
    const where: Prisma.MetricCatalogWhereInput = {
      status: MetricStatus.ACTIVE,
      metricCode: dto.metricCodes ? { in: dto.metricCodes } : undefined,
    };
    const metrics = await this.prisma.metricCatalog.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    const results = [];
    let successCount = 0;
    let skippedCount = 0;

    for (const metric of metrics) {
      const variables = this.resolveDefaultVariables(metric.dimensions);
      if (!variables) {
        skippedCount += 1;
        results.push({
          metricCode: metric.metricCode,
          status: 'SKIPPED',
          reason: 'missing_default_variables',
        });
        continue;
      }

      try {
        const evaluation = this.evaluateExpression(metric.expression, variables);
        if (dto.dryRun) {
          successCount += 1;
          results.push({
            metricCode: metric.metricCode,
            status: 'DRY_RUN',
            value: evaluation.value,
          });
          continue;
        }

        const now = this.normalizeDataTime(new Date(), metric.granularity ?? undefined);
        const existingSnapshot = await this.prisma.metricValueSnapshot.findFirst({
          where: {
            metricCatalogId: metric.id,
            dataTime: now,
          },
          select: { id: true },
        });
        if (existingSnapshot) {
          skippedCount += 1;
          results.push({
            metricCode: metric.metricCode,
            status: 'SKIPPED',
            reason: 'snapshot_exists',
            snapshotId: existingSnapshot.id,
          });
          continue;
        }
        const { freshnessStatus, qualityScore, confidenceScore } = this.resolveSnapshotScores(
          metric,
          now,
          undefined,
          undefined,
        );

        const snapshot = await this.prisma.metricValueSnapshot.create({
          data: {
            metricCatalogId: metric.id,
            metricCode: metric.metricCode,
            metricVersion: metric.version,
            value: new Prisma.Decimal(evaluation.value),
            valueText: evaluation.value.toString(),
            dimensions: metric.dimensions ? (metric.dimensions as Prisma.InputJsonValue) : undefined,
            dataTime: now,
            freshnessStatus,
            qualityScore: new Prisma.Decimal(qualityScore),
            confidenceScore: confidenceScore ? new Prisma.Decimal(confidenceScore) : null,
            sourceSummary: {
              variables: evaluation.variables,
              trigger: 'SCHEDULED',
            } as Prisma.InputJsonValue,
          },
        });

        successCount += 1;
        results.push({
          metricCode: metric.metricCode,
          status: 'SUCCESS',
          snapshotId: snapshot.id,
          value: evaluation.value,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Metric snapshot failed: ${metric.metricCode} - ${message}`);
        results.push({
          metricCode: metric.metricCode,
          status: 'FAILED',
          reason: message,
        });
      }
    }

    return {
      total: metrics.length,
      successCount,
      skippedCount,
      results,
    };
  }

  async snapshotActiveMetrics() {
    return this.runSnapshotJob({ dryRun: false });
  }

  /**
   * 更新指标状态：DRAFT → ACTIVE → DEPRECATED
   */
  async updateMetricStatus(
    metricCode: string,
    version: string,
    newStatus: 'DRAFT' | 'ACTIVE' | 'DEPRECATED',
  ) {
    const metric = await this.prisma.metricCatalog.findFirst({
      where: { metricCode, version },
    });
    if (!metric) {
      throw new BadRequestException(`Metric ${metricCode}(${version}) 不存在`);
    }

    // WHY: 状态流转约束 — DRAFT→ACTIVE→DEPRECATED，不可逆转
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['ACTIVE'],
      ACTIVE: ['DEPRECATED'],
      DEPRECATED: [], // 终态
    };
    const allowed = validTransitions[metric.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `不允许从 ${metric.status} 流转到 ${newStatus}（允许的目标：${allowed.join(', ') || '无'})`,
      );
    }

    return this.prisma.metricCatalog.update({
      where: { id: metric.id },
      data: { status: newStatus as MetricStatus },
    });
  }

  /**
   * 查询指标所有版本列表
   */
  async listMetricVersions(metricCode: string) {
    return this.prisma.metricCatalog.findMany({
      where: { metricCode },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        metricCode: true,
        metricName: true,
        version: true,
        status: true,
        expression: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private async resolveMetricCatalog(metricCode: string, metricVersion?: string) {
    if (metricVersion) {
      const record = await this.prisma.metricCatalog.findFirst({
        where: { metricCode, version: metricVersion },
      });
      if (!record) {
        throw new BadRequestException(`Metric ${metricCode}(${metricVersion}) 不存在`);
      }
      return record;
    }

    const record = await this.prisma.metricCatalog.findFirst({
      where: { metricCode },
      orderBy: { updatedAt: 'desc' },
    });
    if (!record) {
      throw new BadRequestException(`Metric ${metricCode} 不存在`);
    }
    return record;
  }

  private evaluateExpression(expression: string, variables: Record<string, number>): EvaluationResult {
    this.validateExpression(expression);
    const identifiers = this.extractIdentifiers(expression);
    const missing = identifiers.filter((name) => !(name in variables));
    if (missing.length > 0) {
      throw new BadRequestException(`缺少变量: ${missing.join(', ')}`);
    }

    const args = identifiers.map((name) => variables[name]);
    const evaluator = new Function(
      ...identifiers,
      `const { ${Array.from(this.allowedFunctions).join(', ')}, PI, E } = Math; return ${expression};`,
    ) as (...params: number[]) => number;

    const value = evaluator(...args);
    if (!Number.isFinite(value)) {
      throw new BadRequestException('计算结果非法');
    }

    return {
      value,
      variables,
    };
  }

  private validateExpression(expression: string) {
    if (!expression.trim()) {
      throw new BadRequestException('指标公式不能为空');
    }
    if (this.forbiddenTokens.test(expression)) {
      throw new BadRequestException('指标公式包含非法关键词');
    }
    const invalidChars = /[^0-9+\-*/().,_A-Za-z\s%]/;
    if (invalidChars.test(expression)) {
      throw new BadRequestException('指标公式包含非法字符');
    }
  }

  private extractIdentifiers(expression: string) {
    const matches = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    const unique = Array.from(new Set(matches));
    return unique.filter((name) => !this.reservedIdentifiers.has(name));
  }

  private resolveDefaultVariables(dimensions: Prisma.JsonValue | null) {
    if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
      return null;
    }
    const variables = (dimensions as Record<string, unknown>).variables;
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
      return null;
    }

    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private normalizeDataTime(input: Date, granularity?: string) {
    if (!granularity) return input;
    const normalized = new Date(input);
    const lowered = granularity.toLowerCase();
    if (lowered === 'hourly') {
      normalized.setMinutes(0, 0, 0);
    }
    if (lowered === 'daily') {
      normalized.setHours(0, 0, 0, 0);
    }
    return normalized;
  }

  private resolveSnapshotScores(
    metric: { dimensions: Prisma.JsonValue | null },
    dataTime: Date,
    qualityOverride?: number,
    confidenceOverride?: number,
  ) {
    const config = metric.dimensions && typeof metric.dimensions === 'object' && !Array.isArray(metric.dimensions)
      ? (metric.dimensions as Record<string, unknown>)
      : {};
    const ttlMinutes = typeof config.freshnessTtlMinutes === 'number' ? config.freshnessTtlMinutes : 60;
    const qualityDefault = typeof config.qualityScoreDefault === 'number' ? config.qualityScoreDefault : 0.9;
    const confidenceDefault = typeof config.confidenceScoreDefault === 'number' ? config.confidenceScoreDefault : 0.8;

    const freshnessStatus = this.resolveFreshnessStatus(dataTime, ttlMinutes);
    const qualityScore = qualityOverride ?? qualityDefault;
    const confidenceScore = confidenceOverride ?? confidenceDefault;

    return {
      freshnessStatus,
      qualityScore,
      confidenceScore,
    };
  }

  private resolveFreshnessStatus(dataTime: Date, ttlMinutes: number): DataFreshnessStatus {
    const ageMinutes = (Date.now() - dataTime.getTime()) / 60000;
    if (ageMinutes <= ttlMinutes) return DataFreshnessStatus.WITHIN_TTL;
    if (ageMinutes <= ttlMinutes * 1.5) return DataFreshnessStatus.NEAR_EXPIRE;
    return DataFreshnessStatus.EXPIRED;
  }
}
