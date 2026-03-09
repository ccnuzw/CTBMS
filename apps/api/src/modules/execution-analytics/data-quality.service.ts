import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * 数据质量聚合 API — PRD §6.5
 *
 * 聚合各数据集的质量评分，支持按时间范围、数据域过滤。
 */

interface QualityDimension {
    completeness: number;
    timeliness: number;
    consistency: number;
    anomalyStability: number;
}

export interface DataQualityAggregation {
    /** 查询时间窗口内的总体质量得分 (0-100) */
    overallScore: number;
    /** A/B/C/D 等级 */
    grade: 'A' | 'B' | 'C' | 'D';
    /** 四维度平均 */
    dimensions: QualityDimension;
    /** 按数据域分组的质量统计 */
    domainBreakdown: DomainQualityItem[];
    /** 质量趋势（按天） */
    trend: QualityTrendPoint[];
    /** 当前活跃连接器数量 */
    activeConnectorCount: number;
    /** 采集成功率 */
    fetchSuccessRate: number;
    /** 统计时间 */
    generatedAt: string;
}

interface DomainQualityItem {
    domain: string;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D';
    datasetCount: number;
    latestFetchAt: string | null;
}

interface QualityTrendPoint {
    date: string;
    score: number;
    fetchCount: number;
    errorCount: number;
}

export interface DataQualityQueryDto {
    domain?: string;
    startDate?: string;
    endDate?: string;
    days?: number;
}

@Injectable()
export class DataQualityService {
    private readonly logger = new Logger(DataQualityService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getQualityAggregation(query: DataQualityQueryDto): Promise<DataQualityAggregation> {
        const days = query.days ?? 7;
        const endDate = query.endDate ? new Date(query.endDate) : new Date();
        const startDate = query.startDate
            ? new Date(query.startDate)
            : new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

        // 聚合节点执行的质量数据
        const nodeExecutions = await this.prisma.nodeExecution.findMany({
            where: {
                startedAt: { gte: startDate, lte: endDate },
                nodeType: { in: ['data-fetch', 'futures-data-fetch', 'external-api-fetch', 'report-fetch'] },
            },
            select: {
                nodeType: true,
                status: true,
                startedAt: true,
                durationMs: true,
                outputSnapshot: true,
            },
            orderBy: { startedAt: 'asc' },
        });

        // 计算整体质量分数
        const totalFetches = nodeExecutions.length;
        const successFetches = nodeExecutions.filter((n) => n.status === 'SUCCESS').length;
        const fetchSuccessRate = totalFetches > 0 ? successFetches / totalFetches : 1;

        // 计算四维度
        const completeness = this.computeCompleteness(nodeExecutions as Array<{ status: string; outputSnapshot: unknown }>);
        const timeliness = this.computeTimeliness(nodeExecutions);
        const consistency = fetchSuccessRate * 100;
        const anomalyStability = this.computeAnomalyStability(nodeExecutions);

        const dimensions: QualityDimension = {
            completeness,
            timeliness,
            consistency,
            anomalyStability,
        };

        const overallScore = Math.round(
            completeness * 0.3 + timeliness * 0.25 + consistency * 0.25 + anomalyStability * 0.2,
        );

        const grade = this.resolveGrade(overallScore);

        // 按节点类型（模拟 domain）分组
        const domainMap = new Map<string, { scores: number[]; count: number; latestAt: Date | null }>();
        for (const exec of nodeExecutions) {
            const domain = this.nodeTypeToDomain(exec.nodeType);
            const entry = domainMap.get(domain) ?? { scores: [], count: 0, latestAt: null };
            entry.count++;
            if (exec.status === 'SUCCESS') entry.scores.push(100);
            else entry.scores.push(0);
            if (exec.startedAt && (!entry.latestAt || exec.startedAt > entry.latestAt)) {
                entry.latestAt = exec.startedAt;
            }
            domainMap.set(domain, entry);
        }

        const domainBreakdown: DomainQualityItem[] = Array.from(domainMap.entries()).map(
            ([domain, entry]) => {
                const avgScore =
                    entry.scores.length > 0
                        ? Math.round(entry.scores.reduce((s, v) => s + v, 0) / entry.scores.length)
                        : 0;
                return {
                    domain,
                    score: avgScore,
                    grade: this.resolveGrade(avgScore),
                    datasetCount: entry.count,
                    latestFetchAt: entry.latestAt?.toISOString() ?? null,
                };
            },
        );

        // 按天计算趋势
        const trendMap = new Map<string, { score: number[]; fetchCount: number; errorCount: number }>();
        for (const exec of nodeExecutions) {
            if (!exec.startedAt) continue;
            const dateKey = exec.startedAt.toISOString().slice(0, 10);
            const entry = trendMap.get(dateKey) ?? { score: [], fetchCount: 0, errorCount: 0 };
            entry.fetchCount++;
            if (exec.status === 'SUCCESS') {
                entry.score.push(100);
            } else {
                entry.score.push(0);
                entry.errorCount++;
            }
            trendMap.set(dateKey, entry);
        }

        const trend: QualityTrendPoint[] = Array.from(trendMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, entry]) => ({
                date,
                score:
                    entry.score.length > 0
                        ? Math.round(entry.score.reduce((s, v) => s + v, 0) / entry.score.length)
                        : 0,
                fetchCount: entry.fetchCount,
                errorCount: entry.errorCount,
            }));

