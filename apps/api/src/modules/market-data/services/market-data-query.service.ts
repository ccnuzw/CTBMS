// ─── Market Data Query Service ────────────────────────────────────────────────
// Handles standardized data queries, validation, reconciliation execution,
// and data quality scoring. Extracted from MarketDataService during refactoring.

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
    CreateReconciliationJobDto,
    ReconciliationSummaryDto,
    StandardEventRecord,
    StandardFuturesRecord,
    StandardSpotRecord,
} from '@packages/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma';
import type {
    StandardDataset,
    StandardizedDataFreshness,
    StandardizedDataMeta,
    StandardizedDataQualityScore,
} from './market-data.types';
import { COMMODITY_CODE_MAP, MARKET_INTEL_EVENT_TYPE_MAP } from './market-data.types';

@Injectable()
export class MarketDataQueryService {
    private readonly logger = new Logger(MarketDataQueryService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ─── Reconciliation Execution ───────────────────────────────────────────────

    async runReconciliation(dto: CreateReconciliationJobDto): Promise<{
        summary: ReconciliationSummaryDto;
        sampleDiffs: Array<Record<string, unknown>>;
    }> {
        const from = new Date(dto.timeRange.from);
        const to = new Date(dto.timeRange.to);

        if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
            throw new BadRequestException('invalid time range');
        }

        const sampleDiffs: Array<Record<string, unknown>> = [];
        const maxDiffRate = dto.threshold?.maxDiffRate ?? 0.01;
        const maxMissingRate = dto.threshold?.maxMissingRate ?? 0.005;

        if (dto.dataset === 'SPOT_PRICE') {
            const rows = await this.querySpot(dto.dimensions, 5000, from, to);
            const summary = this.calculateReconciliationSummary(
                rows,
                maxDiffRate,
                maxMissingRate,
                (row) => `${row.commodityCode}_${row.regionCode}_${row.dataTime}`,
                (row) => this.validateStandardSpotRecord(row),
            );
            sampleDiffs.push(...summary.sampleDiffs);
            return { summary: summary.summary, sampleDiffs };
        }

        if (dto.dataset === 'FUTURES_QUOTE') {
            const rows = await this.queryFutures(dto.dimensions, 5000, from, to);
            const summary = this.calculateReconciliationSummary(
                rows,
                maxDiffRate,
                maxMissingRate,
                (row) => `${row.contractCode}_${row.dataTime}`,
                (row) => this.validateStandardFuturesRecord(row),
            );
            sampleDiffs.push(...summary.sampleDiffs);
            return { summary: summary.summary, sampleDiffs };
        }

        const rows = await this.queryMarketEvent(dto.dimensions, 5000, from, to);
        const summary = this.calculateReconciliationSummary(
            rows,
            maxDiffRate,
            maxMissingRate,
            (row) => `${row.eventType}_${row.title}_${row.publishedAt}`,
            (row) => this.validateStandardEventRecord(row),
        );
        sampleDiffs.push(...summary.sampleDiffs);
        return { summary: summary.summary, sampleDiffs };
    }

    calculateReconciliationSummary<T>(
        rows: T[],
        maxDiffRate: number,
        maxMissingRate: number,
        businessKeyResolver: (row: T) => string,
        issueResolver: (row: T) => string[],
    ) {
        const sampleDiffs: Array<Record<string, unknown>> = [];
        const keySet = new Set<string>();

        let diffCount = 0;
        let missingCount = 0;
        let conflictCount = 0;

        for (const row of rows) {
            let hasDiff = false;
            const key = businessKeyResolver(row);
            if (keySet.has(key)) {
                conflictCount += 1;
                hasDiff = true;
                if (sampleDiffs.length < 20) {
                    sampleDiffs.push({ diffType: 'CONFLICT', businessKey: key });
                }
            } else {
                keySet.add(key);
            }

            const issues = issueResolver(row);
            if (issues.length > 0) {
                missingCount += 1;
                hasDiff = true;
                if (sampleDiffs.length < 20) {
                    sampleDiffs.push({ diffType: 'MISSING', businessKey: key, issues });
                }
            }

            if (hasDiff) {
                diffCount += 1;
            }
        }

        const totalCount = rows.length;
        const safeTotal = totalCount === 0 ? 1 : totalCount;
        const diffRate = diffCount / safeTotal;
        const missingRate = missingCount / safeTotal;
        const conflictRate = conflictCount / safeTotal;

        const pass = diffRate <= maxDiffRate && missingRate <= maxMissingRate;

        return {
            summary: {
                diffRate,
                missingRate,
                conflictRate,
                pass,
                totalCount,
                diffCount,
                missingCount,
                conflictCount,
            },
            sampleDiffs,
        };
    }

