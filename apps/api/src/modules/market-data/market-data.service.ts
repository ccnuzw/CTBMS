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
type ReconciliationJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
type ReconciliationListSortBy = 'createdAt' | 'startedAt' | 'finishedAt' | 'status' | 'dataset';
type ReconciliationListSortOrder = 'asc' | 'desc';
type AggregateOp = 'sum' | 'avg' | 'min' | 'max' | 'count';

interface ListReconciliationJobsQueryInput {
  page?: number;
  pageSize?: number;
  dataset?: ReconciliationDataset;
  status?: ReconciliationJobStatus;
  pass?: boolean;
  createdAtFrom?: string;
  createdAtTo?: string;
  sortBy?: ReconciliationListSortBy;
  sortOrder?: ReconciliationListSortOrder;
}

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
  status: ReconciliationJobStatus;
  dataset: ReconciliationDataset;
  retriedFromJobId?: string;
  retryCount: number;
  createdByUserId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  summaryPass?: boolean;
  summary?: ReconciliationSummaryDto;
  sampleDiffs?: Array<Record<string, unknown>>;
  request?: CreateReconciliationJobDto;
  error?: string;
}

interface PersistedReconciliationJobRow {
  jobId: string;
  status: string;
  dataset: string;
  retriedFromJobId: string | null;
  retryCount: unknown;
  createdByUserId: string;
  createdAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  cancelledAt: unknown;
  cancelReason: string | null;
  summary: unknown;
  summaryPass: unknown;
  errorMessage: string | null;
}

interface PersistedReconciliationDiffRow {
  payload: unknown;
}

interface PersistedReconciliationGateRow {
  jobId: string;
  status: string;
  retriedFromJobId: string | null;
  retryCount: unknown;
  summaryPass: unknown;
  createdAt: unknown;
  finishedAt: unknown;
  cancelledAt: unknown;
  dimensions: unknown;
}

interface PersistedReconciliationJobRetryRow {
  createdByUserId: string;
  status: string;
  dataset: string;
  retryCount: unknown;
  timeRangeFrom: unknown;
  timeRangeTo: unknown;
  dimensions: unknown;
  threshold: unknown;
}

interface ReconciliationJobListResult {
  items: Array<{
    jobId: string;
    status: ReconciliationJobStatus;
    dataset: ReconciliationDataset;
    retriedFromJobId: string | null;
    retryCount: number;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    cancelledAt?: string;
    cancelReason?: string;
    summaryPass?: boolean;
    summary?: ReconciliationSummaryDto;
    error?: string;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  storage: 'database' | 'in-memory';
}

interface ReconciliationGateSnapshot {
  jobId: string;
  status: ReconciliationJobStatus;
  retriedFromJobId: string | null;
  retryCount: number;
  summaryPass?: boolean;
  createdAt: string;
  finishedAt?: string;
  cancelledAt?: string;
  dimensions?: Record<string, unknown>;
  source: 'database' | 'in-memory';
}

const RECONCILIATION_SORT_COLUMN_MAP: Record<ReconciliationListSortBy, string> = {
  createdAt: '"createdAt"',
  startedAt: '"startedAt"',
  finishedAt: '"finishedAt"',
  status: '"status"',
  dataset: '"dataset"',
};

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

  async createReconciliationJob(
    userId: string,
    dto: CreateReconciliationJobDto,
    options?: {
      retriedFromJobId?: string;
      retryCount?: number;
    },
  ) {
    const jobId = randomUUID();
    const job: ReconciliationJob = {
      jobId,
      status: 'PENDING',
      dataset: dto.dataset,
      retriedFromJobId: options?.retriedFromJobId,
      retryCount: this.parseRetryCount(options?.retryCount),
      createdByUserId: userId,
      createdAt: new Date().toISOString(),
      request: this.cloneReconciliationRequest(dto),
    };

    this.reconciliationJobs.set(jobId, job);
    await this.persistReconciliationJobSnapshot(job, dto);

    try {
      job.status = 'RUNNING';
      job.startedAt = new Date().toISOString();
      await this.persistReconciliationJobSnapshot(job, dto);

      const summary = await this.runReconciliation(dto);
      job.summary = summary.summary;
      job.summaryPass = this.resolveSummaryPass(job.summary);
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
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: this.parseRetryCount(job.retryCount),
      createdAt: job.createdAt,
    };
  }

