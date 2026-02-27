import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReconciliationCutoverAutopilotDto,
  CreateReconciliationCutoverDecisionDto,
  CreateReconciliationM1ReadinessReportSnapshotDto,
  CreateReconciliationRollbackDrillDto,
  CreateReconciliationJobDto,
  ExecuteReconciliationRollbackDto,
  LineageDataset,
  ListReconciliationCutoverDecisionsQueryDto,
  ListReconciliationM1ReadinessReportSnapshotsQueryDto,
  ReconciliationCutoverRuntimeStatusQueryDto,
  ReconciliationRollbackDrillStatus,
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
import { ConfigService } from '../config/config.service';

type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';
type ReconciliationJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
type ReconciliationM1ReadinessReportFormat = 'json' | 'markdown';
type ReconciliationCutoverDecisionStatus = 'APPROVED' | 'REJECTED';
type RollbackDrillStatus = ReconciliationRollbackDrillStatus;
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

interface PersistedReconciliationDailyMetricRow {
  dataset: string;
  metricDate: unknown;
  windowDays: unknown;
  totalJobs: unknown;
  doneJobs: unknown;
  passedJobs: unknown;
  dayPassed: unknown;
  consecutivePassedDays: unknown;
  meetsWindowTarget: unknown;
  source: string;
  payload: unknown;
  generatedAt: unknown;
}

interface RollbackDrillRecord {
  drillId: string;
  dataset: StandardDataset;
  workflowVersionId?: string;
  scenario: string;
  status: RollbackDrillStatus;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  rollbackPath?: string;
  resultSummary?: Record<string, unknown>;
  notes?: string;
  triggeredByUserId: string;
  createdAt: string;
}

interface PersistedRollbackDrillRow {
  drillId: string;
  dataset: string;
  workflowVersionId: string | null;
  scenario: string;
  status: string;
  startedAt: unknown;
  completedAt: unknown;
  durationSeconds: unknown;
  rollbackPath: string | null;
  resultSummary: unknown;
  notes: string | null;
  triggeredByUserId: string;
  createdAt: unknown;
}

interface PersistedReadCoverageDailyRow {
  metricDate: unknown;
  totalCount: unknown;
  standardCount: unknown;
  legacyCount: unknown;
  otherCount: unknown;
  gateEvaluatedCount: unknown;
  gatePassedCount: unknown;
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

interface M1ReadinessReportSnapshotRecord {
  snapshotId: string;
  format: ReconciliationM1ReadinessReportFormat;
  fileName: string;
  windowDays: number;
  targetCoverageRate: number;
  datasets: StandardDataset[];
  readiness: ReconciliationM1ReadinessResult;
  report: ReconciliationM1ReadinessResult | string;
  requestedByUserId: string;
  createdAt: string;
}

interface PersistedM1ReadinessReportSnapshotRow {
  snapshotId: string;
  format: string;
  fileName: string;
  windowDays: unknown;
  targetCoverageRate: unknown;
  datasets: unknown;
  readinessSnapshot: unknown;
  reportPayload: unknown;
  requestedByUserId: string;
  createdAt: unknown;
}

interface ReconciliationCutoverDecisionRecord {
  decisionId: string;
  status: ReconciliationCutoverDecisionStatus;
  reasonCodes: string[];
  windowDays: number;
  targetCoverageRate: number;
  datasets: StandardDataset[];
  reportFormat: ReconciliationM1ReadinessReportFormat;
  reportSnapshotId: string;
  readinessSummary: {
    meetsReconciliationTarget: boolean;
    meetsCoverageTarget: boolean;
    hasRecentRollbackDrillEvidence: boolean;
    ready: boolean;
  };
  note?: string;
  requestedByUserId: string;
  createdAt: string;
}

interface PersistedReconciliationCutoverDecisionRow {
  decisionId: string;
  status: string;
  reasonCodes: unknown;
  windowDays: unknown;
  targetCoverageRate: unknown;
  datasets: unknown;
  reportFormat: string;
  reportSnapshotId: string;
  readinessSummary: unknown;
  note: string | null;
  requestedByUserId: string;
  createdAt: unknown;
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

export interface ReconciliationGateEvaluationResult {
  enabled: boolean;
  passed: boolean;
  reason: ReconciliationGateReason;
  checkedAt: string;
  maxAgeMinutes?: number;
  ageMinutes?: number;
  latest?: ReconciliationGateSnapshot;
}

interface ReconciliationWindowJobRecord {
  jobId: string;
  status: ReconciliationJobStatus;
  summaryPass: boolean | undefined;
  createdAt: string;
  source: 'database' | 'in-memory';
}

export interface ReconciliationWindowMetricsResult {
  dataset: StandardDataset;
  windowDays: number;
  fromDate: string;
  toDate: string;
  source: 'database' | 'in-memory';
  totalJobs: number;
  doneJobs: number;
  passedJobs: number;
  daily: Array<{
    date: string;
    totalJobs: number;
    doneJobs: number;
    passedJobs: number;
    passed: boolean;
    latestJobId?: string;
  }>;
  consecutivePassedDays: number;
  meetsWindowTarget: boolean;
}

export interface ReconciliationDailyMetricsHistoryResult {
  dataset: StandardDataset;
  windowDays: number;
  days: number;
  source: 'database' | 'in-memory';
  items: Array<{
    metricDate: string;
    totalJobs: number;
    doneJobs: number;
    passedJobs: number;
    dayPassed: boolean;
    consecutivePassedDays: number;
    meetsWindowTarget: boolean;
    generatedAt: string;
    payload?: Record<string, unknown>;
  }>;
}

export interface ReconciliationReadCoverageMetricsResult {
  windowDays: number;
  fromDate: string;
  toDate: string;
  targetCoverageRate: number;
  totalDataFetchNodes: number;
  standardReadNodes: number;
  legacyReadNodes: number;
  otherSourceNodes: number;
  gateEvaluatedNodes: number;
  gatePassedNodes: number;
  coverageRate: number;
  meetsCoverageTarget: boolean;
  consecutiveCoverageDays: number;
  daily: Array<{
    date: string;
    totalDataFetchNodes: number;
    standardReadNodes: number;
    legacyReadNodes: number;
    otherSourceNodes: number;
    gateEvaluatedNodes: number;
    gatePassedNodes: number;
    coverageRate: number;
    meetsTarget: boolean;
  }>;
}

export interface ReconciliationM1ReadinessResult {
  generatedAt: string;
  windowDays: number;
  datasets: StandardDataset[];
  summary: {
    meetsReconciliationTarget: boolean;
    meetsCoverageTarget: boolean;
    hasRecentRollbackDrillEvidence: boolean;
    ready: boolean;
  };
  coverage: ReconciliationReadCoverageMetricsResult;
  reconciliation: Array<{
    dataset: StandardDataset;
    meetsWindowTarget: boolean;
    consecutivePassedDays: number;
    totalJobs: number;
    passedJobs: number;
    source: 'database' | 'in-memory';
  }>;
  rollbackDrills: Array<{
    dataset: StandardDataset;
    exists: boolean;
    recent: boolean;
    passed: boolean;
    drillId?: string;
    status?: RollbackDrillStatus;
    createdAt?: string;
  }>;
}

export interface ReconciliationM1ReadinessReportResult {
  format: ReconciliationM1ReadinessReportFormat;
  generatedAt: string;
  fileName: string;
  readiness: ReconciliationM1ReadinessResult;
  report: ReconciliationM1ReadinessResult | string;
}

export interface ReconciliationM1ReadinessReportSnapshotResult {
  snapshotId: string;
  format: ReconciliationM1ReadinessReportFormat;
  fileName: string;
  windowDays: number;
  targetCoverageRate: number;
  datasets: StandardDataset[];
  readiness: ReconciliationM1ReadinessResult;
  report: ReconciliationM1ReadinessResult | string;
  requestedByUserId: string;
  createdAt: string;
  storage: 'database' | 'in-memory';
}

export interface ReconciliationCutoverDecisionResult {
  decisionId: string;
  status: ReconciliationCutoverDecisionStatus;
  reasonCodes: string[];
  windowDays: number;
  targetCoverageRate: number;
  datasets: StandardDataset[];
  reportFormat: ReconciliationM1ReadinessReportFormat;
  reportSnapshotId: string;
  readinessSummary: {
    meetsReconciliationTarget: boolean;
    meetsCoverageTarget: boolean;
    hasRecentRollbackDrillEvidence: boolean;
    ready: boolean;
  };
  note?: string;
  requestedByUserId: string;
  createdAt: string;
  storage: 'database' | 'in-memory';
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

export const RECONCILIATION_GATE_REASON = {
  GATE_DISABLED: 'gate_disabled',
  NO_RECONCILIATION_JOB: 'no_reconciliation_job',
  LATEST_STATUS_NOT_DONE: 'latest_status_not_done',
  LATEST_SUMMARY_NOT_PASSED: 'latest_summary_not_passed',
  LATEST_TIME_INVALID: 'latest_time_invalid',
  LATEST_OUTDATED: 'latest_outdated',
  GATE_PASSED: 'gate_passed',
} as const;

export type ReconciliationGateReason =
  (typeof RECONCILIATION_GATE_REASON)[keyof typeof RECONCILIATION_GATE_REASON];

export const STANDARD_RECONCILIATION_DATASETS: StandardDataset[] = [
  'SPOT_PRICE',
  'FUTURES_QUOTE',
  'MARKET_EVENT',
];

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly reconciliationJobs = new Map<string, ReconciliationJob>();
  private readonly rollbackDrillRecords = new Map<string, RollbackDrillRecord>();
  private readonly m1ReadinessReportSnapshots = new Map<string, M1ReadinessReportSnapshotRecord>();
  private readonly cutoverDecisionRecords = new Map<string, ReconciliationCutoverDecisionRecord>();
  private reconciliationPersistenceUnavailable = false;
  private reconciliationDailyMetricsPersistenceUnavailable = false;
  private rollbackDrillPersistenceUnavailable = false;
  private m1ReadinessReportPersistenceUnavailable = false;
  private cutoverDecisionPersistenceUnavailable = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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
      this.parsePositiveInteger(options?.maxAgeMinutes) ??
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
    const requestedDays = this.parsePositiveInteger(options?.days) ?? 7;
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
      const dateKey = this.toUtcDateKey(date);
      dailyMap.set(dateKey, {
        date: dateKey,
        totalJobs: 0,
        doneJobs: 0,
        passedJobs: 0,
        passed: false,
      });
    }