    // ─── Data Queries ───────────────────────────────────────────────────────────

    async querySpot(
        filters?: Record<string, unknown>,
        limit = 100,
        from?: Date,
        to?: Date,
    ): Promise<StandardSpotRecord[]> {
        const where: Prisma.PriceDataWhereInput = {};

        const commodity = this.getFilterString(filters, ['commodity', 'commodityCode']);
        if (commodity) {
            const commodityCandidates = this.resolveCommodityCandidates(commodity);
            where.commodity =
                commodityCandidates.length === 1 ? commodityCandidates[0] : { in: commodityCandidates };
        }

        const regionCode = this.getFilterString(filters, ['regionCode']);
        if (regionCode) {
            where.regionCode = regionCode;
        }

        const dateFrom = from ?? this.getFilterDate(filters, ['dateFrom']);
        const dateTo = to ?? this.getFilterDate(filters, ['dateTo']);
        if (dateFrom || dateTo) {
            where.effectiveDate = {};
            if (dateFrom) {
                where.effectiveDate.gte = dateFrom;
            }
            if (dateTo) {
                where.effectiveDate.lte = dateTo;
            }
        }

        const rows = await this.prisma.priceData.findMany({
            where,
            orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            select: {
                id: true,
                commodity: true,
                regionCode: true,
                province: true,
                city: true,
                price: true,
                sourceType: true,
                effectiveDate: true,
            },
        });

        return rows.map((row) => ({
            recordId: row.id,
            commodityCode: this.normalizeCommodityCode(row.commodity),
            regionCode: this.normalizeRegionCode(row.regionCode, row.province, row.city),
            spotPrice: Number(row.price),
            unit: 'CNY/TON',
            dataTime: row.effectiveDate.toISOString(),
            sourceType: String(row.sourceType),
            sourceRecordId: row.id,
        }));
    }

    async queryFutures(
        filters?: Record<string, unknown>,
        limit = 100,
        from?: Date,
        to?: Date,
    ): Promise<StandardFuturesRecord[]> {
        const where: Prisma.FuturesQuoteSnapshotWhereInput = {};

        const contractCode = this.getFilterString(filters, ['contractCode']);
        if (contractCode) {
            where.contractCode = contractCode;
        }

        const exchange = this.getFilterString(filters, ['exchange']);
        if (exchange) {
            where.exchange = exchange;
        }

        const dateFrom = from ?? this.getFilterDate(filters, ['dateFrom']);
        const dateTo = to ?? this.getFilterDate(filters, ['dateTo']);
        if (dateFrom || dateTo) {
            where.snapshotAt = {};
            if (dateFrom) {
                where.snapshotAt.gte = dateFrom;
            }
            if (dateTo) {
                where.snapshotAt.lte = dateTo;
            }
        }

        const rows = await this.prisma.futuresQuoteSnapshot.findMany({
            where,
            orderBy: [{ snapshotAt: 'desc' }],
            take: limit,
            select: {
                id: true,
                contractCode: true,
                exchange: true,
                lastPrice: true,
                closePrice: true,
                snapshotAt: true,
            },
        });

        return rows.map((row) => ({
            recordId: row.id,
            contractCode: row.contractCode,
            exchangeCode: row.exchange,
            closePrice: Number(row.closePrice ?? row.lastPrice),
            dataTime: row.snapshotAt.toISOString(),
            sourceType: 'FUTURES_API',
            sourceRecordId: row.id,
        }));
    }

