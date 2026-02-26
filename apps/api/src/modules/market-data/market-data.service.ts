import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReconciliationJobDto,
  LineageDataset,
  ReconciliationDataset,
  ReconciliationSummaryDto,
  StandardEventRecord,
  StandardFuturesRecord,
  StandardSpotRecord,
  StandardizationPreviewDto,
} from '@packages/types';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma';

type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';
type AggregateOp = 'sum' | 'avg' | 'min' | 'max' | 'count';

interface MarketDataAggregateMetricInput {
  field: string;
  op: AggregateOp;
  as?: string;
}

interface StandardizedQueryOptions {
  from?: Date;
  to?: Date;
  filters?: Record<string, unknown>;
  limit?: number;
}

interface ReconciliationJob {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  dataset: ReconciliationDataset;
  createdByUserId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: ReconciliationSummaryDto;
  sampleDiffs?: Array<Record<string, unknown>>;
  error?: string;
}

interface PersistedReconciliationJobRow {
  jobId: string;
  status: string;
  dataset: string;
  createdByUserId: string;
  createdAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  summary: unknown;
  errorMessage: string | null;
}

interface PersistedReconciliationDiffRow {
  payload: unknown;
}

const COMMODITY_CODE_MAP: Record<string, string> = {
  玉米: 'CORN',
  豆粕: 'SOY_MEAL',
  大豆: 'SOYBEAN',
  小麦: 'WHEAT',
};

