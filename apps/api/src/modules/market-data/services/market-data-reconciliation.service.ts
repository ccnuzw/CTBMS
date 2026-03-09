import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReconciliationJobDto,
  CreateReconciliationM1ReadinessReportSnapshotDto,
  CreateReconciliationRollbackDrillDto,
  ListReconciliationM1ReadinessReportSnapshotsQueryDto,
  ReconciliationSummaryDto,
} from '@packages/types';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma';
import { ConfigService } from '../../config/config.service';
import {
  parseOptionalBoolean,
  parseOptionalDate,
  parsePositiveInteger,
  parseNonNegativeInteger,
  parseRetryCount,
  parseJsonValue,
  toUtcDateKey,
  toIsoString,
  normalizeReconciliationStatus,
  normalizeReconciliationDataset,
  normalizeCoverageRate,
  compareReconciliationJobs,
  extractScalarDimensions,
  matchesReconciliationGateDimensions,
  isReconciliationPersistenceMissingTableError,
  isReconciliationDailyMetricsPersistenceMissingTableError,
  isRollbackDrillPersistenceMissingTableError,
  stringifyError,
  parseInteger,
  normalizeRollbackDrillStatus,
  normalizeReconciliationSortBy,
  normalizeReconciliationSortOrder,
} from './market-data.helpers';
import { MarketDataPersistenceService } from './market-data-persistence.service';
import type {
  ReconciliationJob,
  ReconciliationGateSnapshot,
  ReconciliationGateEvaluationResult,
  ReconciliationWindowJobRecord,
  ReconciliationWindowMetricsResult,
  ReconciliationDailyMetricsHistoryResult,
  ReconciliationReadCoverageMetricsResult,
  ReconciliationM1ReadinessResult,
  ReconciliationM1ReadinessReportResult,
  ReconciliationM1ReadinessReportSnapshotResult,
  M1ReadinessReportSnapshotRecord,
  RollbackDrillRecord,
  PersistedReconciliationDailyMetricRow,
  PersistedReadCoverageDailyRow,
  PersistedRollbackDrillRow,
} from './market-data.types';
import { RECONCILIATION_GATE_REASON as GATE_REASON_FROM_TYPES } from './market-data.types';

type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';
type ReconciliationDataset = StandardDataset;
type ReconciliationJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
type ReconciliationM1ReadinessReportFormat = 'json' | 'markdown';
type ReconciliationListSortBy = 'createdAt' | 'startedAt' | 'finishedAt' | 'status' | 'dataset';
type ReconciliationListSortOrder = 'asc' | 'desc';
type RollbackDrillStatus = 'PLANNED' | 'RUNNING' | 'PASSED' | 'FAILED';

const RECONCILIATION_GATE_REASON = GATE_REASON_FROM_TYPES;

const STANDARD_RECONCILIATION_DATASETS: StandardDataset[] = [
  'SPOT_PRICE',
  'FUTURES_QUOTE',
  'MARKET_EVENT',
];

interface ReconciliationSingleWriteGovernanceInput {
  days?: number;
  targetCoverageRate?: number;
  datasets?: StandardDataset[];
}

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

/**
 * Delegate interface for cross-service calls back to MarketDataService.
 */
export interface MarketDataReconciliationDelegate {
  queryStandardizedData(
    dataset: StandardDataset,
    options: { from?: Date; to?: Date; filters?: Record<string, unknown>; limit?: number },
  ): Promise<{ dataset: string; rows: unknown[]; meta: unknown }>;
  querySpot(
    filters?: Record<string, unknown>,
    limit?: number,
    from?: Date,
    to?: Date,
  ): Promise<unknown[]>;
  queryFutures(
    filters?: Record<string, unknown>,
    limit?: number,
    from?: Date,
    to?: Date,
  ): Promise<unknown[]>;
  queryMarketEvent(
    filters?: Record<string, unknown>,
    limit?: number,
    from?: Date,
    to?: Date,
  ): Promise<unknown[]>;
  validateStandardSpotRecord(row: unknown): string[];
  validateStandardFuturesRecord(row: unknown): string[];
  validateStandardEventRecord(row: unknown): string[];
}

@Injectable()
export class MarketDataReconciliationService {
  private readonly logger = new Logger(MarketDataReconciliationService.name);

  // In-memory state
  readonly reconciliationJobs = new Map<string, ReconciliationJob>();
  readonly rollbackDrillRecords = new Map<string, RollbackDrillRecord>();
  readonly m1ReadinessReportSnapshots = new Map<string, M1ReadinessReportSnapshotRecord>();