    async queryMarketEvent(
        filters?: Record<string, unknown>,
        limit = 100,
        from?: Date,
        to?: Date,
    ): Promise<StandardEventRecord[]> {
        const where: Prisma.MarketIntelWhereInput = {};

        const contentType = this.getFilterString(filters, ['contentType']);
        if (contentType) {
            const normalized = contentType.trim().toUpperCase();
            if (normalized === 'DAILY_REPORT' || normalized === 'RESEARCH_REPORT') {
                where.contentType = normalized as 'DAILY_REPORT' | 'RESEARCH_REPORT';
            }
        }

        const dateFrom = from ?? this.getFilterDate(filters, ['dateFrom']);
        const dateTo = to ?? this.getFilterDate(filters, ['dateTo']);
        if (dateFrom || dateTo) {
            where.effectiveTime = {};
            if (dateFrom) {
                where.effectiveTime.gte = dateFrom;
            }
            if (dateTo) {
                where.effectiveTime.lte = dateTo;
            }
        }

        const rows = await this.prisma.marketIntel.findMany({
            where,
            orderBy: [{ effectiveTime: 'desc' }],
            take: limit,
            select: {
                id: true,
                contentType: true,
                summary: true,
                rawContent: true,
                sourceType: true,
                effectiveTime: true,
            },
        });

        return rows.map((row) => {
            const summary = (row.summary ?? row.rawContent ?? '').slice(0, 500);
            const title = summary.slice(0, 40) || '市场情报';
            return {
                recordId: row.id,
                eventType: MARKET_INTEL_EVENT_TYPE_MAP[String(row.contentType ?? '')] ?? 'NEWS',
                title,
                summary,
                publishedAt: row.effectiveTime.toISOString(),
                sourceType: String(row.sourceType),
                sourceRecordId: row.id,
            };
        });
    }

    // ─── Validation ─────────────────────────────────────────────────────────────

    validateStandardSpotRecord(row: StandardSpotRecord): string[] {
        const issues: string[] = [];
        if (!row.commodityCode) {
            issues.push('commodityCode missing');
        }
        if (!row.regionCode) {
            issues.push('regionCode missing');
        }
        if (!Number.isFinite(row.spotPrice)) {
            issues.push('spotPrice invalid');
        }
        if (!row.dataTime) {
            issues.push('dataTime missing');
        }
        return issues;
    }

    validateStandardFuturesRecord(row: StandardFuturesRecord): string[] {
        const issues: string[] = [];
        if (!row.contractCode) {
            issues.push('contractCode missing');
        }
        if (!row.exchangeCode) {
            issues.push('exchangeCode missing');
        }
        if (!Number.isFinite(row.closePrice)) {
            issues.push('closePrice invalid');
        }
        if (!row.dataTime) {
            issues.push('dataTime missing');
        }
        return issues;
    }

    validateStandardEventRecord(row: StandardEventRecord): string[] {
        const issues: string[] = [];
        if (!row.eventType) {
            issues.push('eventType missing');
        }
        if (!row.title) {
            issues.push('title missing');
        }
        if (!row.summary) {
            issues.push('summary missing');
        }
        if (!row.publishedAt) {
            issues.push('publishedAt missing');
        }
        return issues;
    }

    // ─── Normalization ─────────────────────────────────────────────────────────

    normalizeCommodityCode(rawCommodity: string): string {
        const compact = rawCommodity?.trim();
        if (!compact) {
            return '';
        }
        if (COMMODITY_CODE_MAP[compact]) {
            return COMMODITY_CODE_MAP[compact];
        }
        return compact
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .toUpperCase();
    }

    resolveCommodityCandidates(input: string): string[] {
        const compact = input.trim();
        if (!compact) {
            return [];
        }

        const upper = compact.toUpperCase();
        const matchedLabel = Object.entries(COMMODITY_CODE_MAP).find(([, code]) => code === upper)?.[0];
        if (matchedLabel) {
            return [compact, matchedLabel];
        }

        return [compact];
    }

    normalizeRegionCode(
        regionCode?: string | null,
        province?: string | null,
        city?: string | null,
    ): string {
        if (regionCode && regionCode.trim().length > 0) {
            return regionCode.trim();
        }
        const provincePart = (province ?? '').trim();
        const cityPart = (city ?? '').trim();
        if (provincePart && cityPart) {
            return `${provincePart}_${cityPart}`.toUpperCase();
        }
        if (provincePart) {
            return provincePart.toUpperCase();
        }
        return 'UNKNOWN_REGION';
    }

    // ─── Filter Helpers ─────────────────────────────────────────────────────────

    getFilterString(filters: Record<string, unknown> | undefined, keys: string[]) {
        if (!filters) {
            return undefined;
        }
        for (const key of keys) {
            const value = filters[key];
            if (typeof value === 'string' && value.trim().length > 0) {
                return value.trim();
            }
        }
        return undefined;
    }

    getFilterDate(filters: Record<string, unknown> | undefined, keys: string[]) {
        const raw = this.getFilterString(filters, keys);
        if (!raw) {
            return undefined;
        }
        const parsed = new Date(raw);
        if (!Number.isFinite(parsed.getTime())) {
            return undefined;
        }
        return parsed;
    }