  async retryReconciliationJob(userId: string, jobId: string) {
    let retryRequest: CreateReconciliationJobDto | undefined;
    let sourceStatus: ReconciliationJobStatus | undefined;
    let sourceRetryCount = 0;

    const persistedSource = await this.findPersistedReconciliationJobForRetry(jobId);
    if (persistedSource) {
      if (persistedSource.createdByUserId !== userId) {
        throw new ForbiddenException('no permission to retry this job');
      }
      retryRequest = persistedSource.request;
      sourceStatus = persistedSource.status;
      sourceRetryCount = persistedSource.retryCount;
    } else {
      const inMemoryJob = this.reconciliationJobs.get(jobId);
      if (!inMemoryJob) {
        throw new NotFoundException('reconciliation job not found');
      }
      if (inMemoryJob.createdByUserId !== userId) {
        throw new ForbiddenException('no permission to retry this job');
      }
      retryRequest = inMemoryJob.request;
      sourceStatus = inMemoryJob.status;
      sourceRetryCount = this.parseRetryCount(inMemoryJob.retryCount);
    }

    if (!retryRequest) {
      throw new BadRequestException('source reconciliation job payload unavailable');
    }
    if (!sourceStatus || !['DONE', 'FAILED', 'CANCELLED'].includes(sourceStatus)) {
      throw new BadRequestException('can only retry DONE/FAILED/CANCELLED reconciliation jobs');
    }

    const retried = await this.createReconciliationJob(userId, retryRequest, {
      retriedFromJobId: jobId,
      retryCount: sourceRetryCount + 1,
    });
    return {
      ...retried,
    };
  }

  async cancelReconciliationJob(userId: string, jobId: string, reason?: string) {
    const normalizedReason = reason?.trim() || 'manual_cancel';

    const persisted = await this.findPersistedReconciliationJob(jobId);
    if (persisted) {
      if (persisted.createdByUserId !== userId) {
        throw new ForbiddenException('no permission to cancel this job');
      }

      if (!['PENDING', 'RUNNING'].includes(persisted.status)) {
        throw new BadRequestException('can only cancel PENDING/RUNNING reconciliation jobs');
      }

      const cancelledAt = new Date().toISOString();
      persisted.status = 'CANCELLED';
      persisted.cancelledAt = cancelledAt;
      persisted.cancelReason = normalizedReason;
      persisted.finishedAt = cancelledAt;
      await this.persistReconciliationJobSnapshot(persisted);

      return {
        jobId: persisted.jobId,
        status: persisted.status,
        dataset: persisted.dataset,
        retriedFromJobId: persisted.retriedFromJobId ?? null,
        retryCount: this.parseRetryCount(persisted.retryCount),
        cancelledAt: persisted.cancelledAt,
        cancelReason: persisted.cancelReason,
      };
    }

    const job = this.reconciliationJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('reconciliation job not found');
    }
    if (job.createdByUserId !== userId) {
      throw new ForbiddenException('no permission to cancel this job');
    }

    if (!['PENDING', 'RUNNING'].includes(job.status)) {
      throw new BadRequestException('can only cancel PENDING/RUNNING reconciliation jobs');
    }

    const cancelledAt = new Date().toISOString();
    job.status = 'CANCELLED';
    job.cancelledAt = cancelledAt;
    job.cancelReason = normalizedReason;
    job.finishedAt = cancelledAt;
    await this.persistReconciliationJobSnapshot(job, job.request);