    for (const record of recordsResult.records) {
      const dateKey = this.toUtcDateKey(record.createdAt);
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
    const windowDays = Math.min(
      30,
      Math.max(1, this.parsePositiveInteger(options?.windowDays) ?? 7),
    );
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

      await this.persistReconciliationDailyMetric(metrics, now);
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
    const windowDays = Math.min(
      30,
      Math.max(1, this.parsePositiveInteger(options?.windowDays) ?? 7),
    );
    const days = Math.min(90, Math.max(1, this.parsePositiveInteger(options?.days) ?? 30));

    if (!this.reconciliationDailyMetricsPersistenceUnavailable) {
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
            metricDate: this.toIsoString(row.metricDate) ?? new Date().toISOString(),
            totalJobs: this.parseInteger(row.totalJobs),
            doneJobs: this.parseInteger(row.doneJobs),
            passedJobs: this.parseInteger(row.passedJobs),
            dayPassed: this.parseOptionalBoolean(row.dayPassed) ?? false,
            consecutivePassedDays: this.parseInteger(row.consecutivePassedDays),
            meetsWindowTarget: this.parseOptionalBoolean(row.meetsWindowTarget) ?? false,
            generatedAt: this.toIsoString(row.generatedAt) ?? new Date().toISOString(),
            payload: this.parseJsonValue<Record<string, unknown>>(row.payload),
          })),
        };
      } catch (error) {
        if (this.isReconciliationDailyMetricsPersistenceMissingTableError(error)) {
          this.disableReconciliationDailyMetricsPersistence('query daily metrics history', error);
        } else {
          this.logger.error(`Query daily metrics history failed: ${this.stringifyError(error)}`);
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
    const windowDays = Math.min(30, Math.max(1, this.parsePositiveInteger(options?.days) ?? 7));
    const targetCoverageRate = this.normalizeCoverageRate(options?.targetCoverageRate, 0.9);

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
      const dateKey = this.toUtcDateKey(date);
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
      const dateKey = this.toUtcDateKey(row.metricDate);
      const entry = dailyMap.get(dateKey);
      if (!entry) {
        continue;
      }

      entry.totalDataFetchNodes = this.parseInteger(row.totalCount);
      entry.standardReadNodes = this.parseInteger(row.standardCount);
      entry.legacyReadNodes = this.parseInteger(row.legacyCount);
      entry.otherSourceNodes = this.parseInteger(row.otherCount);
      entry.gateEvaluatedNodes = this.parseInteger(row.gateEvaluatedCount);
      entry.gatePassedNodes = this.parseInteger(row.gatePassedCount);
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

  async getReconciliationM1Readiness(options?: {
    windowDays?: number;
    targetCoverageRate?: number;
    datasets?: StandardDataset[];
  }): Promise<ReconciliationM1ReadinessResult> {
    const windowDays = Math.min(
      30,
      Math.max(1, this.parsePositiveInteger(options?.windowDays) ?? 7),
    );
    const targetCoverageRate = this.normalizeCoverageRate(options?.targetCoverageRate, 0.9);
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

  private buildReconciliationM1ReadinessMarkdown(
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

  private toPassFail(value: boolean): 'PASS' | 'FAIL' {
    return value ? 'PASS' : 'FAIL';
  }

  private toPercent(value: number): string {
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
    const persisted = await this.persistM1ReadinessReportSnapshot(snapshot);

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

    const persisted = await this.listPersistedM1ReadinessReportSnapshots(userId, page, pageSize, {
      format: query.format,
    });
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
    const persisted = await this.findPersistedM1ReadinessReportSnapshot(snapshotId);
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

  async createReconciliationCutoverDecision(
    userId: string,
    dto: CreateReconciliationCutoverDecisionDto,
  ): Promise<ReconciliationCutoverDecisionResult> {
    const snapshot = await this.createReconciliationM1ReadinessReportSnapshot(userId, {
      format: dto.reportFormat,
      windowDays: dto.windowDays,
      targetCoverageRate: dto.targetCoverageRate,
      datasets: dto.datasets,
    });

    const reasonCodes = this.resolveCutoverDecisionReasonCodes(snapshot.readiness.summary);
    const status: ReconciliationCutoverDecisionStatus =
      reasonCodes.length === 0 ? 'APPROVED' : 'REJECTED';

    const record: ReconciliationCutoverDecisionRecord = {
      decisionId: randomUUID(),
      status,
      reasonCodes,
      windowDays: snapshot.windowDays,
      targetCoverageRate: snapshot.targetCoverageRate,
      datasets: snapshot.datasets,
      reportFormat: snapshot.format,
      reportSnapshotId: snapshot.snapshotId,
      readinessSummary: snapshot.readiness.summary,
      note: dto.note,
      requestedByUserId: userId,
      createdAt: new Date().toISOString(),
    };

    this.cutoverDecisionRecords.set(record.decisionId, record);
    const persisted = await this.persistReconciliationCutoverDecisionRecord(record);

    return {
      ...record,
      storage: persisted ? 'database' : 'in-memory',
    };
  }

  async executeReconciliationCutover(
    userId: string,
    dto: CreateReconciliationCutoverDecisionDto,
  ): Promise<{
    executedAt: string;
    decision: ReconciliationCutoverDecisionResult;
    applied: boolean;
    config: {
      standardizedRead: {
        before: boolean;
        after: boolean;
      };
      reconciliationGate: {
        before: boolean;
        after: boolean;
      };
    };
  }> {
    const decision = await this.createReconciliationCutoverDecision(userId, dto);

    const standardizedReadBefore = await this.configService.getWorkflowStandardizedReadMode();
    const reconciliationGateBefore =
      await this.configService.getWorkflowReconciliationGateEnabled();

    let standardizedReadAfter = standardizedReadBefore;
    let reconciliationGateAfter = reconciliationGateBefore;
    let applied = false;

    if (decision.status === 'APPROVED') {
      standardizedReadAfter = await this.configService.setWorkflowStandardizedReadMode(
        true,
        userId,
      );
      reconciliationGateAfter = await this.configService.setWorkflowReconciliationGateEnabled(
        true,
        userId,
      );
      applied = true;
    }

    return {
      executedAt: new Date().toISOString(),
      decision,
      applied,
      config: {
        standardizedRead: {
          before: standardizedReadBefore.enabled,
          after: standardizedReadAfter.enabled,
        },
        reconciliationGate: {
          before: reconciliationGateBefore.enabled,
          after: reconciliationGateAfter.enabled,
        },
      },
    };
  }

  async executeReconciliationCutoverAutopilot(
    userId: string,
    dto: CreateReconciliationCutoverAutopilotDto,
  ): Promise<{
    executedAt: string;
    action: 'CUTOVER' | 'ROLLBACK' | 'NONE';
    dryRun: boolean;
    decision: {
      decisionId: string;
      status: ReconciliationCutoverDecisionStatus;
      reasonCodes: string[];
      reportSnapshotId: string;
      createdAt: string;
    };
    cutover?: {
      applied: boolean;
      config: {
        standardizedRead: {
          before: boolean;
          after: boolean;
        };
        reconciliationGate: {
          before: boolean;
          after: boolean;
        };
      };
    };
    rollback?: {
      applied: boolean;
      datasets: StandardDataset[];
      config: {
        standardizedRead: {
          before: boolean;
          after: boolean;
        };
        reconciliationGate: {
          before: boolean;
          after: boolean;
        };
      };
      rollbackDrills: Array<{
        drillId: string;
        dataset: StandardDataset;
        status: RollbackDrillStatus;
      }>;
    };
  }> {
    const decision = await this.createReconciliationCutoverDecision(userId, {
      windowDays: dto.windowDays,
      targetCoverageRate: dto.targetCoverageRate,
      datasets: dto.datasets,
      reportFormat: dto.reportFormat,
      note: dto.note,
    });

    const decisionSummary = {
      decisionId: decision.decisionId,
      status: decision.status,
      reasonCodes: decision.reasonCodes,
      reportSnapshotId: decision.reportSnapshotId,
      createdAt: decision.createdAt,
    };

    if (dto.dryRun) {
      return {
        executedAt: new Date().toISOString(),
        action: 'NONE',
        dryRun: true,
        decision: decisionSummary,
      };
    }

    if (decision.status === 'APPROVED') {
      const standardizedReadBefore = await this.configService.getWorkflowStandardizedReadMode();
      const reconciliationGateBefore =
        await this.configService.getWorkflowReconciliationGateEnabled();
      const standardizedReadAfter = await this.configService.setWorkflowStandardizedReadMode(
        true,
        userId,
      );
      const reconciliationGateAfter = await this.configService.setWorkflowReconciliationGateEnabled(
        true,
        userId,
      );

      return {
        executedAt: new Date().toISOString(),
        action: 'CUTOVER',
        dryRun: false,
        decision: decisionSummary,
        cutover: {
          applied:
            standardizedReadBefore.enabled !== standardizedReadAfter.enabled ||
            reconciliationGateBefore.enabled !== reconciliationGateAfter.enabled,
          config: {
            standardizedRead: {
              before: standardizedReadBefore.enabled,
              after: standardizedReadAfter.enabled,
            },
            reconciliationGate: {
              before: reconciliationGateBefore.enabled,
              after: reconciliationGateAfter.enabled,
            },
          },
        },
      };
    }

    const onRejectedAction = dto.onRejectedAction ?? 'ROLLBACK';
    if (onRejectedAction === 'ROLLBACK') {
      const rollback = await this.executeReconciliationRollback(userId, {
        datasets: dto.datasets,
        workflowVersionId: dto.workflowVersionId,
        disableReconciliationGate: dto.disableReconciliationGate,
        note: dto.note,
        reason: dto.rollbackReason ?? 'autopilot_rejected',
      });

      return {
        executedAt: rollback.executedAt,
        action: 'ROLLBACK',
        dryRun: false,
        decision: decisionSummary,
        rollback: {
          applied: rollback.applied,
          datasets: rollback.datasets,
          config: rollback.config,
          rollbackDrills: rollback.rollbackDrills.map((item) => ({
            drillId: item.drillId,
            dataset: item.dataset,
            status: item.status,
          })),
        },
      };
    }

    return {
      executedAt: new Date().toISOString(),
      action: 'NONE',
      dryRun: false,
      decision: decisionSummary,
    };
  }

  async executeReconciliationRollback(
    userId: string,
    dto: ExecuteReconciliationRollbackDto,
  ): Promise<{
    executedAt: string;
    applied: boolean;
    datasets: StandardDataset[];
    config: {
      standardizedRead: {
        before: boolean;
        after: boolean;
      };
      reconciliationGate: {
        before: boolean;
        after: boolean;
      };
    };
    rollbackDrills: Array<{
      drillId: string;
      dataset: StandardDataset;
      status: RollbackDrillStatus;
      storage: 'database' | 'in-memory';
      createdAt: string;
    }>;
  }> {
    const datasets = this.resolveRequestedStandardDatasets(dto.datasets as StandardDataset[]);
    const standardizedReadBefore = await this.configService.getWorkflowStandardizedReadMode();
    const reconciliationGateBefore =
      await this.configService.getWorkflowReconciliationGateEnabled();

    const standardizedReadAfter = await this.configService.setWorkflowStandardizedReadMode(
      false,
      userId,
    );

    const shouldDisableGate = dto.disableReconciliationGate ?? true;
    const reconciliationGateAfter = shouldDisableGate
      ? await this.configService.setWorkflowReconciliationGateEnabled(false, userId)
      : reconciliationGateBefore;

    const executedAt = new Date().toISOString();
    const rollbackPath = shouldDisableGate
      ? 'disable_standardized_read_and_gate'
      : 'disable_standardized_read_only';
    const notes = [dto.note, dto.reason]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' | ')
      .slice(0, 1000);

    const rollbackDrills: Array<{
      drillId: string;
      dataset: StandardDataset;
      status: RollbackDrillStatus;
      storage: 'database' | 'in-memory';
      createdAt: string;
    }> = [];

    for (const dataset of datasets) {
      const drill = await this.createReconciliationRollbackDrill(userId, {
        dataset,
        workflowVersionId: dto.workflowVersionId,
        scenario: 'standard_to_legacy',
        status: 'PASSED',
        startedAt: executedAt,
        completedAt: executedAt,
        rollbackPath,
        resultSummary: {
          executionType: 'ROLLBACK',
          standardizedRead: {
            before: standardizedReadBefore.enabled,
            after: standardizedReadAfter.enabled,
          },
          reconciliationGate: {
            before: reconciliationGateBefore.enabled,
            after: reconciliationGateAfter.enabled,
          },
        },
        notes: notes || undefined,
      });

      rollbackDrills.push({
        drillId: drill.drillId,
        dataset: drill.dataset,
        status: drill.status,
        storage: drill.storage === 'database' ? 'database' : 'in-memory',
        createdAt: drill.createdAt,
      });
    }

    const applied =
      standardizedReadBefore.enabled !== standardizedReadAfter.enabled ||
      reconciliationGateBefore.enabled !== reconciliationGateAfter.enabled;

    return {
      executedAt,
      applied,
      datasets,
      config: {
        standardizedRead: {
          before: standardizedReadBefore.enabled,
          after: standardizedReadAfter.enabled,
        },
        reconciliationGate: {
          before: reconciliationGateBefore.enabled,
          after: reconciliationGateAfter.enabled,
        },
      },
      rollbackDrills,
    };
  }

  async getReconciliationCutoverRuntimeStatus(
    userId: string,
    query: ReconciliationCutoverRuntimeStatusQueryDto,
  ): Promise<{
    generatedAt: string;
    datasets: StandardDataset[];
    config: {
      standardizedRead: {
        enabled: boolean;
        source: string;
        updatedAt: string | null;
      };
      reconciliationGate: {
        enabled: boolean;
        source: string;
        updatedAt: string | null;
      };
    };
    latestCutoverDecision: {
      decisionId: string;
      status: ReconciliationCutoverDecisionStatus;
      reasonCodes: string[];
      createdAt: string;
      reportSnapshotId: string;
    } | null;
    rollbackDrillEvidence: Array<{
      dataset: StandardDataset;
      exists: boolean;
      recent: boolean;
      passed: boolean;
      drillId?: string;
      createdAt?: string;
    }>;
    summary: {
      standardizedReadEnabled: boolean;
      reconciliationGateEnabled: boolean;
      hasRecentRollbackEvidenceAllDatasets: boolean;
      latestDecisionApproved: boolean;
      recommendsRollback: boolean;
    };
  }> {
    const datasets = this.resolveRequestedStandardDatasets(query.datasets as StandardDataset[]);
    const standardizedRead = await this.configService.getWorkflowStandardizedReadMode();
    const reconciliationGate = await this.configService.getWorkflowReconciliationGateEnabled();
    const latestDecision = await this.getLatestReconciliationCutoverDecision(userId);
    const latestRollbackDrills = await this.getLatestRollbackDrillsByDataset(datasets);
    const nowMs = Date.now();
    const recentWindowMs = 7 * 24 * 60 * 60 * 1000;

    const rollbackDrillEvidence = datasets.map((dataset) => {
      const drill = latestRollbackDrills.get(dataset);
      const createdAtMs = drill ? new Date(drill.createdAt).getTime() : Number.NaN;
      const recent = Number.isFinite(createdAtMs) && nowMs - createdAtMs <= recentWindowMs;
      const passed = drill?.status === 'PASSED';
      return {
        dataset,
        exists: Boolean(drill),
        recent,
        passed,
        drillId: drill?.drillId,
        createdAt: drill?.createdAt,
      };
    });

    const hasRecentRollbackEvidenceAllDatasets = rollbackDrillEvidence.every(
      (item) => item.exists && item.recent && item.passed,
    );
    const latestDecisionApproved = latestDecision?.status === 'APPROVED';
    const recommendsRollback =
      standardizedRead.enabled &&
      (!latestDecisionApproved || !hasRecentRollbackEvidenceAllDatasets);

    return {
      generatedAt: new Date().toISOString(),
      datasets,
      config: {
        standardizedRead: {
          enabled: standardizedRead.enabled,
          source: standardizedRead.source,
          updatedAt: standardizedRead.updatedAt,
        },
        reconciliationGate: {
          enabled: reconciliationGate.enabled,
          source: reconciliationGate.source,
          updatedAt: reconciliationGate.updatedAt,
        },
      },
      latestCutoverDecision: latestDecision
        ? {
            decisionId: latestDecision.decisionId,
            status: latestDecision.status,
            reasonCodes: latestDecision.reasonCodes,
            createdAt: latestDecision.createdAt,
            reportSnapshotId: latestDecision.reportSnapshotId,
          }
        : null,
      rollbackDrillEvidence,
      summary: {
        standardizedReadEnabled: standardizedRead.enabled,
        reconciliationGateEnabled: reconciliationGate.enabled,
        hasRecentRollbackEvidenceAllDatasets,
        latestDecisionApproved,
        recommendsRollback,
      },
    };
  }

  async listReconciliationCutoverDecisions(
    userId: string,
    query: ListReconciliationCutoverDecisionsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const persisted = await this.listPersistedReconciliationCutoverDecisions(
      userId,
      page,
      pageSize,
      {
        status: query.status,
      },
    );
    if (persisted) {
      return persisted;
    }

    const filtered = Array.from(this.cutoverDecisionRecords.values())
      .filter((item) => item.requestedByUserId === userId)
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

  async getReconciliationCutoverDecision(
    userId: string,
    decisionId: string,
  ): Promise<ReconciliationCutoverDecisionResult> {
    const persisted = await this.findPersistedReconciliationCutoverDecision(decisionId);
    if (persisted) {
      if (persisted.requestedByUserId !== userId) {
        throw new ForbiddenException('no permission to access this cutover decision');
      }
      return {
        ...persisted,
        storage: 'database',
      };
    }

    const local = this.cutoverDecisionRecords.get(decisionId);
    if (!local) {
      throw new NotFoundException('cutover decision not found');
    }
    if (local.requestedByUserId !== userId) {
      throw new ForbiddenException('no permission to access this cutover decision');
    }

    return {
      ...local,
      storage: 'in-memory',
    };
  }

  private resolveRequestedStandardDatasets(datasets?: StandardDataset[]): StandardDataset[] {
    const normalized = (datasets ?? [])
      .map((dataset) => this.normalizeReconciliationDataset(dataset) as StandardDataset)
      .filter((dataset, index, all) => all.indexOf(dataset) === index);

    if (normalized.length > 0) {
      return normalized;
    }

    return ['SPOT_PRICE', 'FUTURES_QUOTE', 'MARKET_EVENT'];
  }

  private async getLatestReconciliationCutoverDecision(
    userId: string,
  ): Promise<ReconciliationCutoverDecisionRecord | null> {
    const persisted = await this.listPersistedReconciliationCutoverDecisions(userId, 1, 1, {});
    if (persisted && persisted.items.length > 0) {
      return persisted.items[0];
    }

    const local = Array.from(this.cutoverDecisionRecords.values())
      .filter((item) => item.requestedByUserId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return local[0] ?? null;
  }

  private resolveCutoverDecisionReasonCodes(summary: {
    meetsReconciliationTarget: boolean;
    meetsCoverageTarget: boolean;
    hasRecentRollbackDrillEvidence: boolean;
  }): string[] {
    const reasonCodes: string[] = [];
    if (!summary.meetsReconciliationTarget) {
      reasonCodes.push('reconciliation_target_not_met');
    }
    if (!summary.meetsCoverageTarget) {
      reasonCodes.push('coverage_target_not_met');
    }
    if (!summary.hasRecentRollbackDrillEvidence) {
      reasonCodes.push('rollback_drill_evidence_missing');
    }
    return reasonCodes;
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

    const status = this.normalizeRollbackDrillStatus(dto.status);
    const durationSeconds =
      this.parseNonNegativeInteger(dto.durationSeconds) ??
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

    const persisted = await this.persistRollbackDrillRecord(record);
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

    const persisted = await this.listPersistedRollbackDrillRecords(userId, page, pageSize, {
      dataset: query.dataset,
      status: query.status,
    });
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

  private async getLatestRollbackDrillsByDataset(
    datasets: StandardDataset[],
  ): Promise<Map<StandardDataset, RollbackDrillRecord | undefined>> {
    const resultMap = new Map<StandardDataset, RollbackDrillRecord | undefined>();
    for (const dataset of datasets) {
      resultMap.set(dataset, undefined);
    }

    const dedupedDatasets = Array.from(new Set(datasets));

    if (!this.rollbackDrillPersistenceUnavailable) {
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
          const dataset = this.normalizeReconciliationDataset(row.dataset) as StandardDataset;
          if (!resultMap.has(dataset)) {
            continue;
          }
          resultMap.set(dataset, this.mapPersistedRollbackDrillRow(row));
        }

        return resultMap;
      } catch (error) {
        if (this.isRollbackDrillPersistenceMissingTableError(error)) {
          this.disableRollbackDrillPersistence('read latest rollback drills', error);
        } else {
          this.logger.error(`Read latest rollback drills failed: ${this.stringifyError(error)}`);
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

  private mapPersistedRollbackDrillRow(row: PersistedRollbackDrillRow): RollbackDrillRecord {
    return {
      drillId: row.drillId,
      dataset: this.normalizeReconciliationDataset(row.dataset) as StandardDataset,
      workflowVersionId: row.workflowVersionId ?? undefined,
      scenario: row.scenario,
      status: this.normalizeRollbackDrillStatus(row.status),
      startedAt: this.toIsoString(row.startedAt) ?? new Date().toISOString(),
      completedAt: this.toIsoString(row.completedAt),
      durationSeconds: this.parseNonNegativeInteger(row.durationSeconds),
      rollbackPath: row.rollbackPath ?? undefined,
      resultSummary: this.parseJsonValue<Record<string, unknown>>(row.resultSummary),
      notes: row.notes ?? undefined,
      triggeredByUserId: row.triggeredByUserId,
      createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
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

  private async persistM1ReadinessReportSnapshot(
    record: M1ReadinessReportSnapshotRecord,
  ): Promise<boolean> {
    if (this.m1ReadinessReportPersistenceUnavailable) {
      return false;
    }

    const reportPayload =
      typeof record.report === 'string' ? { markdown: record.report } : { json: record.report };

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationM1ReadinessReport"
          ("id", "snapshotId", "format", "fileName", "windowDays", "targetCoverageRate", "datasets", "readinessSnapshot", "reportPayload", "requestedByUserId", "createdAt", "updatedAt")
         VALUES
          ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)
         ON CONFLICT ("snapshotId") DO UPDATE SET
          "format" = EXCLUDED."format",
          "fileName" = EXCLUDED."fileName",
          "windowDays" = EXCLUDED."windowDays",
          "targetCoverageRate" = EXCLUDED."targetCoverageRate",
          "datasets" = EXCLUDED."datasets",
          "readinessSnapshot" = EXCLUDED."readinessSnapshot",
          "reportPayload" = EXCLUDED."reportPayload",
          "updatedAt" = EXCLUDED."updatedAt"`,
        randomUUID(),
        record.snapshotId,
        record.format,
        record.fileName,
        record.windowDays,
        record.targetCoverageRate,
        JSON.stringify(record.datasets),
        JSON.stringify(record.readiness),
        JSON.stringify(reportPayload),
        record.requestedByUserId,
        new Date(record.createdAt),
        new Date(),
      );
      return true;
    } catch (error) {
      if (this.isM1ReadinessReportPersistenceMissingTableError(error)) {
        this.disableM1ReadinessReportPersistence('persist m1 readiness report snapshot', error);
        return false;
      }
      this.logger.error(
        `Persist m1 readiness report snapshot failed: ${this.stringifyError(error)}`,
      );
      return false;
    }
  }

  private async listPersistedM1ReadinessReportSnapshots(
    userId: string,
    page: number,
    pageSize: number,
    options: {
      format?: ReconciliationM1ReadinessReportFormat;
    },
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    storage: 'database';
    items: Array<{
      snapshotId: string;
      format: ReconciliationM1ReadinessReportFormat;
      fileName: string;
      windowDays: number;
      targetCoverageRate: number;
      datasets: StandardDataset[];
      summary: ReconciliationM1ReadinessResult['summary'];
      createdAt: string;
    }>;
  } | null> {
    if (this.m1ReadinessReportPersistenceUnavailable) {
      return null;
    }

    try {
      const whereParts: string[] = ['"requestedByUserId" = $1'];
      const whereParams: unknown[] = [userId];

      if (options.format) {
        whereParts.push(`"format" = $${whereParams.length + 1}`);
        whereParams.push(options.format);
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const totalRows = await this.prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
        `SELECT COUNT(*)::int AS "total"
         FROM "DataReconciliationM1ReadinessReport"
         ${whereClause}`,
        ...whereParams,
      );

      const total = Number(totalRows[0]?.total ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await this.prisma.$queryRawUnsafe<PersistedM1ReadinessReportSnapshotRow[]>(
        `SELECT
           "snapshotId",
           "format",
           "fileName",
           "windowDays",
           "targetCoverageRate",
           "datasets",
           "readinessSnapshot",
           "reportPayload",
           "requestedByUserId",
           "createdAt"
         FROM "DataReconciliationM1ReadinessReport"
         ${whereClause}
         ORDER BY "createdAt" DESC
         LIMIT $${whereParams.length + 1}
         OFFSET $${whereParams.length + 2}`,
        ...whereParams,
        pageSize,
        offset,
      );

      const items = rows.map((row) => {
        const mapped = this.mapPersistedM1ReadinessReportSnapshotRow(row);
        return {
          snapshotId: mapped.snapshotId,
          format: mapped.format,
          fileName: mapped.fileName,
          windowDays: mapped.windowDays,
          targetCoverageRate: mapped.targetCoverageRate,
          datasets: mapped.datasets,
          summary: mapped.readiness.summary,
          createdAt: mapped.createdAt,
        };
      });

      return {
        page,
        pageSize,
        total,
        totalPages,
        storage: 'database',
        items,
      };
    } catch (error) {
      if (this.isM1ReadinessReportPersistenceMissingTableError(error)) {
        this.disableM1ReadinessReportPersistence('list m1 readiness report snapshots', error);
        return null;
      }
      this.logger.error(`List m1 readiness report snapshots failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private async findPersistedM1ReadinessReportSnapshot(
    snapshotId: string,
  ): Promise<ReconciliationM1ReadinessReportSnapshotResult | null> {
    if (this.m1ReadinessReportPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<PersistedM1ReadinessReportSnapshotRow[]>(
        `SELECT
           "snapshotId",
           "format",
           "fileName",
           "windowDays",
           "targetCoverageRate",
           "datasets",
           "readinessSnapshot",
           "reportPayload",
           "requestedByUserId",
           "createdAt"
         FROM "DataReconciliationM1ReadinessReport"
         WHERE "snapshotId" = $1
         LIMIT 1`,
        snapshotId,
      );

      if (rows.length === 0) {
        return null;
      }

      return {
        ...this.mapPersistedM1ReadinessReportSnapshotRow(rows[0]),
        storage: 'database',
      };
    } catch (error) {
      if (this.isM1ReadinessReportPersistenceMissingTableError(error)) {
        this.disableM1ReadinessReportPersistence('find m1 readiness report snapshot', error);
        return null;
      }
      this.logger.error(`Find m1 readiness report snapshot failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private mapPersistedM1ReadinessReportSnapshotRow(
    row: PersistedM1ReadinessReportSnapshotRow,
  ): M1ReadinessReportSnapshotRecord {
    const format = this.normalizeM1ReadinessReportFormat(row.format);
    const readiness =
      this.parseJsonValue<ReconciliationM1ReadinessResult>(row.readinessSnapshot) ??
      (this.createEmptyM1ReadinessSnapshot() as ReconciliationM1ReadinessResult);
    const reportPayload = this.parseJsonValue<Record<string, unknown>>(row.reportPayload);
    const report =
      format === 'markdown'
        ? typeof reportPayload?.markdown === 'string'
          ? reportPayload.markdown
          : ''
        : ((reportPayload?.json as ReconciliationM1ReadinessResult | undefined) ?? readiness);

    const datasetsRaw = this.parseJsonValue<unknown[]>(row.datasets);
    const datasets = (datasetsRaw ?? [])
      .map((item) => this.normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);

    return {
      snapshotId: row.snapshotId,
      format,
      fileName: row.fileName,
      windowDays: this.parseInteger(row.windowDays),
      targetCoverageRate: this.normalizeCoverageRate(row.targetCoverageRate, 0.9),
      datasets,
      readiness,
      report,
      requestedByUserId: row.requestedByUserId,
      createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  private async persistReconciliationCutoverDecisionRecord(
    record: ReconciliationCutoverDecisionRecord,
  ): Promise<boolean> {
    if (this.cutoverDecisionPersistenceUnavailable) {
      return false;
    }

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationCutoverDecision"
          ("id", "decisionId", "status", "reasonCodes", "windowDays", "targetCoverageRate", "datasets", "reportFormat", "reportSnapshotId", "readinessSummary", "note", "requestedByUserId", "createdAt", "updatedAt")
         VALUES
          ($1, $2, $3::"ReconciliationCutoverDecisionStatus", $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12, $13, $14)
         ON CONFLICT ("decisionId") DO UPDATE SET
          "status" = EXCLUDED."status",
          "reasonCodes" = EXCLUDED."reasonCodes",
          "windowDays" = EXCLUDED."windowDays",
          "targetCoverageRate" = EXCLUDED."targetCoverageRate",
          "datasets" = EXCLUDED."datasets",
          "reportFormat" = EXCLUDED."reportFormat",
          "reportSnapshotId" = EXCLUDED."reportSnapshotId",
          "readinessSummary" = EXCLUDED."readinessSummary",
          "note" = EXCLUDED."note",
          "updatedAt" = EXCLUDED."updatedAt"`,
        randomUUID(),
        record.decisionId,
        record.status,
        JSON.stringify(record.reasonCodes),
        record.windowDays,
        record.targetCoverageRate,
        JSON.stringify(record.datasets),
        record.reportFormat,
        record.reportSnapshotId,
        JSON.stringify(record.readinessSummary),
        record.note ?? null,
        record.requestedByUserId,
        new Date(record.createdAt),
        new Date(),
      );
      return true;
    } catch (error) {
      if (this.isCutoverDecisionPersistenceMissingTableError(error)) {
        this.disableCutoverDecisionPersistence('persist cutover decision record', error);
        return false;
      }
      this.logger.error(`Persist cutover decision record failed: ${this.stringifyError(error)}`);
      return false;
    }
  }

  private async listPersistedReconciliationCutoverDecisions(
    userId: string,
    page: number,
    pageSize: number,
    options: {
      status?: ReconciliationCutoverDecisionStatus;
    },
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    storage: 'database';
    items: ReconciliationCutoverDecisionRecord[];
  } | null> {
    if (this.cutoverDecisionPersistenceUnavailable) {
      return null;
    }

    try {
      const whereParts: string[] = ['"requestedByUserId" = $1'];
      const whereParams: unknown[] = [userId];

      if (options.status) {
        whereParts.push(
          `"status" = $${whereParams.length + 1}::"ReconciliationCutoverDecisionStatus"`,
        );
        whereParams.push(options.status);
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const totalRows = await this.prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
        `SELECT COUNT(*)::int AS "total"
         FROM "DataReconciliationCutoverDecision"
         ${whereClause}`,
        ...whereParams,
      );

      const total = Number(totalRows[0]?.total ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationCutoverDecisionRow[]>(
        `SELECT
           "decisionId",
           "status",
           "reasonCodes",
           "windowDays",
           "targetCoverageRate",
           "datasets",
           "reportFormat",
           "reportSnapshotId",
           "readinessSummary",
           "note",
           "requestedByUserId",
           "createdAt"
         FROM "DataReconciliationCutoverDecision"
         ${whereClause}
         ORDER BY "createdAt" DESC
         LIMIT $${whereParams.length + 1}
         OFFSET $${whereParams.length + 2}`,
        ...whereParams,
        pageSize,
        offset,
      );

      return {
        page,
        pageSize,
        total,
        totalPages,
        storage: 'database',
        items: rows.map((row) => this.mapPersistedReconciliationCutoverDecisionRow(row)),
      };
    } catch (error) {
      if (this.isCutoverDecisionPersistenceMissingTableError(error)) {
        this.disableCutoverDecisionPersistence('list cutover decision records', error);
        return null;
      }
      this.logger.error(`List cutover decision records failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private async findPersistedReconciliationCutoverDecision(
    decisionId: string,
  ): Promise<ReconciliationCutoverDecisionResult | null> {
    if (this.cutoverDecisionPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationCutoverDecisionRow[]>(
        `SELECT
           "decisionId",
           "status",
           "reasonCodes",
           "windowDays",
           "targetCoverageRate",
           "datasets",
           "reportFormat",
           "reportSnapshotId",
           "readinessSummary",
           "note",
           "requestedByUserId",
           "createdAt"
         FROM "DataReconciliationCutoverDecision"
         WHERE "decisionId" = $1
         LIMIT 1`,
        decisionId,
      );

      if (rows.length === 0) {
        return null;
      }

      return {
        ...this.mapPersistedReconciliationCutoverDecisionRow(rows[0]),
        storage: 'database',
      };
    } catch (error) {
      if (this.isCutoverDecisionPersistenceMissingTableError(error)) {
        this.disableCutoverDecisionPersistence('find cutover decision record', error);
        return null;
      }
      this.logger.error(`Find cutover decision record failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private mapPersistedReconciliationCutoverDecisionRow(
    row: PersistedReconciliationCutoverDecisionRow,
  ): ReconciliationCutoverDecisionRecord {
    const reasonCodesRaw = this.parseJsonValue<unknown[]>(row.reasonCodes) ?? [];
    const reasonCodes = reasonCodesRaw
      .map((item) => String(item))
      .filter((item) => item.trim().length > 0);
    const datasetsRaw = this.parseJsonValue<unknown[]>(row.datasets) ?? [];
    const datasets = datasetsRaw
      .map((item) => this.normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);
    const readinessSummary = this.parseJsonValue<
      ReconciliationCutoverDecisionRecord['readinessSummary']
    >(row.readinessSummary) ?? {
      meetsReconciliationTarget: false,
      meetsCoverageTarget: false,
      hasRecentRollbackDrillEvidence: false,
      ready: false,
    };

    return {
      decisionId: row.decisionId,
      status: this.normalizeCutoverDecisionStatus(row.status),
      reasonCodes,
      windowDays: this.parseInteger(row.windowDays),
      targetCoverageRate: this.normalizeCoverageRate(row.targetCoverageRate, 0.9),
      datasets,
      reportFormat: this.normalizeM1ReadinessReportFormat(row.reportFormat),
      reportSnapshotId: row.reportSnapshotId,
      readinessSummary,
      note: row.note ?? undefined,
      requestedByUserId: row.requestedByUserId,
      createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  private normalizeM1ReadinessReportFormat(value: unknown): ReconciliationM1ReadinessReportFormat {
    if (value === 'json' || value === 'markdown') {
      return value;
    }
    return 'markdown';
  }

  private normalizeCutoverDecisionStatus(value: unknown): ReconciliationCutoverDecisionStatus {
    if (value === 'APPROVED' || value === 'REJECTED') {
      return value;
    }
    return 'REJECTED';
  }

  private createEmptyM1ReadinessSnapshot(): ReconciliationM1ReadinessResult {
    return {
      generatedAt: new Date().toISOString(),
      windowDays: 7,
      datasets: [],
      summary: {
        meetsReconciliationTarget: false,
        meetsCoverageTarget: false,
        hasRecentRollbackDrillEvidence: false,
        ready: false,
      },
      coverage: {
        windowDays: 7,
        fromDate: new Date().toISOString(),
        toDate: new Date().toISOString(),
        targetCoverageRate: 0.9,
        totalDataFetchNodes: 0,
        standardReadNodes: 0,
        legacyReadNodes: 0,
        otherSourceNodes: 0,
        gateEvaluatedNodes: 0,
        gatePassedNodes: 0,
        coverageRate: 0,
        meetsCoverageTarget: false,
        consecutiveCoverageDays: 0,
        daily: [],
      },
      reconciliation: [],
      rollbackDrills: [],
    };
  }

  private async persistReconciliationDailyMetric(
    metrics: ReconciliationWindowMetricsResult,
    generatedAt: Date,
  ) {
    if (this.reconciliationDailyMetricsPersistenceUnavailable) {
      return;
    }

    const metricDateKey = this.toUtcDateKey(generatedAt);
    const metricDate = new Date(`${metricDateKey}T00:00:00.000Z`);
    if (!Number.isFinite(metricDate.getTime())) {
      return;
    }

    const payload = JSON.stringify({
      fromDate: metrics.fromDate,
      toDate: metrics.toDate,
      daily: metrics.daily,
      source: metrics.source,
    });

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationDailyMetric"
          ("id", "dataset", "metricDate", "windowDays", "totalJobs", "doneJobs", "passedJobs", "dayPassed", "consecutivePassedDays", "meetsWindowTarget", "source", "payload", "generatedAt", "updatedAt")
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
         ON CONFLICT ("dataset", "metricDate", "windowDays") DO UPDATE SET
          "totalJobs" = EXCLUDED."totalJobs",
          "doneJobs" = EXCLUDED."doneJobs",
          "passedJobs" = EXCLUDED."passedJobs",
          "dayPassed" = EXCLUDED."dayPassed",
          "consecutivePassedDays" = EXCLUDED."consecutivePassedDays",
          "meetsWindowTarget" = EXCLUDED."meetsWindowTarget",
          "source" = EXCLUDED."source",
          "payload" = EXCLUDED."payload",
          "generatedAt" = EXCLUDED."generatedAt",
          "updatedAt" = EXCLUDED."updatedAt"`,
        randomUUID(),
        metrics.dataset,
        metricDate,
        metrics.windowDays,
        metrics.totalJobs,
        metrics.doneJobs,
        metrics.passedJobs,
        metrics.daily.length > 0 ? metrics.daily[metrics.daily.length - 1].passed : false,
        metrics.consecutivePassedDays,
        metrics.meetsWindowTarget,
        metrics.source,
        payload,
        generatedAt,
        new Date(),
      );
    } catch (error) {
      if (this.isReconciliationDailyMetricsPersistenceMissingTableError(error)) {
        this.disableReconciliationDailyMetricsPersistence('persist daily metrics snapshot', error);
        return;
      }
      this.logger.error(
        `Persist daily reconciliation metrics failed: ${this.stringifyError(error)}`,
      );
    }
  }

  private async persistRollbackDrillRecord(record: RollbackDrillRecord): Promise<boolean> {
    if (this.rollbackDrillPersistenceUnavailable) {
      return false;
    }

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationRollbackDrill"
          ("id", "drillId", "dataset", "workflowVersionId", "scenario", "status", "startedAt", "completedAt", "durationSeconds", "rollbackPath", "resultSummary", "notes", "triggeredByUserId", "createdAt", "updatedAt")
         VALUES
          ($1, $2, $3, $4, $5, $6::"ReconciliationRollbackDrillStatus", $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
         ON CONFLICT ("drillId") DO UPDATE SET
          "dataset" = EXCLUDED."dataset",
          "workflowVersionId" = EXCLUDED."workflowVersionId",
          "scenario" = EXCLUDED."scenario",
          "status" = EXCLUDED."status",
          "startedAt" = EXCLUDED."startedAt",
          "completedAt" = EXCLUDED."completedAt",
          "durationSeconds" = EXCLUDED."durationSeconds",
          "rollbackPath" = EXCLUDED."rollbackPath",
          "resultSummary" = EXCLUDED."resultSummary",
          "notes" = EXCLUDED."notes",
          "updatedAt" = EXCLUDED."updatedAt"`,
        randomUUID(),
        record.drillId,
        record.dataset,
        record.workflowVersionId ?? null,
        record.scenario,
        record.status,
        new Date(record.startedAt),
        record.completedAt ? new Date(record.completedAt) : null,
        record.durationSeconds ?? null,
        record.rollbackPath ?? null,
        record.resultSummary ? JSON.stringify(record.resultSummary) : null,
        record.notes ?? null,
        record.triggeredByUserId,
        new Date(record.createdAt),
        new Date(),
      );
      return true;
    } catch (error) {
      if (this.isRollbackDrillPersistenceMissingTableError(error)) {
        this.disableRollbackDrillPersistence('persist rollback drill', error);
        return false;
      }
      this.logger.error(`Persist rollback drill failed: ${this.stringifyError(error)}`);
      return false;
    }
  }

  private async listPersistedRollbackDrillRecords(
    userId: string,
    page: number,
    pageSize: number,
    options: {
      dataset?: StandardDataset;
      status?: RollbackDrillStatus;
    },
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    storage: 'database';
    items: RollbackDrillRecord[];
  } | null> {
    if (this.rollbackDrillPersistenceUnavailable) {
      return null;
    }

    try {
      const whereParts: string[] = ['"triggeredByUserId" = $1'];
      const whereParams: unknown[] = [userId];

      if (options.dataset) {
        whereParts.push(`"dataset" = $${whereParams.length + 1}`);
        whereParams.push(options.dataset);
      }
      if (options.status) {
        whereParts.push(
          `"status" = $${whereParams.length + 1}::"ReconciliationRollbackDrillStatus"`,
        );
        whereParams.push(options.status);
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const totalRows = await this.prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
        `SELECT COUNT(*)::int AS "total"
         FROM "DataReconciliationRollbackDrill"
         ${whereClause}`,
        ...whereParams,
      );

      const total = Number(totalRows[0]?.total ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await this.prisma.$queryRawUnsafe<PersistedRollbackDrillRow[]>(
        `SELECT
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
         ${whereClause}
         ORDER BY "createdAt" DESC
         LIMIT $${whereParams.length + 1}
         OFFSET $${whereParams.length + 2}`,
        ...whereParams,
        pageSize,
        offset,
      );

      const items: RollbackDrillRecord[] = rows.map((row) => ({
        drillId: row.drillId,
        dataset: this.normalizeReconciliationDataset(row.dataset) as StandardDataset,
        workflowVersionId: row.workflowVersionId ?? undefined,
        scenario: row.scenario,
        status: this.normalizeRollbackDrillStatus(row.status),
        startedAt: this.toIsoString(row.startedAt) ?? new Date().toISOString(),
        completedAt: this.toIsoString(row.completedAt),
        durationSeconds: this.parseNonNegativeInteger(row.durationSeconds),
        rollbackPath: row.rollbackPath ?? undefined,
        resultSummary: this.parseJsonValue<Record<string, unknown>>(row.resultSummary),
        notes: row.notes ?? undefined,
        triggeredByUserId: row.triggeredByUserId,
        createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
      }));

      return {
        page,
        pageSize,
        total,
        totalPages,
        storage: 'database',
        items,
      };
    } catch (error) {
      if (this.isRollbackDrillPersistenceMissingTableError(error)) {
        this.disableRollbackDrillPersistence('list rollback drills', error);
        return null;
      }
      this.logger.error(`List rollback drills failed: ${this.stringifyError(error)}`);
      return null;
    }
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

  private async queryReconciliationJobsInWindow(
    dataset: StandardDataset,
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    records: ReconciliationWindowJobRecord[];
    source: 'database' | 'in-memory';
  }> {
    if (!this.reconciliationPersistenceUnavailable) {
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
          const createdAt = this.toIsoString(row.createdAt);
          if (!createdAt) {
            continue;
          }

          records.push({
            jobId: row.jobId,
            status: this.normalizeReconciliationStatus(row.status),
            summaryPass: this.parseOptionalBoolean(row.summaryPass),
            createdAt,
            source: 'database',
          });
        }

        return {
          records,
          source: 'database',
        };
      } catch (error) {
        if (this.isReconciliationPersistenceMissingTableError(error)) {
          this.disableReconciliationPersistence('query reconciliation jobs in window', error);
        } else {
          this.logger.error(
            `Query reconciliation jobs in window failed: ${this.stringifyError(error)}`,
          );
        }
      }
    }

    const records: ReconciliationWindowJobRecord[] = [];
    for (const job of this.reconciliationJobs.values()) {
      if (job.dataset !== dataset) {
        continue;
      }

      const createdAt = this.toIsoString(job.createdAt);
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

  private toUtcDateKey(value: string | Date | unknown): string {
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return parsed.toISOString().slice(0, 10);
  }

  private async resolveWorkflowReconciliationGateEnabled(): Promise<boolean> {
    try {
      const setting = await this.configService.getWorkflowReconciliationGateEnabled();
      return setting.enabled;
    } catch {
      const fallback = this.parseOptionalBoolean(process.env.WORKFLOW_RECONCILIATION_GATE_ENABLED);
      if (fallback !== undefined) {
        this.logger.warn('读取 workflow reconciliation gate 开关失败，回退环境变量');
        return fallback;
      }
      return false;
    }
  }

  private async resolveWorkflowReconciliationMaxAgeMinutes(): Promise<number> {
    try {
      const setting = await this.configService.getWorkflowReconciliationMaxAgeMinutes();
      if (setting.value > 0) {
        return setting.value;
      }
    } catch {
      const fallback = this.parsePositiveInteger(
        process.env.WORKFLOW_RECONCILIATION_MAX_AGE_MINUTES,
      );
      if (fallback !== null) {
        this.logger.warn('读取 workflow reconciliation max age 失败，回退环境变量');
        return fallback;
      }
    }

    return 1440;
  }

  private parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (Number.isInteger(value) && value > 0) {
        return value;
      }
      return null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private parseNonNegativeInteger(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = this.parseFiniteNumber(value);
    if (parsed === undefined) {
      return undefined;
    }
    const int = Math.trunc(parsed);
    if (int < 0) {
      return undefined;
    }
    return int;
  }

  private normalizeCoverageRate(value: unknown, fallback: number): number {
    const parsed = this.parseFiniteNumber(value);
    if (parsed === undefined) {
      return fallback;
    }
    if (parsed < 0) {
      return 0;
    }
    if (parsed > 1) {
      return 1;
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

  private parseInteger(value: unknown): number {
    const parsed = this.parseFiniteNumber(value);
    if (parsed === undefined) {
      return 0;
    }
    const int = Math.trunc(parsed);
    return int >= 0 ? int : 0;
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

  private normalizeRollbackDrillStatus(status: string | undefined): RollbackDrillStatus {
    if (
      status === 'PLANNED' ||
      status === 'RUNNING' ||
      status === 'PASSED' ||
      status === 'FAILED'
    ) {
      return status;
    }
    return 'PASSED';
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

  private isReconciliationDailyMetricsPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTarget = message.includes('datareconciliationdailymetric');
    const missingTableHint =
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column') ||
      message.includes('undefined') ||
      message.includes('42703') ||
      message.includes('42704') ||
      message.includes('p2021');
    return containsTarget && missingTableHint;
  }

  private isRollbackDrillPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTarget =
      message.includes('datareconciliationrollbackdrill') ||
      message.includes('reconciliationrollbackdrillstatus');
    const missingTableHint =
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column') ||
      message.includes('undefined') ||
      message.includes('42703') ||
      message.includes('42704') ||
      message.includes('p2021') ||
      message.includes('invalid input value for enum');
    return containsTarget && missingTableHint;
  }

  private isM1ReadinessReportPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTarget = message.includes('datareconciliationm1readinessreport');
    const missingTableHint =
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column') ||
      message.includes('undefined') ||
      message.includes('42703') ||
      message.includes('42704') ||
      message.includes('p2021');
    return containsTarget && missingTableHint;
  }

  private isCutoverDecisionPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTarget =
      message.includes('datareconciliationcutoverdecision') ||
      message.includes('reconciliationcutoverdecisionstatus');
    const missingTableHint =
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column') ||
      message.includes('undefined') ||
      message.includes('42703') ||
      message.includes('42704') ||
      message.includes('p2021') ||
      message.includes('invalid input value for enum');
    return containsTarget && missingTableHint;
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

  private disableReconciliationDailyMetricsPersistence(operation: string, error: unknown) {
    if (this.reconciliationDailyMetricsPersistenceUnavailable) {
      return;
    }
    this.reconciliationDailyMetricsPersistenceUnavailable = true;
    this.logger.warn(
      `Reconciliation daily metrics persistence disabled (${operation}): ${this.stringifyError(error)}`,
    );
  }

  private disableRollbackDrillPersistence(operation: string, error: unknown) {
    if (this.rollbackDrillPersistenceUnavailable) {
      return;
    }
    this.rollbackDrillPersistenceUnavailable = true;
    this.logger.warn(
      `Rollback drill persistence disabled (${operation}): ${this.stringifyError(error)}`,
    );
  }

  private disableM1ReadinessReportPersistence(operation: string, error: unknown) {
    if (this.m1ReadinessReportPersistenceUnavailable) {
      return;
    }
    this.m1ReadinessReportPersistenceUnavailable = true;
    this.logger.warn(
      `M1 readiness report persistence disabled (${operation}): ${this.stringifyError(error)}`,
    );
  }

  private disableCutoverDecisionPersistence(operation: string, error: unknown) {
    if (this.cutoverDecisionPersistenceUnavailable) {
      return;
    }
    this.cutoverDecisionPersistenceUnavailable = true;
    this.logger.warn(
      `Cutover decision persistence disabled (${operation}): ${this.stringifyError(error)}`,
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