    // ─── Data Quality & Meta ────────────────────────────────────────────────────

    buildMeta(
        dataset: StandardDataset,
        rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    ): StandardizedDataMeta {
        const freshness = this.buildFreshnessMeta(dataset, rows);
        const qualityScore = this.buildQualityScoreMeta(dataset, rows, freshness.dataLagMinutes);
        return {
            recordCount: rows.length,
            mappingVersion: 'v1',
            fetchedAt: new Date().toISOString(),
            degradeAction: this.resolveDegradeAction(freshness.degradeSeverity),
            qualityScore,
            freshness,
        };
    }

    private resolveDegradeAction(
        severity: StandardizedDataFreshness['degradeSeverity'],
    ): StandardizedDataMeta['degradeAction'] {
        if (severity === 'NONE') {
            return 'ALLOW';
        }
        if (severity === 'WARNING') {
            return 'WARN';
        }
        return 'BLOCK';
    }

    private buildFreshnessMeta(
        dataset: StandardDataset,
        rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    ): StandardizedDataFreshness {
        const ttlMinutes = this.getDatasetFreshnessTtlMinutes(dataset);
        const timestamps = rows
            .map((row) => this.extractRecordTime(row, dataset))
            .filter((value): value is Date => !!value)
            .sort((a, b) => a.getTime() - b.getTime());

        if (timestamps.length === 0) {
            return {
                status: 'UNKNOWN',
                degradeSeverity: 'CRITICAL',
                ttlMinutes,
            };
        }

        const oldest = timestamps[0];
        const newest = timestamps[timestamps.length - 1];
        const lagMinutes = Math.max(0, (Date.now() - newest.getTime()) / (1000 * 60));

        if (lagMinutes <= ttlMinutes) {
            return {
                status: 'FRESH',
                degradeSeverity: 'NONE',
                ttlMinutes,
                dataLagMinutes: lagMinutes,
                newestDataTime: newest.toISOString(),
                oldestDataTime: oldest.toISOString(),
            };
        }

        if (lagMinutes <= ttlMinutes * 2) {
            return {
                status: 'STALE',
                degradeSeverity: 'WARNING',
                ttlMinutes,
                dataLagMinutes: lagMinutes,
                newestDataTime: newest.toISOString(),
                oldestDataTime: oldest.toISOString(),
            };
        }

        return {
            status: 'OUTDATED',
            degradeSeverity: 'CRITICAL',
            ttlMinutes,
            dataLagMinutes: lagMinutes,
            newestDataTime: newest.toISOString(),
            oldestDataTime: oldest.toISOString(),
        };
    }

    private buildQualityScoreMeta(
        dataset: StandardDataset,
        rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
        dataLagMinutes?: number,
    ): StandardizedDataQualityScore {
        const ttlMinutes = this.getDatasetFreshnessTtlMinutes(dataset);
        const completeness = this.computeCompletenessScore(dataset, rows);
        const consistency = this.computeConsistencyScore(dataset, rows);
        const timeliness = this.computeTimelinessScore(dataLagMinutes, ttlMinutes, rows.length);
        const anomalyStability = this.computeAnomalyStabilityScore(dataset, rows);

        // PRD §8.4: completeness×0.35 + timeliness×0.30 + consistency×0.20 + anomalyStability×0.15
        const overall = Math.round(
            completeness * 0.35 + timeliness * 0.30 + consistency * 0.20 + anomalyStability * 0.15,
        );

        return {
            overall,
            grade: this.resolveQualityGrade(overall),
            dimensions: {
                completeness,
                timeliness,
                consistency,
                anomalyStability,
            },
        };
    }

    /**
     * 异常稳定性评分（PRD §8.4 第四维度）
     *
     * 检测数值型字段中极端离群值的比例。
     * 返回 0~100 分，极端值越少分数越高。
     */
    private computeAnomalyStabilityScore(
        dataset: StandardDataset,
        rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    ): number {
        if (rows.length < 3) {
            return rows.length === 0 ? 0 : 80;
        }

        const values: number[] = [];
        for (const row of rows) {
            if (dataset === 'SPOT_PRICE') {
                const v = (row as StandardSpotRecord).spotPrice;
                if (Number.isFinite(v)) {
                    values.push(v);
                }
            } else if (dataset === 'FUTURES_QUOTE') {
                const v = (row as StandardFuturesRecord).closePrice;
                if (Number.isFinite(v)) {
                    values.push(v);
                }
            } else {
                const len = (row as StandardEventRecord).title?.trim().length ?? 0;
                values.push(len);
            }
        }

        if (values.length < 3) {
            return 80;
        }

        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;

        if (iqr === 0) {
            return 100;
        }

        const lowerBound = q1 - 3 * iqr;
        const upperBound = q3 + 3 * iqr;
        let outlierCount = 0;
        for (const v of values) {
            if (v < lowerBound || v > upperBound) {
                outlierCount += 1;
            }
        }

        const outlierRate = outlierCount / values.length;
        return Math.round(Math.max(0, Math.min(100, (1 - outlierRate * 10) * 100)));
    }