        // 活跃连接器数
        const activeConnectorCount = domainMap.size;

        return {
            overallScore,
            grade,
            dimensions,
            domainBreakdown,
            trend,
            activeConnectorCount,
            fetchSuccessRate: Math.round(fetchSuccessRate * 1000) / 10,
            generatedAt: new Date().toISOString(),
        };
    }

    private computeCompleteness(
        executions: Array<{ status: string; outputSnapshot: unknown }>,
    ): number {
        if (executions.length === 0) return 100;
        const withOutput = executions.filter((e) => {
            if (e.status !== 'SUCCESS') return false;
            const snapshot = e.outputSnapshot as Record<string, unknown> | null;
            return snapshot && Object.keys(snapshot).length > 0;
        });
        return Math.round((withOutput.length / executions.length) * 100);
    }

    private computeTimeliness(
        executions: Array<{ durationMs: number | null; status: string }>,
    ): number {
        const successful = executions.filter((e) => e.status === 'SUCCESS' && e.durationMs);
        if (successful.length === 0) return 100;
        const avgDuration =
            successful.reduce((s, e) => s + (e.durationMs ?? 0), 0) / successful.length;
        // 低于 5 秒 = 100 分，超过 60 秒 = 0 分
        const score = Math.max(0, Math.min(100, 100 - ((avgDuration - 5000) / 55000) * 100));
        return Math.round(score);
    }

    private computeAnomalyStability(executions: Array<{ status: string }>): number {
        if (executions.length < 3) return 100;
        // 计算连续失败的最大长度
        let maxConsecutiveFailures = 0;
        let current = 0;
        for (const exec of executions) {
            if (exec.status !== 'SUCCESS') {
                current++;
                maxConsecutiveFailures = Math.max(maxConsecutiveFailures, current);
            } else {
                current = 0;
            }
        }
        // 连续失败 0 = 100 分，连续失败 5+ = 0 分
        return Math.round(Math.max(0, 100 - maxConsecutiveFailures * 20));
    }

    private resolveGrade(score: number): 'A' | 'B' | 'C' | 'D' {
        if (score >= 90) return 'A';
        if (score >= 70) return 'B';
        if (score >= 50) return 'C';
        return 'D';
    }

    private nodeTypeToDomain(nodeType: string): string {
        switch (nodeType) {
            case 'data-fetch':
                return 'SPOT_PRICE';
            case 'futures-data-fetch':
                return 'FUTURES';
            case 'external-api-fetch':
                return 'EXTERNAL';
            case 'report-fetch':
                return 'KNOWLEDGE';
            default:
                return 'OTHER';
        }
    }
}