    return {
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: this.parseRetryCount(job.retryCount),
      cancelledAt: job.cancelledAt,
      cancelReason: job.cancelReason,
    };
  }

  async listReconciliationJobs(userId: string, query: ListReconciliationJobsQueryInput) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const dataset = query.dataset;
    const status = query.status;
    const pass = query.pass;
    const createdAtFrom = this.parseOptionalDate(query.createdAtFrom);
    const createdAtTo = this.parseOptionalDate(query.createdAtTo);
    const sortBy = this.normalizeReconciliationSortBy(query.sortBy);
    const sortOrder = this.normalizeReconciliationSortOrder(query.sortOrder);

    if (createdAtFrom && createdAtTo && createdAtFrom.getTime() > createdAtTo.getTime()) {
      throw new BadRequestException('createdAtFrom must be <= createdAtTo');
    }

    const persisted = await this.listPersistedReconciliationJobs(userId, page, pageSize, {
      dataset,
      status,
      pass,
      createdAtFrom,
      createdAtTo,
      sortBy,
      sortOrder,
    });
    if (persisted) {
      return persisted;
    }

    const filteredJobs = Array.from(this.reconciliationJobs.values())
      .filter((job) => job.createdByUserId === userId)
      .filter((job) => (!dataset ? true : job.dataset === dataset))
      .filter((job) => (!status ? true : job.status === status))
      .filter((job) =>
        pass === undefined ? true : this.resolveSummaryPass(job.summary, job.summaryPass) === pass,
      )
      .filter((job) => {
        const createdAtMs = Date.parse(job.createdAt);
        if (!Number.isFinite(createdAtMs)) {
          return false;
        }
        if (createdAtFrom && createdAtMs < createdAtFrom.getTime()) {
          return false;
        }
        if (createdAtTo && createdAtMs > createdAtTo.getTime()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => this.compareReconciliationJobs(a, b, sortBy, sortOrder));

    const total = filteredJobs.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;
    const items = filteredJobs.slice(start, start + pageSize).map((job) => ({
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: this.parseRetryCount(job.retryCount),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      cancelledAt: job.cancelledAt,
      cancelReason: job.cancelReason,
      summaryPass: this.resolveSummaryPass(job.summary, job.summaryPass),
      summary: job.summary,
      error: job.error,
    }));

    return {
      items,
      page,
      pageSize,
      total,
      totalPages,
      storage: 'in-memory' as const,
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
        retriedFromJobId: persisted.retriedFromJobId ?? null,
        retryCount: this.parseRetryCount(persisted.retryCount),
        createdAt: persisted.createdAt,
        startedAt: persisted.startedAt,
        finishedAt: persisted.finishedAt,
        cancelledAt: persisted.cancelledAt,
        cancelReason: persisted.cancelReason,
        summaryPass: this.resolveSummaryPass(persisted.summary, persisted.summaryPass),
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
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: this.parseRetryCount(job.retryCount),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      cancelledAt: job.cancelledAt,
      cancelReason: job.cancelReason,
      summaryPass: this.resolveSummaryPass(job.summary, job.summaryPass),
      summary: job.summary,
      sampleDiffs: job.sampleDiffs ?? [],
      error: job.error,
      storage: 'in-memory',
    };
  }

  async getLatestReconciliationSnapshot(
    dataset: StandardDataset,
    filters?: Record<string, unknown>,
  ): Promise<ReconciliationGateSnapshot | null> {
    const normalizedDimensions = this.normalizeReconciliationGateDimensions(dataset, filters);

    const persisted = await this.findLatestPersistedReconciliationForGate(
      dataset,
      normalizedDimensions,
    );
    if (persisted) {
      return persisted;
    }

    const inMemoryCandidate = Array.from(this.reconciliationJobs.values())
      .filter((job) => job.dataset === dataset)
      .filter((job) =>
        this.matchesReconciliationGateDimensions(job.request?.dimensions, normalizedDimensions),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!inMemoryCandidate) {
      return null;
    }

    return {
      jobId: inMemoryCandidate.jobId,
      status: inMemoryCandidate.status,
      retriedFromJobId: inMemoryCandidate.retriedFromJobId ?? null,
      retryCount: this.parseRetryCount(inMemoryCandidate.retryCount),
      summaryPass: this.resolveSummaryPass(
        inMemoryCandidate.summary,
        inMemoryCandidate.summaryPass,
      ),
      createdAt: inMemoryCandidate.createdAt,
      finishedAt: inMemoryCandidate.finishedAt,
      cancelledAt: inMemoryCandidate.cancelledAt,
      dimensions: this.extractScalarDimensions(inMemoryCandidate.request?.dimensions),
      source: 'in-memory',
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

  private async persistReconciliationJobSnapshot(
    job: ReconciliationJob,
    dto?: CreateReconciliationJobDto,
  ) {
    if (this.reconciliationPersistenceUnavailable) {
      return;
    }

    const timeRangeFrom = dto?.timeRange?.from ? new Date(dto.timeRange.from) : null;
    const timeRangeTo = dto?.timeRange?.to ? new Date(dto.timeRange.to) : null;

    const safeFrom =
      timeRangeFrom && Number.isFinite(timeRangeFrom.getTime())
        ? timeRangeFrom
        : (null as Date | null);
    const safeTo =
      timeRangeTo && Number.isFinite(timeRangeTo.getTime()) ? timeRangeTo : (null as Date | null);

    const dimensions = dto?.dimensions ? JSON.stringify(dto.dimensions) : null;
    const threshold = dto?.threshold ? JSON.stringify(dto.threshold) : null;
    const summary = job.summary ? JSON.stringify(job.summary) : null;
    const summaryPass = this.resolveSummaryPass(job.summary, job.summaryPass) ?? null;
    const retriedFromJobId = job.retriedFromJobId ?? null;
    const retryCount = this.parseRetryCount(job.retryCount);
    const cancelledAt = job.cancelledAt ? new Date(job.cancelledAt) : null;
    const safeCancelledAt =
      cancelledAt && Number.isFinite(cancelledAt.getTime()) ? cancelledAt : (null as Date | null);
    const cancelReason = job.cancelReason?.trim() || null;

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationJob"
          ("id", "jobId", "status", "dataset", "retriedFromJobId", "retryCount", "timeRangeFrom", "timeRangeTo", "dimensions", "threshold", "summary", "summaryPass", "errorMessage", "createdByUserId", "createdAt", "startedAt", "finishedAt", "cancelledAt", "cancelReason", "updatedAt")
         VALUES
          ($1, $2, $3::"ReconcileJobStatus", $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT ("jobId") DO UPDATE SET
          "status" = EXCLUDED."status",
          "dataset" = EXCLUDED."dataset",
          "retriedFromJobId" = EXCLUDED."retriedFromJobId",
          "retryCount" = EXCLUDED."retryCount",
          "timeRangeFrom" = COALESCE(EXCLUDED."timeRangeFrom", "DataReconciliationJob"."timeRangeFrom"),
          "timeRangeTo" = COALESCE(EXCLUDED."timeRangeTo", "DataReconciliationJob"."timeRangeTo"),
          "dimensions" = COALESCE(EXCLUDED."dimensions", "DataReconciliationJob"."dimensions"),
          "threshold" = COALESCE(EXCLUDED."threshold", "DataReconciliationJob"."threshold"),
          "summary" = EXCLUDED."summary",
          "summaryPass" = EXCLUDED."summaryPass",
          "errorMessage" = EXCLUDED."errorMessage",
          "startedAt" = EXCLUDED."startedAt",
          "finishedAt" = EXCLUDED."finishedAt",
          "cancelledAt" = EXCLUDED."cancelledAt",
          "cancelReason" = EXCLUDED."cancelReason",
          "updatedAt" = EXCLUDED."updatedAt"`,
        job.jobId,
        job.jobId,
        job.status,
        job.dataset,
        retriedFromJobId,
        retryCount,
        safeFrom,
        safeTo,
        dimensions,
        threshold,
        summary,
        summaryPass,
        job.error ?? null,
        job.createdByUserId,
        new Date(job.createdAt),
        job.startedAt ? new Date(job.startedAt) : null,
        job.finishedAt ? new Date(job.finishedAt) : null,
        safeCancelledAt,
        cancelReason,
        new Date(),
      );
    } catch (error) {
      if (this.isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('persist snapshot', error);
        return;
      }
      this.logger.error(
        `Persist reconciliation snapshot failed for job ${job.jobId}: ${this.stringifyError(error)}`,
      );
    }
  }

  private async replacePersistedReconciliationDiffs(
    jobId: string,
    sampleDiffs: Array<Record<string, unknown>>,
  ) {
    if (this.reconciliationPersistenceUnavailable) {
      return;
    }

    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "DataReconciliationDiff" WHERE "jobId" = $1`,
        jobId,
      );

      for (const diff of sampleDiffs) {
        const diffType = typeof diff.diffType === 'string' ? diff.diffType : null;
        const businessKey = typeof diff.businessKey === 'string' ? diff.businessKey : null;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "DataReconciliationDiff"
            ("id", "jobId", "diffType", "businessKey", "payload", "createdAt")
           VALUES
            ($1, $2, $3, $4, $5::jsonb, $6)`,
          randomUUID(),
          jobId,
          diffType,
          businessKey,
          JSON.stringify(diff),
          new Date(),
        );
      }
    } catch (error) {
      if (this.isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('persist diffs', error);
        return;
      }
      this.logger.error(
        `Persist reconciliation diffs failed for job ${jobId}: ${this.stringifyError(error)}`,
      );
    }
  }

  private async listPersistedReconciliationJobs(
    userId: string,
    page: number,
    pageSize: number,
    options: {
      dataset?: ReconciliationDataset;
      status?: ReconciliationJobStatus;
      pass?: boolean;
      createdAtFrom?: Date;
      createdAtTo?: Date;
      sortBy: ReconciliationListSortBy;
      sortOrder: ReconciliationListSortOrder;
    },
  ): Promise<ReconciliationJobListResult | null> {
    if (this.reconciliationPersistenceUnavailable) {
      return null;
    }

    try {
      const { dataset, status, pass, createdAtFrom, createdAtTo, sortBy, sortOrder } = options;
      const whereParts: string[] = ['"createdByUserId" = $1'];
      const whereParams: unknown[] = [userId];

      if (dataset) {
        whereParts.push(`"dataset" = $${whereParams.length + 1}`);
        whereParams.push(dataset);
      }
      if (status) {
        whereParts.push(`"status" = $${whereParams.length + 1}::"ReconcileJobStatus"`);
        whereParams.push(status);
      }
      if (pass !== undefined) {
        whereParts.push(`"summaryPass" = $${whereParams.length + 1}`);
        whereParams.push(pass);
      }
      if (createdAtFrom) {
        whereParts.push(`"createdAt" >= $${whereParams.length + 1}`);
        whereParams.push(createdAtFrom);
      }
      if (createdAtTo) {
        whereParts.push(`"createdAt" <= $${whereParams.length + 1}`);
        whereParams.push(createdAtTo);
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const orderByColumn = RECONCILIATION_SORT_COLUMN_MAP[sortBy];
      const orderByDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';

      const totalRows = await this.prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
        `SELECT COUNT(*)::int AS "total"
         FROM "DataReconciliationJob"
         ${whereClause}`,
        ...whereParams,
      );

      const total = Number(totalRows[0]?.total ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationJobRow[]>(
        `SELECT
           "jobId",
           "status",
           "dataset",
           "retriedFromJobId",
           "retryCount",
           "createdByUserId",
           "createdAt",
           "startedAt",
           "finishedAt",
           "cancelledAt",
           "cancelReason",
           "summary",
           "summaryPass",
           "errorMessage"
         FROM "DataReconciliationJob"
         ${whereClause}
         ORDER BY ${orderByColumn} ${orderByDirection}, "createdAt" DESC, "jobId" DESC
         LIMIT $${whereParams.length + 1}
         OFFSET $${whereParams.length + 2}`,
        ...whereParams,
        pageSize,
        offset,
      );

      const items = rows.map((row) => {
        const summary = this.parseJsonValue<ReconciliationSummaryDto>(row.summary);
        return {
          jobId: row.jobId,
          status: this.normalizeReconciliationStatus(row.status),
          dataset: this.normalizeReconciliationDataset(row.dataset),
          retriedFromJobId: row.retriedFromJobId ?? null,
          retryCount: this.parseRetryCount(row.retryCount),
          createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
          startedAt: this.toIsoString(row.startedAt),
          finishedAt: this.toIsoString(row.finishedAt),
          cancelledAt: this.toIsoString(row.cancelledAt),
          cancelReason: row.cancelReason ?? undefined,
          summaryPass: this.resolveSummaryPass(summary, row.summaryPass),
          summary,
          error: row.errorMessage ?? undefined,
        };
      });

      return {
        items,
        page,
        pageSize,
        total,
        totalPages,
        storage: 'database',
      };
    } catch (error) {
      if (this.isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('list persisted jobs', error);
        return null;
      }
      this.logger.error(`List persisted reconciliation jobs failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private async findLatestPersistedReconciliationForGate(
    dataset: StandardDataset,
    normalizedDimensions: Record<string, unknown>,
  ): Promise<ReconciliationGateSnapshot | null> {
    if (this.reconciliationPersistenceUnavailable) {
      return null;
    }

    try {
      const whereParts = ['"dataset" = $1'];
      const whereParams: unknown[] = [dataset];

      if (Object.keys(normalizedDimensions).length > 0) {
        whereParts.push(
          `("dimensions" IS NULL OR "dimensions" @> $${whereParams.length + 1}::jsonb)`,
        );
        whereParams.push(JSON.stringify(normalizedDimensions));
      }

      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationGateRow[]>(
        `SELECT
           "jobId",
           "status",
           "retriedFromJobId",
           "retryCount",
           "summaryPass",
           "createdAt",
           "finishedAt",
           "cancelledAt",
           "dimensions"
         FROM "DataReconciliationJob"
         WHERE ${whereParts.join(' AND ')}
         ORDER BY "createdAt" DESC, "jobId" DESC
         LIMIT 1`,
        ...whereParams,
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        jobId: row.jobId,
        status: this.normalizeReconciliationStatus(row.status),
        retriedFromJobId: row.retriedFromJobId ?? null,
        retryCount: this.parseRetryCount(row.retryCount),
        summaryPass: this.parseOptionalBoolean(row.summaryPass),
        createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
        finishedAt: this.toIsoString(row.finishedAt),
        cancelledAt: this.toIsoString(row.cancelledAt),
        dimensions: this.extractScalarDimensions(
          this.parseJsonValue<Record<string, unknown>>(row.dimensions),
        ),
        source: 'database',
      };
    } catch (error) {
      if (this.isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('read latest reconciliation for gate', error);
        return null;
      }
      this.logger.error(
        `Read latest reconciliation for gate failed: ${this.stringifyError(error)}`,
      );
      return null;
    }
  }

  private async findPersistedReconciliationJob(jobId: string): Promise<ReconciliationJob | null> {
    if (this.reconciliationPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationJobRow[]>(
        `SELECT
           "jobId",
           "status",
           "dataset",
           "retriedFromJobId",
           "retryCount",
           "createdByUserId",
           "createdAt",
           "startedAt",
           "finishedAt",
           "cancelledAt",
           "cancelReason",
           "summary",
           "summaryPass",
           "errorMessage"
         FROM "DataReconciliationJob"
         WHERE "jobId" = $1
         LIMIT 1`,
        jobId,
      );

      if (rows.length === 0) {
        return null;
      }

      const diffRows = await this.prisma.$queryRawUnsafe<PersistedReconciliationDiffRow[]>(
        `SELECT "payload"
         FROM "DataReconciliationDiff"
         WHERE "jobId" = $1
         ORDER BY "createdAt" ASC
         LIMIT 20`,
        jobId,
      );

      const row = rows[0];
      const summary = this.parseJsonValue<ReconciliationSummaryDto>(row.summary);
      return {
        jobId: row.jobId,
        status: this.normalizeReconciliationStatus(row.status),
        dataset: this.normalizeReconciliationDataset(row.dataset),
        retriedFromJobId: row.retriedFromJobId ?? undefined,
        retryCount: this.parseRetryCount(row.retryCount),
        createdByUserId: row.createdByUserId,
        createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
        startedAt: this.toIsoString(row.startedAt),
        finishedAt: this.toIsoString(row.finishedAt),
        cancelledAt: this.toIsoString(row.cancelledAt),
        cancelReason: row.cancelReason ?? undefined,
        summaryPass: this.resolveSummaryPass(summary, row.summaryPass),
        summary,
        sampleDiffs: diffRows
          .map((item) => this.parseJsonValue<Record<string, unknown>>(item.payload))
          .filter((item): item is Record<string, unknown> => !!item),
        error: row.errorMessage ?? undefined,
      };
    } catch (error) {
      if (this.isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('read persisted job', error);
        return null;
      }
      this.logger.error(`Read persisted reconciliation job failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private async findPersistedReconciliationJobForRetry(jobId: string): Promise<{
    createdByUserId: string;
    status: ReconciliationJobStatus;
    retryCount: number;
    request?: CreateReconciliationJobDto;
  } | null> {
    if (this.reconciliationPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationJobRetryRow[]>(
        `SELECT
           "createdByUserId",
           "status",
           "dataset",
           "retryCount",
           "timeRangeFrom",
           "timeRangeTo",
           "dimensions",
           "threshold"
         FROM "DataReconciliationJob"
         WHERE "jobId" = $1
         LIMIT 1`,
        jobId,
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const from = this.toIsoString(row.timeRangeFrom);
      const to = this.toIsoString(row.timeRangeTo);
      const status = this.normalizeReconciliationStatus(row.status);

      if (!from || !to) {
        return {
          createdByUserId: row.createdByUserId,
          status,
          retryCount: this.parseRetryCount(row.retryCount),
          request: undefined,
        };
      }

      const thresholdRaw =
        this.parseJsonValue<{ maxDiffRate?: unknown; maxMissingRate?: unknown }>(row.threshold) ??
        {};

      const request: CreateReconciliationJobDto = {
        dataset: this.normalizeReconciliationDataset(row.dataset),
        timeRange: {
          from,
          to,
        },
        dimensions: this.parseJsonValue<Record<string, unknown>>(row.dimensions) ?? undefined,
        threshold: {
          maxDiffRate: this.parseFiniteNumber(thresholdRaw.maxDiffRate) ?? 0.01,
          maxMissingRate: this.parseFiniteNumber(thresholdRaw.maxMissingRate) ?? 0.005,
        },
      };

      return {
        createdByUserId: row.createdByUserId,
        status,
        retryCount: this.parseRetryCount(row.retryCount),
        request,
      };
    } catch (error) {
      if (this.isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('read persisted retry payload', error);
        return null;
      }
      this.logger.error(
        `Read persisted reconciliation retry payload failed: ${this.stringifyError(error)}`,
      );
      return null;
    }
  }

  private cloneReconciliationRequest(dto: CreateReconciliationJobDto): CreateReconciliationJobDto {
    return JSON.parse(JSON.stringify(dto)) as CreateReconciliationJobDto;
  }

  private resolveSummaryPass(
    summary?: ReconciliationSummaryDto,
    rawSummaryPass?: unknown,
  ): boolean | undefined {
    const parsedSummaryPass = this.parseOptionalBoolean(rawSummaryPass);
    if (parsedSummaryPass !== undefined) {
      return parsedSummaryPass;
    }
    if (summary && typeof summary.pass === 'boolean') {
      return summary.pass;
    }
    return undefined;
  }

  private parseOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return undefined;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }
    return undefined;
  }

  private parseOptionalDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException(`Invalid datetime value: ${value}`);
    }
    return parsed;
  }

  private normalizeReconciliationGateDimensions(
    dataset: StandardDataset,
    filters?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!filters) {
      return {};
    }

    const dimensions: Record<string, unknown> = {};

    if (dataset === 'SPOT_PRICE') {
      const commodityRaw = this.getFilterString(filters, ['commodityCode', 'commodity']);
      if (commodityRaw) {
        dimensions.commodityCode = this.normalizeCommodityCode(commodityRaw);
      }
      const regionCode = this.getFilterString(filters, ['regionCode']);
      if (regionCode) {
        dimensions.regionCode = regionCode;
      }
    }

    if (dataset === 'FUTURES_QUOTE') {
      const contractCode = this.getFilterString(filters, ['contractCode']);
      if (contractCode) {
        dimensions.contractCode = contractCode;
      }
      const exchangeCode = this.getFilterString(filters, ['exchangeCode', 'exchange']);
      if (exchangeCode) {
        dimensions.exchangeCode = exchangeCode;
      }
    }

    if (dataset === 'MARKET_EVENT') {
      const eventType = this.getFilterString(filters, ['eventType']);
      if (eventType) {
        dimensions.eventType = eventType.toUpperCase();
      }
      const contentType = this.getFilterString(filters, ['contentType']);
      if (contentType) {
        dimensions.contentType = contentType.toUpperCase();
      }
    }

    return this.extractScalarDimensions(dimensions) ?? {};
  }

  private matchesReconciliationGateDimensions(
    jobDimensions: Record<string, unknown> | undefined,
    requestedDimensions: Record<string, unknown>,
  ): boolean {
    if (Object.keys(requestedDimensions).length === 0) {
      return true;
    }

    const normalizedJobDimensions = this.extractScalarDimensions(jobDimensions);
    if (!normalizedJobDimensions) {
      return true;
    }

    for (const [key, expectedValue] of Object.entries(requestedDimensions)) {
      const actualValue = normalizedJobDimensions[key];
      if (actualValue === undefined || actualValue === null) {
        continue;
      }
      if (!this.isEquivalentDimensionValue(actualValue, expectedValue)) {
        return false;
      }
    }

    return true;
  }

  private extractScalarDimensions(
    input: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          normalized[key] = trimmed;
        }
        continue;
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        normalized[key] = value;
        continue;
      }

      if (typeof value === 'boolean') {
        normalized[key] = value;
      }
    }

    if (Object.keys(normalized).length === 0) {
      return undefined;
    }

    return normalized;
  }

  private isEquivalentDimensionValue(actualValue: unknown, expectedValue: unknown): boolean {
    if (typeof actualValue === 'string' || typeof expectedValue === 'string') {
      return (
        String(actualValue).trim().toUpperCase() === String(expectedValue).trim().toUpperCase()
      );
    }

    const actualNumber = this.parseFiniteNumber(actualValue);
    const expectedNumber = this.parseFiniteNumber(expectedValue);
    if (actualNumber !== undefined && expectedNumber !== undefined) {
      return actualNumber === expectedNumber;
    }

    if (typeof actualValue === 'boolean' && typeof expectedValue === 'boolean') {
      return actualValue === expectedValue;
    }

    return actualValue === expectedValue;
  }

  private parseFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private parseRetryCount(value: unknown): number {
    const parsed = this.parseFiniteNumber(value);
    if (parsed === undefined) {
      return 0;
    }
    if (parsed <= 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }

  private normalizeReconciliationSortBy(sortBy?: string): ReconciliationListSortBy {
    if (!sortBy) {
      return 'createdAt';
    }
    const candidate = sortBy as ReconciliationListSortBy;
    if (Object.prototype.hasOwnProperty.call(RECONCILIATION_SORT_COLUMN_MAP, candidate)) {
      return candidate;
    }
    return 'createdAt';
  }

  private normalizeReconciliationSortOrder(sortOrder?: string): ReconciliationListSortOrder {
    if (!sortOrder) {
      return 'desc';
    }
    return sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';
  }

  private compareReconciliationJobs(
    a: ReconciliationJob,
    b: ReconciliationJob,
    sortBy: ReconciliationListSortBy,
    sortOrder: ReconciliationListSortOrder,
  ): number {
    const aValue = this.getReconciliationSortValue(a, sortBy);
    const bValue = this.getReconciliationSortValue(b, sortBy);
    const direction = sortOrder === 'asc' ? 1 : -1;
    const tieBreaker =
      sortOrder === 'asc'
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt);

    if (aValue === null && bValue === null) {
      return tieBreaker;
    }
    if (aValue === null) {
      return 1;
    }
    if (bValue === null) {
      return -1;
    }

    if (aValue < bValue) {
      return -1 * direction;
    }
    if (aValue > bValue) {
      return 1 * direction;
    }

    return tieBreaker;
  }

  private getReconciliationSortValue(
    job: ReconciliationJob,
    sortBy: ReconciliationListSortBy,
  ): number | string | null {
    if (sortBy === 'status') {
      return job.status;
    }
    if (sortBy === 'dataset') {
      return job.dataset;
    }

    const value =
      sortBy === 'createdAt'
        ? job.createdAt
        : sortBy === 'startedAt'
          ? job.startedAt
          : job.finishedAt;
    if (!value) {
      return null;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  private normalizeReconciliationStatus(status: string): ReconciliationJob['status'] {
    if (
      status === 'PENDING' ||
      status === 'RUNNING' ||
      status === 'DONE' ||
      status === 'FAILED' ||
      status === 'CANCELLED'
    ) {
      return status;
    }
    return 'FAILED';
  }

  private normalizeReconciliationDataset(dataset: string): ReconciliationDataset {
    if (dataset === 'SPOT_PRICE' || dataset === 'FUTURES_QUOTE' || dataset === 'MARKET_EVENT') {
      return dataset;
    }
    return 'SPOT_PRICE';
  }

  private toIsoString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  }

  private parseJsonValue<T>(value: unknown): T | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return undefined;
      }
    }
    return value as T;
  }

  private isReconciliationPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTable =
      message.includes('datareconciliationjob') || message.includes('datareconciliationdiff');
    const containsEnum = message.includes('reconcilejobstatus');
    const containsColumn = message.includes('summarypass');
    const containsRetryColumn =
      message.includes('retriedfromjobid') || message.includes('retrycount');
    const containsCancelColumn =
      message.includes('cancelledat') || message.includes('cancelreason');
    const missingTableHint =
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column') ||
      message.includes('undefined') ||
      message.includes('42703') ||
      message.includes('42704') ||
      message.includes('invalid input value for enum') ||
      message.includes('p2021');
    return (
      (containsTable ||
        containsEnum ||
        containsColumn ||
        containsRetryColumn ||
        containsCancelColumn) &&
      missingTableHint
    );
  }

  private disableReconciliationPersistence(operation: string, error: unknown) {
    if (this.reconciliationPersistenceUnavailable) {
      return;
    }
    this.reconciliationPersistenceUnavailable = true;
    this.logger.warn(
      `Reconciliation persistence disabled (${operation}): ${this.stringifyError(error)}`,
    );
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