    private computeCompletenessScore(
        dataset: StandardDataset,
        rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    ): number {
        if (rows.length === 0) {
            return 0;
        }

        const requiredFieldsByDataset: Record<StandardDataset, string[]> = {
            SPOT_PRICE: ['recordId', 'commodityCode', 'regionCode', 'dataTime', 'sourceRecordId'],
            FUTURES_QUOTE: ['recordId', 'contractCode', 'exchangeCode', 'dataTime', 'sourceRecordId'],
            MARKET_EVENT: ['recordId', 'eventType', 'title', 'publishedAt', 'sourceRecordId'],
        };
        const requiredFields = requiredFieldsByDataset[dataset];
        const totalRequired = rows.length * requiredFields.length;
        if (totalRequired === 0) {
            return 0;
        }

        let presentCount = 0;
        for (const row of rows as Array<Record<string, unknown>>) {
            for (const field of requiredFields) {
                const value = row[field];
                if (typeof value === 'string') {
                    if (value.trim().length > 0) {
                        presentCount += 1;
                    }
                    continue;
                }
                if (value !== null && value !== undefined) {
                    presentCount += 1;
                }
            }
        }

        return Math.round((presentCount / totalRequired) * 100);
    }

    private computeConsistencyScore(
        dataset: StandardDataset,
        rows: Array<StandardSpotRecord | StandardFuturesRecord | StandardEventRecord>,
    ): number {
        if (rows.length === 0) {
            return 0;
        }

        let validCount = 0;
        for (const row of rows) {
            if (dataset === 'SPOT_PRICE') {
                const spot = row as StandardSpotRecord;
                if (Number.isFinite(spot.spotPrice) && !!this.extractRecordTime(spot, dataset)) {
                    validCount += 1;
                }
                continue;
            }

            if (dataset === 'FUTURES_QUOTE') {
                const futures = row as StandardFuturesRecord;
                if (Number.isFinite(futures.closePrice) && !!this.extractRecordTime(futures, dataset)) {
                    validCount += 1;
                }
                continue;
            }

            const event = row as StandardEventRecord;
            if (event.title.trim().length > 0 && !!this.extractRecordTime(event, dataset)) {
                validCount += 1;
            }
        }

        return Math.round((validCount / rows.length) * 100);
    }

    private computeTimelinessScore(
        dataLagMinutes: number | undefined,
        ttlMinutes: number,
        count: number,
    ) {
        if (count === 0 || dataLagMinutes === undefined) {
            return 0;
        }

        if (dataLagMinutes <= ttlMinutes) {
            return 100;
        }
        if (dataLagMinutes <= ttlMinutes * 2) {
            return 70;
        }
        if (dataLagMinutes <= ttlMinutes * 4) {
            return 40;
        }
        return 10;
    }

    private resolveQualityGrade(score: number): StandardizedDataQualityScore['grade'] {
        if (score >= 90) {
            return 'A';
        }
        if (score >= 75) {
            return 'B';
        }
        if (score >= 60) {
            return 'C';
        }
        return 'D';
    }

    private extractRecordTime(
        row: StandardSpotRecord | StandardFuturesRecord | StandardEventRecord,
        dataset: StandardDataset,
    ): Date | undefined {
        const raw =
            dataset === 'MARKET_EVENT'
                ? (row as StandardEventRecord).publishedAt
                : (row as StandardSpotRecord | StandardFuturesRecord).dataTime;
        if (!raw) {
            return undefined;
        }
        const parsed = new Date(raw);
        if (!Number.isFinite(parsed.getTime())) {
            return undefined;
        }
        return parsed;
    }

    private getDatasetFreshnessTtlMinutes(dataset: StandardDataset): number {
        if (dataset === 'FUTURES_QUOTE') {
            return 30;
        }
        if (dataset === 'SPOT_PRICE') {
            return 24 * 60;
        }
        return 6 * 60;
    }
}