  private delegate?: MarketDataReconciliationDelegate;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly persistenceService: MarketDataPersistenceService,
  ) {}

  setDelegate(delegate: MarketDataReconciliationDelegate) {
    this.delegate = delegate;
  }

  private getDelegate(): MarketDataReconciliationDelegate {
    if (!this.delegate) {
      throw new Error('MarketDataReconciliationService delegate not set');
    }
    return this.delegate;
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
      retryCount: parseRetryCount(options?.retryCount),
      createdByUserId: userId,
      createdAt: new Date().toISOString(),
      request: this.cloneReconciliationRequest(dto),
    };

    this.reconciliationJobs.set(jobId, job);
    await this.persistenceService.persistReconciliationJobSnapshot(job, dto);

    try {
      job.status = 'RUNNING';
      job.startedAt = new Date().toISOString();
      await this.persistenceService.persistReconciliationJobSnapshot(job, dto);

      const summary = await this.runReconciliation(dto);
      job.summary = summary.summary;
      job.summaryPass = this.resolveSummaryPass(job.summary);
      job.sampleDiffs = summary.sampleDiffs;
      job.status = 'DONE';
      job.finishedAt = new Date().toISOString();
      await this.persistenceService.persistReconciliationJobSnapshot(job, dto);
      await this.persistenceService.replacePersistedReconciliationDiffs(
        job.jobId,
        summary.sampleDiffs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconciliation job ${jobId} failed: ${message}`);
      job.status = 'FAILED';
      job.error = message;
      job.finishedAt = new Date().toISOString();
      await this.persistenceService.persistReconciliationJobSnapshot(job, dto);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: parseRetryCount(job.retryCount),
      createdAt: job.createdAt,
    };
  }

  async retryReconciliationJob(userId: string, jobId: string) {
    let retryRequest: CreateReconciliationJobDto | undefined;
    let sourceStatus: ReconciliationJobStatus | undefined;
    let sourceRetryCount = 0;

    const persistedSource =
      await this.persistenceService.findPersistedReconciliationJobForRetry(jobId);
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
      sourceRetryCount = parseRetryCount(inMemoryJob.retryCount);
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

    const persisted = await this.persistenceService.findPersistedReconciliationJob(jobId);
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
      await this.persistenceService.persistReconciliationJobSnapshot(persisted);

      return {
        jobId: persisted.jobId,
        status: persisted.status,
        dataset: persisted.dataset,
        retriedFromJobId: persisted.retriedFromJobId ?? null,
        retryCount: parseRetryCount(persisted.retryCount),
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
    await this.persistenceService.persistReconciliationJobSnapshot(job, job.request);

    return {
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: parseRetryCount(job.retryCount),
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
    const createdAtFrom = parseOptionalDate(query.createdAtFrom);
    const createdAtTo = parseOptionalDate(query.createdAtTo);
    const sortBy = normalizeReconciliationSortBy(query.sortBy);
    const sortOrder = normalizeReconciliationSortOrder(query.sortOrder);

    if (createdAtFrom && createdAtTo && createdAtFrom.getTime() > createdAtTo.getTime()) {
      throw new BadRequestException('createdAtFrom must be <= createdAtTo');
    }

    const persisted = await this.persistenceService.listPersistedReconciliationJobs(
      userId,
      page,
      pageSize,
      {
        dataset,
        status,
        pass,
        createdAtFrom,
        createdAtTo,
        sortBy,
        sortOrder,
      },
    );
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
      .sort((a, b) => compareReconciliationJobs(a, b, sortBy, sortOrder));

    const total = filteredJobs.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;
    const items = filteredJobs.slice(start, start + pageSize).map((job) => ({
      jobId: job.jobId,
      status: job.status,
      dataset: job.dataset,
      retriedFromJobId: job.retriedFromJobId ?? null,
      retryCount: parseRetryCount(job.retryCount),
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
    const persisted = await this.persistenceService.findPersistedReconciliationJob(jobId);
    if (persisted) {
      if (persisted.createdByUserId !== userId) {
        throw new ForbiddenException('no permission to access this job');
      }

      return {
        jobId: persisted.jobId,
        status: persisted.status,
        dataset: persisted.dataset,
        retriedFromJobId: persisted.retriedFromJobId ?? null,
        retryCount: parseRetryCount(persisted.retryCount),
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
      retryCount: parseRetryCount(job.retryCount),
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

    const persisted = await this.persistenceService.findLatestPersistedReconciliationForGate(
      dataset,
      normalizedDimensions,
    );
    if (persisted) {
      return persisted;
    }

    const inMemoryCandidate = Array.from(this.reconciliationJobs.values())
      .filter((job) => job.dataset === dataset)
      .filter((job) =>
        matchesReconciliationGateDimensions(job.request?.dimensions, normalizedDimensions),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (!inMemoryCandidate) {
      return null;
    }

    return {
      jobId: inMemoryCandidate.jobId,
      status: inMemoryCandidate.status,
      retriedFromJobId: inMemoryCandidate.retriedFromJobId ?? null,
      retryCount: parseRetryCount(inMemoryCandidate.retryCount),
      summaryPass: this.resolveSummaryPass(
        inMemoryCandidate.summary,
        inMemoryCandidate.summaryPass,
      ),
      createdAt: inMemoryCandidate.createdAt,
      finishedAt: inMemoryCandidate.finishedAt,
      cancelledAt: inMemoryCandidate.cancelledAt,
      dimensions: extractScalarDimensions(inMemoryCandidate.request?.dimensions),
      source: 'in-memory',
    };
  }

  async evaluateReconciliationGate(
    dataset: StandardDataset,
    options?: {
      filters?: Record<string, unknown>;
      maxAgeMinutes?: number;
      enabledOverride?: boolean;
    },
  ): Promise<ReconciliationGateEvaluationResult> {
    const checkedAt = new Date().toISOString();
    const enabled =
      options?.enabledOverride ?? (await this.resolveWorkflowReconciliationGateEnabled());

    if (!enabled) {
      return {
        enabled: false,
        passed: true,
        reason: RECONCILIATION_GATE_REASON.GATE_DISABLED,
        checkedAt,
      };
    }

    const maxAgeMinutes =
      parsePositiveInteger(options?.maxAgeMinutes) ??
      (await this.resolveWorkflowReconciliationMaxAgeMinutes());

    const latest = await this.getLatestReconciliationSnapshot(dataset, options?.filters);
    if (!latest) {
      return {
        enabled: true,
        passed: false,
        reason: RECONCILIATION_GATE_REASON.NO_RECONCILIATION_JOB,
        checkedAt,
        maxAgeMinutes,
      };
    }

    if (latest.status !== 'DONE') {
      return {
        enabled: true,
        passed: false,
        reason: RECONCILIATION_GATE_REASON.LATEST_STATUS_NOT_DONE,
        checkedAt,
        maxAgeMinutes,
        latest,
      };
    }

    if (latest.summaryPass !== true) {
      return {
        enabled: true,
        passed: false,
        reason: RECONCILIATION_GATE_REASON.LATEST_SUMMARY_NOT_PASSED,
        checkedAt,
        maxAgeMinutes,
        latest,
      };
    }

    const latestTimeRaw = latest.finishedAt ?? latest.createdAt;
    const latestTime = new Date(latestTimeRaw).getTime();
    if (!Number.isFinite(latestTime)) {
      return {
        enabled: true,
        passed: false,
        reason: RECONCILIATION_GATE_REASON.LATEST_TIME_INVALID,
        checkedAt,
        maxAgeMinutes,
        latest,
      };
    }

    const ageMinutes = (Date.now() - latestTime) / (1000 * 60);
    if (ageMinutes > maxAgeMinutes) {
      return {
        enabled: true,
        passed: false,
        reason: RECONCILIATION_GATE_REASON.LATEST_OUTDATED,
        checkedAt,
        maxAgeMinutes,
        ageMinutes,
        latest,
      };
    }

    return {
      enabled: true,
      passed: true,
      reason: RECONCILIATION_GATE_REASON.GATE_PASSED,
      checkedAt,
      maxAgeMinutes,
      ageMinutes,
      latest,
    };
  }

  async getReconciliationWindowMetrics(
    dataset: StandardDataset,
    options?: {
      days?: number;
      now?: Date;
    },
  ): Promise<ReconciliationWindowMetricsResult> {
    const requestedDays = parsePositiveInteger(options?.days) ?? 7;
    const windowDays = Math.min(30, Math.max(1, requestedDays));

    const now = options?.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(now.getTime())) {
      throw new BadRequestException('invalid now datetime for reconciliation window metrics');
    }
    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(startOfTodayUtc);
    fromDate.setUTCDate(fromDate.getUTCDate() - (windowDays - 1));

    const recordsResult = await this.queryReconciliationJobsInWindow(dataset, fromDate, now);

    const dailyMap = new Map<
      string,
      {
        date: string;
        totalJobs: number;
        doneJobs: number;
        passedJobs: number;
        passed: boolean;
        latestJobId?: string;
        latestTime?: number;
      }
    >();

    for (let i = 0; i < windowDays; i += 1) {
      const date = new Date(fromDate);
      date.setUTCDate(fromDate.getUTCDate() + i);
      const dateKey = toUtcDateKey(date);
      dailyMap.set(dateKey, {
        date: dateKey,
        totalJobs: 0,
        doneJobs: 0,
        passedJobs: 0,
        passed: false,
      });
    }

    for (const record of recordsResult.records) {
      const dateKey = toUtcDateKey(record.createdAt);
      const entry = dailyMap.get(dateKey);
      if (!entry) {
        continue;
      }

      entry.totalJobs += 1;
      if (record.status === 'DONE') {
        entry.doneJobs += 1;
        if (record.summaryPass === true) {
          entry.passedJobs += 1;
        }
      }

      const recordTime = new Date(record.createdAt).getTime();
      if (Number.isFinite(recordTime) && (!entry.latestTime || recordTime > entry.latestTime)) {
        entry.latestTime = recordTime;
        entry.latestJobId = record.jobId;
      }
    }

    const daily = Array.from(dailyMap.values()).map((entry) => ({
      date: entry.date,
      totalJobs: entry.totalJobs,
      doneJobs: entry.doneJobs,
      passedJobs: entry.passedJobs,
      passed: entry.doneJobs > 0 && entry.doneJobs === entry.passedJobs,
      latestJobId: entry.latestJobId,
    }));

    const totalJobs = recordsResult.records.length;
    const doneJobs = recordsResult.records.filter((record) => record.status === 'DONE').length;
    const passedJobs = recordsResult.records.filter(
      (record) => record.status === 'DONE' && record.summaryPass === true,
    ).length;

    let consecutivePassedDays = 0;
    for (let i = daily.length - 1; i >= 0; i -= 1) {
      if (!daily[i].passed) {
        break;
      }
      consecutivePassedDays += 1;
    }

    const meetsWindowTarget = daily.length > 0 && daily.every((item) => item.passed);

    return {
      dataset,
      windowDays,
      fromDate: fromDate.toISOString(),
      toDate: now.toISOString(),
      source: recordsResult.source,
      totalJobs,
      doneJobs,
      passedJobs,
      daily,
      consecutivePassedDays,
      meetsWindowTarget,
    };
  }

  async snapshotReconciliationWindowMetrics(options?: {
    windowDays?: number;
    datasets?: StandardDataset[];
    now?: Date;
  }): Promise<{
    generatedAt: string;
    windowDays: number;
    source: 'database' | 'in-memory';
    results: Array<{
      dataset: StandardDataset;
      totalJobs: number;
      passedJobs: number;
      consecutivePassedDays: number;
      meetsWindowTarget: boolean;
    }>;
  }> {
    const windowDays = Math.min(30, Math.max(1, parsePositiveInteger(options?.windowDays) ?? 7));
    const now = options?.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(now.getTime())) {
      throw new BadRequestException('invalid now datetime for reconciliation snapshot');
    }

    const datasets =
      options?.datasets && options.datasets.length > 0
        ? options.datasets
        : STANDARD_RECONCILIATION_DATASETS;
    const dedupedDatasets = Array.from(new Set(datasets)) as StandardDataset[];

    const results: Array<{
      dataset: StandardDataset;
      totalJobs: number;
      passedJobs: number;
      consecutivePassedDays: number;
      meetsWindowTarget: boolean;
    }> = [];

    let source: 'database' | 'in-memory' = 'database';
    for (const dataset of dedupedDatasets) {
      const metrics = await this.getReconciliationWindowMetrics(dataset, {
        days: windowDays,
        now,
      });

      if (metrics.source === 'in-memory') {
        source = 'in-memory';
      }

      await this.persistenceService.persistReconciliationDailyMetric(metrics, now);
      results.push({
        dataset,
        totalJobs: metrics.totalJobs,
        passedJobs: metrics.passedJobs,
        consecutivePassedDays: metrics.consecutivePassedDays,
        meetsWindowTarget: metrics.meetsWindowTarget,
      });
    }

    return {
      generatedAt: now.toISOString(),
      windowDays,
      source,
      results,
    };
  }

  async getReconciliationDailyMetricsHistory(
    dataset: StandardDataset,
    options?: {
      windowDays?: number;
      days?: number;
    },
  ): Promise<ReconciliationDailyMetricsHistoryResult> {
    const windowDays = Math.min(30, Math.max(1, parsePositiveInteger(options?.windowDays) ?? 7));
    const days = Math.min(90, Math.max(1, parsePositiveInteger(options?.days) ?? 30));

    if (!this.persistenceService.reconciliationDailyMetricsPersistenceUnavailable) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationDailyMetricRow[]>(
          `SELECT
             "dataset",
             "metricDate",
             "windowDays",
             "totalJobs",
             "doneJobs",
             "passedJobs",
             "dayPassed",
             "consecutivePassedDays",
             "meetsWindowTarget",
             "source",
             "payload",
             "generatedAt"
           FROM "DataReconciliationDailyMetric"
           WHERE "dataset" = $1
             AND "windowDays" = $2
           ORDER BY "metricDate" DESC
           LIMIT $3`,
          dataset,
          windowDays,
          days,
        );

        return {
          dataset,
          windowDays,
          days,
          source: 'database',
          items: rows.map((row) => ({
            metricDate: toIsoString(row.metricDate) ?? new Date().toISOString(),
            totalJobs: parseInteger(row.totalJobs),
            doneJobs: parseInteger(row.doneJobs),
            passedJobs: parseInteger(row.passedJobs),
            dayPassed: parseOptionalBoolean(row.dayPassed) ?? false,
            consecutivePassedDays: parseInteger(row.consecutivePassedDays),
            meetsWindowTarget: parseOptionalBoolean(row.meetsWindowTarget) ?? false,
            generatedAt: toIsoString(row.generatedAt) ?? new Date().toISOString(),
            payload: parseJsonValue<Record<string, unknown>>(row.payload),
          })),
        };
      } catch (error) {
        if (isReconciliationDailyMetricsPersistenceMissingTableError(error)) {
          this.persistenceService.disableReconciliationDailyMetricsPersistence(
            'query daily metrics history',
            error,
          );
        } else {
          this.logger.error(`Query daily metrics history failed: ${stringifyError(error)}`);
        }
      }
    }

    const fallbackMetrics = await this.getReconciliationWindowMetrics(dataset, {
      days: windowDays,
    });

    const fallbackDaily = fallbackMetrics.daily.slice(-days);
    let streak = 0;
    const items = fallbackDaily.map((item) => {
      streak = item.passed ? streak + 1 : 0;
      return {
        metricDate: `${item.date}T00:00:00.000Z`,
        totalJobs: item.totalJobs,
        doneJobs: item.doneJobs,
        passedJobs: item.passedJobs,
        dayPassed: item.passed,
        consecutivePassedDays: streak,
        meetsWindowTarget: streak >= windowDays,
        generatedAt: new Date().toISOString(),
        payload: {
          fromDate: fallbackMetrics.fromDate,
          toDate: fallbackMetrics.toDate,
        },
      };
    });

    return {
      dataset,
      windowDays,
      days,
      source: 'in-memory',
      items,
    };
  }

  async getReconciliationReadCoverageMetrics(options?: {
    days?: number;
    workflowVersionIds?: string[];
    targetCoverageRate?: number;
  }): Promise<ReconciliationReadCoverageMetricsResult> {
    const windowDays = Math.min(30, Math.max(1, parsePositiveInteger(options?.days) ?? 7));
    const targetCoverageRate = normalizeCoverageRate(options?.targetCoverageRate, 0.9);

    const now = new Date();
    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(startOfTodayUtc);
    fromDate.setUTCDate(fromDate.getUTCDate() - (windowDays - 1));

    const dailyMap = new Map<
      string,
      {
        date: string;
        totalDataFetchNodes: number;
        standardReadNodes: number;
        legacyReadNodes: number;
        otherSourceNodes: number;
        gateEvaluatedNodes: number;
        gatePassedNodes: number;
        coverageRate: number;
        meetsTarget: boolean;
      }
    >();

    for (let i = 0; i < windowDays; i += 1) {
      const date = new Date(fromDate);
      date.setUTCDate(fromDate.getUTCDate() + i);
      const dateKey = toUtcDateKey(date);
      dailyMap.set(dateKey, {
        date: dateKey,
        totalDataFetchNodes: 0,
        standardReadNodes: 0,
        legacyReadNodes: 0,
        otherSourceNodes: 0,
        gateEvaluatedNodes: 0,
        gatePassedNodes: 0,
        coverageRate: 0,
        meetsTarget: false,
      });
    }

    const whereParts = [
      `n."nodeType" = 'data-fetch'`,
      `n."status" = 'SUCCESS'::"NodeExecutionStatus"`,
      `n."createdAt" >= $1`,
      `n."createdAt" <= $2`,
    ];
    const params: unknown[] = [fromDate, now];

    const workflowVersionIds = options?.workflowVersionIds?.filter((item) => !!item) ?? [];
    const dedupedWorkflowVersionIds = Array.from(new Set(workflowVersionIds));
    if (dedupedWorkflowVersionIds.length > 0) {
      whereParts.push(`we."workflowVersionId" = ANY($${params.length + 1}::text[])`);
      params.push(dedupedWorkflowVersionIds);
    }

    const rows = await this.prisma.$queryRawUnsafe<PersistedReadCoverageDailyRow[]>(
      `SELECT
         date_trunc('day', n."createdAt")::date AS "metricDate",
         COUNT(*)::int AS "totalCount",
         SUM(CASE WHEN COALESCE(n."outputSnapshot"->'metadata'->>'source', '') = 'STANDARD_READ_MODEL' THEN 1 ELSE 0 END)::int AS "standardCount",
         SUM(CASE WHEN COALESCE(n."outputSnapshot"->'metadata'->>'source', '') = 'INTERNAL_DB' THEN 1 ELSE 0 END)::int AS "legacyCount",
         SUM(CASE WHEN COALESCE(n."outputSnapshot"->'metadata'->>'source', '') NOT IN ('STANDARD_READ_MODEL', 'INTERNAL_DB', '') THEN 1 ELSE 0 END)::int AS "otherCount",
         SUM(CASE WHEN COALESCE(n."outputSnapshot"->'metadata', '{}'::jsonb) ? 'reconciliationGate' THEN 1 ELSE 0 END)::int AS "gateEvaluatedCount",
         SUM(CASE WHEN COALESCE(n."outputSnapshot"->'metadata'->'reconciliationGate'->>'passed', 'false') = 'true' THEN 1 ELSE 0 END)::int AS "gatePassedCount"
       FROM "NodeExecution" n
       JOIN "WorkflowExecution" we ON we."id" = n."workflowExecutionId"
       WHERE ${whereParts.join(' AND ')}
       GROUP BY 1
       ORDER BY 1 ASC`,
      ...params,
    );

    for (const row of rows) {
      const dateKey = toUtcDateKey(row.metricDate);
      const entry = dailyMap.get(dateKey);
      if (!entry) {
        continue;
      }

      entry.totalDataFetchNodes = parseInteger(row.totalCount);
      entry.standardReadNodes = parseInteger(row.standardCount);
      entry.legacyReadNodes = parseInteger(row.legacyCount);
      entry.otherSourceNodes = parseInteger(row.otherCount);
      entry.gateEvaluatedNodes = parseInteger(row.gateEvaluatedCount);
      entry.gatePassedNodes = parseInteger(row.gatePassedCount);
      entry.coverageRate =
        entry.totalDataFetchNodes > 0 ? entry.standardReadNodes / entry.totalDataFetchNodes : 0;
      entry.meetsTarget = entry.totalDataFetchNodes > 0 && entry.coverageRate >= targetCoverageRate;
    }

    const daily = Array.from(dailyMap.values());

    const totalDataFetchNodes = daily.reduce((sum, item) => sum + item.totalDataFetchNodes, 0);
    const standardReadNodes = daily.reduce((sum, item) => sum + item.standardReadNodes, 0);
    const legacyReadNodes = daily.reduce((sum, item) => sum + item.legacyReadNodes, 0);
    const otherSourceNodes = daily.reduce((sum, item) => sum + item.otherSourceNodes, 0);
    const gateEvaluatedNodes = daily.reduce((sum, item) => sum + item.gateEvaluatedNodes, 0);
    const gatePassedNodes = daily.reduce((sum, item) => sum + item.gatePassedNodes, 0);

    const coverageRate = totalDataFetchNodes > 0 ? standardReadNodes / totalDataFetchNodes : 0;
    const meetsCoverageTarget = totalDataFetchNodes > 0 && coverageRate >= targetCoverageRate;

    let consecutiveCoverageDays = 0;
    for (let i = daily.length - 1; i >= 0; i -= 1) {
      if (!daily[i].meetsTarget) {
        break;
      }
      consecutiveCoverageDays += 1;
    }

    return {
      windowDays,
      fromDate: fromDate.toISOString(),
      toDate: now.toISOString(),
      targetCoverageRate,
      totalDataFetchNodes,
      standardReadNodes,
      legacyReadNodes,
      otherSourceNodes,
      gateEvaluatedNodes,
      gatePassedNodes,
      coverageRate,
      meetsCoverageTarget,
      consecutiveCoverageDays,
      daily,
    };
  }

  async getSingleWriteGovernanceStatus(options?: ReconciliationSingleWriteGovernanceInput) {
    const coverage = await this.getReconciliationReadCoverageMetrics({
      days: options?.days,
      targetCoverageRate: options?.targetCoverageRate,
    });
    const standardizedRead = await this.configService
      .getWorkflowStandardizedReadMode()
      .catch(() => ({ enabled: false, source: 'unknown', updatedAt: new Date().toISOString() }));
    const reconciliationGateEnabled = await this.resolveWorkflowReconciliationGateEnabled();

    const datasets =
      options?.datasets && options.datasets.length > 0
        ? (Array.from(new Set(options.datasets)) as StandardDataset[])
        : STANDARD_RECONCILIATION_DATASETS;

    const gateEvaluations = await Promise.all(
      datasets.map(async (dataset) => {
        const evaluation = await this.evaluateReconciliationGate(dataset);
        return [dataset, evaluation] as const;
      }),
    );

    const evaluatedGateByDataset = Object.fromEntries(gateEvaluations) as Record<
      StandardDataset,
      ReconciliationGateEvaluationResult
    >;

    const gateAllPassed =
      !reconciliationGateEnabled || gateEvaluations.every(([, evaluation]) => evaluation.passed);

    const reasonCodes: string[] = [];
    if (!standardizedRead.enabled) {
      reasonCodes.push('STANDARDIZED_READ_DISABLED');
    }
    if (!reconciliationGateEnabled) {
      reasonCodes.push('RECONCILIATION_GATE_DISABLED');
    } else if (!gateAllPassed) {
      reasonCodes.push('RECONCILIATION_GATE_NOT_PASSED');
    }
    if (!coverage.meetsCoverageTarget) {
      reasonCodes.push('COVERAGE_BELOW_TARGET');
    }
    if (coverage.legacyReadNodes > 0) {
      reasonCodes.push('LEGACY_READ_DETECTED');
    }
    if (coverage.otherSourceNodes > 0) {
      reasonCodes.push('NON_STANDARD_SOURCE_DETECTED');
    }

    const compliant = reasonCodes.length === 0;

    return {
      generatedAt: new Date().toISOString(),
      compliant,
      reasonCodes,
      message: compliant
        ? '单写入统一读取治理达标'
        : `单写入统一读取治理未达标：${reasonCodes.join(', ')}`,
      runtime: {
        standardizedRead: {
          enabled: standardizedRead.enabled,
          source: standardizedRead.source,
          updatedAt: standardizedRead.updatedAt,
        },
        reconciliationGate: {
          enabled: reconciliationGateEnabled,
          datasets,
          evaluated: evaluatedGateByDataset,
          allPassed: gateAllPassed,
          checkedAt: new Date().toISOString(),
        },
      },
      coverage: {
        windowDays: coverage.windowDays,
        targetCoverageRate: coverage.targetCoverageRate,
        coverageRate: coverage.coverageRate,
        meetsCoverageTarget: coverage.meetsCoverageTarget,
        totalDataFetchNodes: coverage.totalDataFetchNodes,
        standardReadNodes: coverage.standardReadNodes,
        legacyReadNodes: coverage.legacyReadNodes,
        otherSourceNodes: coverage.otherSourceNodes,
        gateEvaluatedNodes: coverage.gateEvaluatedNodes,
        gatePassedNodes: coverage.gatePassedNodes,
        consecutiveCoverageDays: coverage.consecutiveCoverageDays,
      },
    };
  }

  async getReconciliationM1Readiness(options?: {
    windowDays?: number;
    targetCoverageRate?: number;
    datasets?: StandardDataset[];
  }): Promise<ReconciliationM1ReadinessResult> {
    const windowDays = Math.min(30, Math.max(1, parsePositiveInteger(options?.windowDays) ?? 7));
    const targetCoverageRate = normalizeCoverageRate(options?.targetCoverageRate, 0.9);
    const datasets =
      options?.datasets && options.datasets.length > 0
        ? (Array.from(new Set(options.datasets)) as StandardDataset[])
        : STANDARD_RECONCILIATION_DATASETS;

    const coverage = await this.getReconciliationReadCoverageMetrics({
      days: windowDays,
      targetCoverageRate,
    });

    const reconciliation: ReconciliationM1ReadinessResult['reconciliation'] = [];
    for (const dataset of datasets) {
      const metrics = await this.getReconciliationWindowMetrics(dataset, { days: windowDays });
      reconciliation.push({
        dataset,
        meetsWindowTarget: metrics.meetsWindowTarget,
        consecutivePassedDays: metrics.consecutivePassedDays,
        totalJobs: metrics.totalJobs,
        passedJobs: metrics.passedJobs,
        source: metrics.source,
      });
    }

    const latestDrillsByDataset = await this.getLatestRollbackDrillsByDataset(datasets);
    const readinessFromMs = Date.parse(coverage.fromDate);
    const fallbackFromMs = Date.now() - (windowDays - 1) * 24 * 60 * 60 * 1000;
    const fromMs = Number.isFinite(readinessFromMs) ? readinessFromMs : fallbackFromMs;

    const rollbackDrills: ReconciliationM1ReadinessResult['rollbackDrills'] = datasets.map(
      (dataset) => {
        const drill = latestDrillsByDataset.get(dataset);
        if (!drill) {
          return {
            dataset,
            exists: false,
            recent: false,
            passed: false,
          };
        }

        const createdAtMs = Date.parse(drill.createdAt);
        const recent = Number.isFinite(createdAtMs) ? createdAtMs >= fromMs : false;

        return {
          dataset,
          exists: true,
          recent,
          passed: drill.status === 'PASSED',
          drillId: drill.drillId,
          status: drill.status,
          createdAt: drill.createdAt,
        };
      },
    );

    const meetsReconciliationTarget = reconciliation.every((item) => item.meetsWindowTarget);
    const meetsCoverageTarget = coverage.meetsCoverageTarget;
    const hasRecentRollbackDrillEvidence = rollbackDrills.every(
      (item) => item.exists && item.recent && item.passed,
    );

    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      datasets,
      summary: {
        meetsReconciliationTarget,
        meetsCoverageTarget,
        hasRecentRollbackDrillEvidence,
        ready: meetsReconciliationTarget && meetsCoverageTarget && hasRecentRollbackDrillEvidence,
      },
      coverage,
      reconciliation,
      rollbackDrills,
    };
  }

  async getReconciliationM1ReadinessReport(options?: {
    format?: ReconciliationM1ReadinessReportFormat;
    windowDays?: number;
    targetCoverageRate?: number;
    datasets?: StandardDataset[];
  }): Promise<ReconciliationM1ReadinessReportResult> {
    const format = options?.format ?? 'markdown';
    const readiness = await this.getReconciliationM1Readiness({
      windowDays: options?.windowDays,
      targetCoverageRate: options?.targetCoverageRate,
      datasets: options?.datasets,
    });

    const generatedAt = new Date().toISOString();
    const fileName = `reconciliation-m1-readiness-${generatedAt.slice(0, 10)}.${format === 'json' ? 'json' : 'md'}`;

    if (format === 'json') {
      return {
        format,
        generatedAt,
        fileName,
        readiness,
        report: readiness,
      };
    }

    return {
      format,
      generatedAt,
      fileName,
      readiness,
      report: this.buildReconciliationM1ReadinessMarkdown(readiness),
    };
  }

  buildReconciliationM1ReadinessMarkdown(
    readiness: ReconciliationM1ReadinessResult,
  ): string {
    const lines: string[] = [];
    lines.push('# Reconciliation M1 Readiness Report');
    lines.push('');
    lines.push(`Generated At: ${readiness.generatedAt}`);
    lines.push(`Window Days: ${readiness.windowDays}`);
    lines.push(`Datasets: ${readiness.datasets.join(', ')}`);
    lines.push('');
    lines.push('## Overall Readiness');
    lines.push('');
    lines.push(`- Ready: ${this.toPassFail(readiness.summary.ready)}`);
    lines.push(
      `- Reconciliation Target: ${this.toPassFail(readiness.summary.meetsReconciliationTarget)}`,
    );
    lines.push(`- Coverage Target: ${this.toPassFail(readiness.summary.meetsCoverageTarget)}`);
    lines.push(
      `- Rollback Drill Evidence: ${this.toPassFail(readiness.summary.hasRecentRollbackDrillEvidence)}`,
    );
    lines.push('');
    lines.push('## Coverage');
    lines.push('');
    lines.push(`- Target Coverage Rate: ${this.toPercent(readiness.coverage.targetCoverageRate)}`);
    lines.push(`- Current Coverage Rate: ${this.toPercent(readiness.coverage.coverageRate)}`);
    lines.push(`- Standard Read Nodes: ${readiness.coverage.standardReadNodes}`);
    lines.push(`- Total Data Fetch Nodes: ${readiness.coverage.totalDataFetchNodes}`);
    lines.push(
      `- Consecutive Coverage Days Meeting Target: ${readiness.coverage.consecutiveCoverageDays}`,
    );
    lines.push('');
    lines.push('## Reconciliation By Dataset');
    lines.push('');
    lines.push(
      '| Dataset | Meets Target | Consecutive Passed Days | Passed Jobs / Total Jobs | Source |',
    );
    lines.push('| --- | --- | ---: | ---: | --- |');
    for (const item of readiness.reconciliation) {
      lines.push(
        `| ${item.dataset} | ${this.toPassFail(item.meetsWindowTarget)} | ${item.consecutivePassedDays} | ${item.passedJobs} / ${item.totalJobs} | ${item.source} |`,
      );
    }
    lines.push('');
    lines.push('## Rollback Drill Evidence');
    lines.push('');
    lines.push('| Dataset | Exists | Recent | Passed | Drill ID | Created At |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of readiness.rollbackDrills) {
      lines.push(
        `| ${item.dataset} | ${this.toPassFail(item.exists)} | ${this.toPassFail(item.recent)} | ${this.toPassFail(item.passed)} | ${item.drillId ?? '-'} | ${item.createdAt ?? '-'} |`,
      );
    }

    return lines.join('\n');
  }

  toPassFail(value: boolean): 'PASS' | 'FAIL' {
    return value ? 'PASS' : 'FAIL';
  }

  toPercent(value: number): string {
    if (!Number.isFinite(value)) {
      return '0.00%';
    }
    return `${(value * 100).toFixed(2)}%`;
  }

  async createReconciliationM1ReadinessReportSnapshot(
    userId: string,
    dto: CreateReconciliationM1ReadinessReportSnapshotDto,
  ): Promise<ReconciliationM1ReadinessReportSnapshotResult> {
    const report = await this.getReconciliationM1ReadinessReport({
      format: dto.format,
      windowDays: dto.windowDays,
      targetCoverageRate: dto.targetCoverageRate,
      datasets: dto.datasets,
    });

    const snapshot: M1ReadinessReportSnapshotRecord = {
      snapshotId: randomUUID(),
      format: report.format,
      fileName: report.fileName,
      windowDays: report.readiness.windowDays,
      targetCoverageRate: report.readiness.coverage.targetCoverageRate,
      datasets: report.readiness.datasets,
      readiness: report.readiness,
      report: report.report,
      requestedByUserId: userId,
      createdAt: report.generatedAt,
    };

    this.m1ReadinessReportSnapshots.set(snapshot.snapshotId, snapshot);
    const persisted = await this.persistenceService.persistM1ReadinessReportSnapshot(snapshot);

    return {
      ...snapshot,
      storage: persisted ? 'database' : 'in-memory',
    };
  }

  async listReconciliationM1ReadinessReportSnapshots(
    userId: string,
    query: ListReconciliationM1ReadinessReportSnapshotsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const persisted = await this.persistenceService.listPersistedM1ReadinessReportSnapshots(
      userId,
      page,
      pageSize,
      {
        format: query.format,
      },
    );
    if (persisted) {
      return persisted;
    }

    const filtered = Array.from(this.m1ReadinessReportSnapshots.values())
      .filter((item) => item.requestedByUserId === userId)
      .filter((item) => (!query.format ? true : item.format === query.format))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      total,
      totalPages,
      storage: 'in-memory' as const,
      items: filtered.slice(start, start + pageSize).map((item) => ({
        snapshotId: item.snapshotId,
        format: item.format,
        fileName: item.fileName,
        windowDays: item.windowDays,
        targetCoverageRate: item.targetCoverageRate,
        datasets: item.datasets,
        summary: item.readiness.summary,
        createdAt: item.createdAt,
      })),
    };
  }

  async getReconciliationM1ReadinessReportSnapshot(
    userId: string,
    snapshotId: string,
  ): Promise<ReconciliationM1ReadinessReportSnapshotResult> {
    const persisted =
      await this.persistenceService.findPersistedM1ReadinessReportSnapshot(snapshotId);
    if (persisted) {
      if (persisted.requestedByUserId !== userId) {
        throw new ForbiddenException('no permission to access this report snapshot');
      }
      return {
        ...persisted,
        storage: 'database',
      };
    }

    const local = this.m1ReadinessReportSnapshots.get(snapshotId);
    if (!local) {
      throw new NotFoundException('m1 readiness report snapshot not found');
    }
    if (local.requestedByUserId !== userId) {
      throw new ForbiddenException('no permission to access this report snapshot');
    }

    return {
      ...local,
      storage: 'in-memory',
    };
  }

  async createReconciliationRollbackDrill(
    userId: string,
    dto: CreateReconciliationRollbackDrillDto,
  ) {
    const now = new Date();
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : now;
    if (!Number.isFinite(startedAt.getTime())) {
      throw new BadRequestException('invalid startedAt datetime');
    }

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    if (completedAt && !Number.isFinite(completedAt.getTime())) {
      throw new BadRequestException('invalid completedAt datetime');
    }
    if (completedAt && completedAt.getTime() < startedAt.getTime()) {
      throw new BadRequestException('completedAt must be >= startedAt');
    }

    const status = normalizeRollbackDrillStatus(dto.status);
    const durationSeconds =
      parseNonNegativeInteger(dto.durationSeconds) ??
      (completedAt
        ? Math.max(0, Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000))
        : undefined);

    const record: RollbackDrillRecord = {
      drillId: randomUUID(),
      dataset: dto.dataset,
      workflowVersionId: dto.workflowVersionId,
      scenario: dto.scenario ?? 'standard_to_legacy',
      status,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      durationSeconds,
      rollbackPath: dto.rollbackPath,
      resultSummary: dto.resultSummary,
      notes: dto.notes,
      triggeredByUserId: userId,
      createdAt: now.toISOString(),
    };

    this.rollbackDrillRecords.set(record.drillId, record);

    const persisted = await this.persistenceService.persistRollbackDrillRecord(record);
    return {
      ...record,
      storage: persisted ? 'database' : 'in-memory',
    };
  }

  async listReconciliationRollbackDrills(
    userId: string,
    query: {
      page?: number;
      pageSize?: number;
      dataset?: StandardDataset;
      status?: RollbackDrillStatus;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const persisted = await this.persistenceService.listPersistedRollbackDrillRecords(
      userId,
      page,
      pageSize,
      {
        dataset: query.dataset,
        status: query.status,
      },
    );
    if (persisted) {
      return persisted;
    }

    const filtered = Array.from(this.rollbackDrillRecords.values())
      .filter((item) => item.triggeredByUserId === userId)
      .filter((item) => (!query.dataset ? true : item.dataset === query.dataset))
      .filter((item) => (!query.status ? true : item.status === query.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      total,
      totalPages,
      storage: 'in-memory' as const,
      items: filtered.slice(start, start + pageSize),
    };
  }

  async getLatestRollbackDrillsByDataset(
    datasets: StandardDataset[],
  ): Promise<Map<StandardDataset, RollbackDrillRecord | undefined>> {
    const resultMap = new Map<StandardDataset, RollbackDrillRecord | undefined>();
    for (const dataset of datasets) {
      resultMap.set(dataset, undefined);
    }

    const dedupedDatasets = Array.from(new Set(datasets));

    if (!this.persistenceService.rollbackDrillPersistenceUnavailable) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<PersistedRollbackDrillRow[]>(
          `SELECT DISTINCT ON ("dataset")
             "drillId",
             "dataset",
             "workflowVersionId",
             "scenario",
             "status",
             "startedAt",
             "completedAt",
             "durationSeconds",
             "rollbackPath",
             "resultSummary",
             "notes",
             "triggeredByUserId",
             "createdAt"
           FROM "DataReconciliationRollbackDrill"
           WHERE "dataset" = ANY($1::text[])
           ORDER BY "dataset", "createdAt" DESC`,
          dedupedDatasets,
        );

        for (const row of rows) {
          const dataset = normalizeReconciliationDataset(row.dataset) as StandardDataset;
          if (!resultMap.has(dataset)) {
            continue;
          }
          resultMap.set(dataset, this.persistenceService.mapPersistedRollbackDrillRow(row));
        }

        return resultMap;
      } catch (error) {
        if (isRollbackDrillPersistenceMissingTableError(error)) {
          this.persistenceService.disableRollbackDrillPersistence(
            'read latest rollback drills',
            error,
          );
        } else {
          this.logger.error(`Read latest rollback drills failed: ${stringifyError(error)}`);
        }
      }
    }

    const sorted = Array.from(this.rollbackDrillRecords.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    for (const dataset of dedupedDatasets) {
      const latest = sorted.find((item) => item.dataset === dataset);
      resultMap.set(dataset, latest);
    }

    return resultMap;
  }

  async queryReconciliationJobsInWindow(
    dataset: StandardDataset,
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    records: ReconciliationWindowJobRecord[];
    source: 'database' | 'in-memory';
  }> {
    if (!this.persistenceService.reconciliationPersistenceUnavailable) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{
            jobId: string;
            status: string;
            summaryPass: unknown;
            createdAt: unknown;
          }>
        >(
          `SELECT "jobId", "status", "summaryPass", "createdAt"
           FROM "DataReconciliationJob"
           WHERE "dataset" = $1
             AND "createdAt" >= $2
             AND "createdAt" <= $3
           ORDER BY "createdAt" DESC`,
          dataset,
          fromDate,
          toDate,
        );

        const records: ReconciliationWindowJobRecord[] = [];
        for (const row of rows) {
          const createdAt = toIsoString(row.createdAt);
          if (!createdAt) {
            continue;
          }

          records.push({
            jobId: row.jobId,
            status: normalizeReconciliationStatus(row.status),
            summaryPass: parseOptionalBoolean(row.summaryPass),
            createdAt,
            source: 'database',
          });
        }

        return {
          records,
          source: 'database',
        };
      } catch (error) {
        if (isReconciliationPersistenceMissingTableError(error)) {
          this.persistenceService.disableReconciliationPersistence(
            'query reconciliation jobs in window',
            error,
          );
        } else {
          this.logger.error(`Query reconciliation jobs in window failed: ${stringifyError(error)}`);
        }
      }
    }

    const records: ReconciliationWindowJobRecord[] = [];
    for (const job of this.reconciliationJobs.values()) {
      if (job.dataset !== dataset) {
        continue;
      }

      const createdAt = toIsoString(job.createdAt);
      if (!createdAt) {
        continue;
      }

      const time = new Date(createdAt).getTime();
      if (time < fromDate.getTime() || time > toDate.getTime()) {
        continue;
      }

      records.push({
        jobId: job.jobId,
        status: job.status,
        summaryPass: this.resolveSummaryPass(job.summary, job.summaryPass),
        createdAt,
        source: 'in-memory',
      });
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      records,
      source: 'in-memory',
    };
  }

  cloneReconciliationRequest(dto: CreateReconciliationJobDto): CreateReconciliationJobDto {
    return JSON.parse(JSON.stringify(dto)) as CreateReconciliationJobDto;
  }

  resolveSummaryPass(
    summary?: ReconciliationSummaryDto,
    rawSummaryPass?: unknown,
  ): boolean | undefined {
    const parsedSummaryPass = parseOptionalBoolean(rawSummaryPass);
    if (parsedSummaryPass !== undefined) {
      return parsedSummaryPass;
    }
    if (summary && typeof summary.pass === 'boolean') {
      return summary.pass;
    }
    return undefined;
  }

  async resolveWorkflowReconciliationGateEnabled(): Promise<boolean> {
    try {
      const setting = await this.configService.getWorkflowReconciliationGateEnabled();
      return setting.enabled;
    } catch {
      const fallback = parseOptionalBoolean(process.env.WORKFLOW_RECONCILIATION_GATE_ENABLED);
      if (fallback !== undefined) {
        this.logger.warn('读取 workflow reconciliation gate 开关失败，回退环境变量');
        return fallback;
      }
      return false;
    }
  }

  async resolveWorkflowReconciliationMaxAgeMinutes(): Promise<number> {
    try {
      const setting = await this.configService.getWorkflowReconciliationMaxAgeMinutes();
      if (setting.value > 0) {
        return setting.value;
      }
    } catch {
      const fallback = parsePositiveInteger(process.env.WORKFLOW_RECONCILIATION_MAX_AGE_MINUTES);
      if (fallback !== null) {
        this.logger.warn('读取 workflow reconciliation max age 失败，回退环境变量');
        return fallback;
      }
    }

    return 1440;
  }

  normalizeReconciliationGateDimensions(
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

    return extractScalarDimensions(dimensions) ?? {};
  }

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
      const rows = await this.getDelegate().querySpot(dto.dimensions, 5000, from, to) as Array<Record<string, unknown>>;
      const summary = this.calculateReconciliationSummary(
        rows,
        maxDiffRate,
        maxMissingRate,
        (row) => `${row.commodityCode}_${row.regionCode}_${row.dataTime}`,
        (row) => this.getDelegate().validateStandardSpotRecord(row),
      );
      sampleDiffs.push(...summary.sampleDiffs);
      return { summary: summary.summary, sampleDiffs };
    }

    if (dto.dataset === 'FUTURES_QUOTE') {
      const rows = await this.getDelegate().queryFutures(dto.dimensions, 5000, from, to) as Array<Record<string, unknown>>;
      const summary = this.calculateReconciliationSummary(
        rows,
        maxDiffRate,
        maxMissingRate,
        (row) => `${row.contractCode}_${row.dataTime}`,
        (row) => this.getDelegate().validateStandardFuturesRecord(row),
      );
      sampleDiffs.push(...summary.sampleDiffs);
      return { summary: summary.summary, sampleDiffs };
    }

    const rows = await this.getDelegate().queryMarketEvent(dto.dimensions, 5000, from, to) as Array<Record<string, unknown>>;
    const summary = this.calculateReconciliationSummary(
      rows,
      maxDiffRate,
      maxMissingRate,
      (row) => `${row.eventType}_${row.title}_${row.publishedAt}`,
      (row) => this.getDelegate().validateStandardEventRecord(row),
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


  private getFilterString(filters: Record<string, unknown> | undefined, keys: string[]) {
    if (!filters) return undefined;
    for (const key of keys) {
      const value = filters[key];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return undefined;
  }

  private normalizeCommodityCode(rawCommodity: string): string {
    return rawCommodity
      .trim()
      .toUpperCase()
      .replace(/[\s_-]+/g, '_');
  }
}