const MARKET_INTEL_EVENT_TYPE_MAP: Record<string, string> = {
  DAILY_REPORT: 'REPORT',
  RESEARCH_REPORT: 'REPORT',
  POLICY: 'POLICY',
  NEWS: 'NEWS',
};

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly reconciliationJobs = new Map<string, ReconciliationJob>();
  private reconciliationPersistenceUnavailable = false;

  constructor(private readonly prisma: PrismaService) {}

  async previewStandardization(dto: StandardizationPreviewDto) {
    if (dto.dataset === 'PRICE_DATA') {
      const rows = await this.querySpot(dto.filters, dto.sampleLimit);
      return {
        dataset: dto.dataset,
        mappingVersion: dto.mappingVersion,
        previewRows: rows.map((row) => ({
          legacy: {
            id: row.recordId,
            commodity: row.commodityCode,
            regionCode: row.regionCode,
            price: row.spotPrice,
            effectiveDate: row.dataTime,
          },
          standard: row,
          issues: this.validateStandardSpotRecord(row),
        })),
        issues: rows.flatMap((row) =>
          this.validateStandardSpotRecord(row).map((issue) => ({ recordId: row.recordId, issue })),
        ),
        generatedAt: new Date().toISOString(),
      };
    }

    if (dto.dataset === 'FUTURES_QUOTE_SNAPSHOT') {
      const rows = await this.queryFutures(dto.filters, dto.sampleLimit);
      return {
        dataset: dto.dataset,
        mappingVersion: dto.mappingVersion,
        previewRows: rows.map((row) => ({
          legacy: {
            id: row.recordId,
            contractCode: row.contractCode,
            exchange: row.exchangeCode,
            closePrice: row.closePrice,
            snapshotAt: row.dataTime,
          },
          standard: row,
          issues: this.validateStandardFuturesRecord(row),
        })),
        issues: rows.flatMap((row) =>
          this.validateStandardFuturesRecord(row).map((issue) => ({
            recordId: row.recordId,
            issue,
          })),
        ),
        generatedAt: new Date().toISOString(),
      };
    }

    const rows = await this.queryMarketEvent(dto.filters, dto.sampleLimit);
    return {
      dataset: dto.dataset,
      mappingVersion: dto.mappingVersion,
      previewRows: rows.map((row) => ({
        legacy: {
          id: row.recordId,
          title: row.title,
          summary: row.summary,
          publishedAt: row.publishedAt,
        },
        standard: row,
        issues: this.validateStandardEventRecord(row),
      })),
      issues: rows.flatMap((row) =>
        this.validateStandardEventRecord(row).map((issue) => ({ recordId: row.recordId, issue })),
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  async getLineage(dataset: LineageDataset, recordId: string) {
    if (dataset === 'SPOT_PRICE') {
      const record = await this.prisma.priceData.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          sourceType: true,
          intelId: true,
          knowledgeId: true,
          submissionId: true,
          effectiveDate: true,
          updatedAt: true,
        },
      });
      if (!record) {
        throw new NotFoundException('spot price record not found');
      }

      return {
        dataset,
        recordId,
        source: {
          sourceType: String(record.sourceType),
          sourceRecordId: record.id,
          intelId: record.intelId,
          knowledgeId: record.knowledgeId,
          submissionId: record.submissionId,
        },
        mapping: {
          mappingVersion: 'v1',
          ruleSetId: 'price_data_mapping_v1',
        },
        derivedMetrics: ['MKT_SPOT_AVG_7D', 'MKT_SPOT_PCT_CHG_7D', 'BASIS_MAIN'],
        timestamps: {
          dataTime: record.effectiveDate.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        },
      };
    }

    if (dataset === 'FUTURES_QUOTE') {
      const record = await this.prisma.futuresQuoteSnapshot.findUnique({
        where: { id: recordId },
        select: {
          id: true,
          exchange: true,
          contractCode: true,
          snapshotAt: true,
          createdAt: true,
        },
      });
      if (!record) {
        throw new NotFoundException('futures quote record not found');
      }

      return {
        dataset,
        recordId,
        source: {
          sourceType: 'FUTURES_API',
          sourceRecordId: record.id,
          exchange: record.exchange,
          contractCode: record.contractCode,
        },
        mapping: {
          mappingVersion: 'v1',
          ruleSetId: 'futures_quote_mapping_v1',
        },
        derivedMetrics: ['FUT_CLOSE_PCT_CHG_1D', 'VOLATILITY_20D'],
        timestamps: {
          dataTime: record.snapshotAt.toISOString(),
          updatedAt: record.createdAt.toISOString(),
        },
      };
    }

    const event = await this.prisma.marketEvent.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        intelId: true,
        knowledgeId: true,
        eventTypeId: true,
        eventDate: true,
        createdAt: true,
      },
    });

    if (event) {
      return {
        dataset,
        recordId,
        source: {
          sourceType: 'MARKET_EVENT',
          sourceRecordId: event.id,
          intelId: event.intelId,
          knowledgeId: event.knowledgeId,
          eventTypeId: event.eventTypeId,
        },
        mapping: {
          mappingVersion: 'v1',
          ruleSetId: 'market_event_mapping_v1',
        },
        derivedMetrics: ['SUPPLY_STRESS_IDX', 'ALERT_SEVERITY'],
        timestamps: {
          dataTime: event.eventDate?.toISOString() ?? event.createdAt.toISOString(),
          updatedAt: event.createdAt.toISOString(),
        },
      };
    }

    const intel = await this.prisma.marketIntel.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        sourceType: true,
        effectiveTime: true,
        updatedAt: true,
      },
    });

    if (!intel) {
      throw new NotFoundException('market event/intel record not found');
    }

    return {
      dataset,
      recordId,
      source: {
        sourceType: String(intel.sourceType),
        sourceRecordId: intel.id,
      },
      mapping: {
        mappingVersion: 'v1',
        ruleSetId: 'market_intel_mapping_v1',
      },
      derivedMetrics: ['SUPPLY_STRESS_IDX', 'ALERT_SEVERITY'],
      timestamps: {
        dataTime: intel.effectiveTime.toISOString(),
        updatedAt: intel.updatedAt.toISOString(),
      },
    };
  }

  async createReconciliationJob(userId: string, dto: CreateReconciliationJobDto) {
    const jobId = randomUUID();
    const job: ReconciliationJob = {
      jobId,
      status: 'PENDING',
      dataset: dto.dataset,
      createdByUserId: userId,
      createdAt: new Date().toISOString(),
    };

    this.reconciliationJobs.set(jobId, job);
    await this.persistReconciliationJobSnapshot(job, dto);

    try {
      job.status = 'RUNNING';
      job.startedAt = new Date().toISOString();
      await this.persistReconciliationJobSnapshot(job, dto);

      const summary = await this.runReconciliation(dto);
      job.summary = summary.summary;
      job.sampleDiffs = summary.sampleDiffs;
      job.status = 'DONE';
      job.finishedAt = new Date().toISOString();
      await this.persistReconciliationJobSnapshot(job, dto);
      await this.replacePersistedReconciliationDiffs(job.jobId, summary.sampleDiffs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation job ${jobId} failed: ${message}`);
      job.status = 'FAILED';
      job.error = message;
      job.finishedAt = new Date().toISOString();
      await this.persistReconciliationJobSnapshot(job, dto);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      createdAt: job.createdAt,
    };
  }

  async getReconciliationJob(userId: string, jobId: string) {
    const persisted = await this.findPersistedReconciliationJob(jobId);
    if (persisted) {
      if (persisted.createdByUserId !== userId) {
        throw new ForbiddenException('no permission to access this job');
      }

      return {
        jobId: persisted.jobId,
        status: persisted.status,
        dataset: persisted.dataset,
        createdAt: persisted.createdAt,
        startedAt: persisted.startedAt,
        finishedAt: persisted.finishedAt,
        summary: persisted.summary,
        sampleDiffs: persisted.sampleDiffs,
        error: persisted.error,
        storage: 'database',
      };
    }

    const job = this.reconciliationJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('reconciliation job not found');
    }
    if (job.createdByUserId !== userId) {
      throw new ForbiddenException('no permission to access this job');
    }

    return {
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      summary: job.summary,
      sampleDiffs: job.sampleDiffs ?? [],
      error: job.error,
      storage: 'in-memory',
    };
  }

  async queryStandardizedData(dataset: StandardDataset, options: StandardizedQueryOptions) {
    const limit = options.limit ?? 100;

    if (dataset === 'SPOT_PRICE') {
      const rows = await this.querySpot(options.filters, limit, options.from, options.to);
      return {
        dataset,
        rows,
        meta: this.buildMeta(rows.length),
      };
    }

    if (dataset === 'FUTURES_QUOTE') {
      const rows = await this.queryFutures(options.filters, limit, options.from, options.to);
      return {
        dataset,
        rows,
        meta: this.buildMeta(rows.length),
      };
    }

    const rows = await this.queryMarketEvent(options.filters, limit, options.from, options.to);
    return {
      dataset,
      rows,
      meta: this.buildMeta(rows.length),
    };
  }

  async aggregateStandardizedData(
    dataset: StandardDataset,
    options: StandardizedQueryOptions,
    groupBy: string[],
    metrics: MarketDataAggregateMetricInput[],
  ) {
    const queried = await this.queryStandardizedData(dataset, options);
    const rows = queried.rows as Array<Record<string, unknown>>;

    const grouped = new Map<
      string,
      {
        group: Record<string, unknown>;
        rows: Array<Record<string, unknown>>;
      }
    >();

    for (const row of rows) {
      const group: Record<string, unknown> = {};
      for (const field of groupBy) {
        group[field] = row[field] ?? null;
      }
      const key = JSON.stringify(group);
      const existing = grouped.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        grouped.set(key, { group, rows: [row] });
      }
    }

    const aggregateRows = Array.from(grouped.values()).map((entry) => {
      const aggregate: Record<string, unknown> = {
        ...entry.group,
      };

      for (const metric of metrics) {
        const metricName = metric.as?.trim() || `${metric.op}_${metric.field}`;
        aggregate[metricName] = this.computeMetric(entry.rows, metric.field, metric.op);
      }

      return aggregate;
    });

    return {
      dataset,
      rows: aggregateRows,
      meta: {
        ...queried.meta,
        groupCount: aggregateRows.length,
        metricCount: metrics.length,
      },
    };
  }

  private computeMetric(rows: Array<Record<string, unknown>>, field: string, op: AggregateOp) {
    const values = rows
      .map((row) => row[field])
      .filter((value) => value !== null && value !== undefined);

    if (op === 'count') {
      return values.length;
    }

    const numericValues = values
      .map((value) => (typeof value === 'number' ? value : Number(value)))
      .filter((value) => Number.isFinite(value));

    if (numericValues.length === 0) {
      return null;
    }

    if (op === 'sum') {
      return numericValues.reduce((sum, value) => sum + value, 0);
    }

    if (op === 'avg') {
      const sum = numericValues.reduce((total, value) => total + value, 0);
      return sum / numericValues.length;
    }

    if (op === 'min') {
      return Math.min(...numericValues);
    }

    return Math.max(...numericValues);
  }

  private async runReconciliation(dto: CreateReconciliationJobDto): Promise<{
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

  private calculateReconciliationSummary<T>(
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

  private async querySpot(
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

  private async queryFutures(
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

  private async queryMarketEvent(
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

  private validateStandardSpotRecord(row: StandardSpotRecord): string[] {
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

  private validateStandardFuturesRecord(row: StandardFuturesRecord): string[] {
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

  private validateStandardEventRecord(row: StandardEventRecord): string[] {
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

  private normalizeCommodityCode(rawCommodity: string): string {
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

  private resolveCommodityCandidates(input: string): string[] {
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

  private normalizeRegionCode(
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

  private getFilterString(filters: Record<string, unknown> | undefined, keys: string[]) {
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

  private getFilterDate(filters: Record<string, unknown> | undefined, keys: string[]) {
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

  private buildMeta(recordCount: number) {
    return {
      recordCount,
      mappingVersion: 'v1',
      fetchedAt: new Date().toISOString(),
    };
  }
}
