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
  ListReconciliationCutoverCompensationBatchesQueryDto,
  ListReconciliationCutoverDecisionsQueryDto,
  ListReconciliationCutoverExecutionsQueryDto,
  ListReconciliationM1ReadinessReportSnapshotsQueryDto,
  ReconciliationCutoverCompensationBatchReportQueryDto,
  ReconciliationCutoverExecutionOverviewQueryDto,
  ReconciliationCutoverRuntimeStatusQueryDto,
  ReconciliationRollbackDrillStatus,
  ReconciliationDataset,
  RetryReconciliationCutoverCompensationBatchDto,
  RetryReconciliationCutoverCompensationDto,
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
type ReconciliationCutoverExecutionAction = 'CUTOVER' | 'ROLLBACK' | 'AUTOPILOT';
type ReconciliationCutoverExecutionStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'COMPENSATED';
type ReconciliationCutoverCompensationBatchStatus = 'DRY_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
type ReconciliationCutoverCompensationSweepScope = 'USER' | 'GLOBAL';
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

interface StandardizedDataQualityScore {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D';
  dimensions: {
    completeness: number;
    timeliness: number;
    consistency: number;
  };
}

interface StandardizedDataFreshness {
  status: 'FRESH' | 'STALE' | 'OUTDATED' | 'UNKNOWN';
  degradeSeverity: 'NONE' | 'WARNING' | 'CRITICAL';
  ttlMinutes: number;
  dataLagMinutes?: number;
  newestDataTime?: string;
  oldestDataTime?: string;
}

interface StandardizedDataMeta {
  recordCount: number;
  mappingVersion: string;
  fetchedAt: string;
  degradeAction: 'ALLOW' | 'WARN' | 'BLOCK';
  qualityScore: StandardizedDataQualityScore;
  freshness: StandardizedDataFreshness;
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

interface CutoverRuntimeConfigSnapshot {
  standardizedRead: boolean;
  reconciliationGate: boolean;
}

interface ReconciliationCutoverExecutionRecord {
  executionId: string;
  action: ReconciliationCutoverExecutionAction;
  status: ReconciliationCutoverExecutionStatus;
  requestedByUserId: string;
  datasets: StandardDataset[];
  decisionId?: string;
  decisionStatus?: ReconciliationCutoverDecisionStatus;
  applied: boolean;
  configBefore?: CutoverRuntimeConfigSnapshot;
  configAfter?: CutoverRuntimeConfigSnapshot;
  stepTrace: Array<Record<string, unknown>>;
  errorMessage?: string;
  compensationApplied: boolean;
  compensationAt?: string;
  compensationPayload?: Record<string, unknown>;
  compensationError?: string;
  createdAt: string;
}

interface PersistedReconciliationCutoverExecutionRow {
  executionId: string;
  action: string;
  status: string;
  requestedByUserId: string;
  datasets: unknown;
  decisionId: string | null;
  decisionStatus: string | null;
  applied: unknown;
  configBefore: unknown;
  configAfter: unknown;
  stepTrace: unknown;
  errorMessage: string | null;
  compensationApplied: unknown;
  compensationAt: unknown;
  compensationPayload: unknown;
  compensationError: string | null;
  createdAt: unknown;
}

interface ReconciliationCutoverCompensationBatchResultItem {
  executionId: string;
  action: ReconciliationCutoverExecutionAction;
  statusBefore: 'FAILED' | 'PARTIAL';
  compensated: boolean;
  compensationExecutionId?: string;
  reason?: string;
  error?: string;
}

interface ReconciliationCutoverCompensationBatchControl {
  maxConcurrency: number;
  perExecutionTimeoutMs: number;
  stopOnFailureCount?: number;
  stopOnFailureRate?: number;
  minProcessedForFailureRate: number;
}

interface ReconciliationCutoverCompensationBatchSummary {
  compensated: number;
  failed: number;
  skipped: number;
  processed: number;
  breakerTriggered: boolean;
  breakerReason?: string;
}

interface ReconciliationCutoverCompensationBatchResponse {
  batchId: string;
  status: ReconciliationCutoverCompensationBatchStatus;
  replayed: boolean;
  generatedAt: string;
  dryRun: boolean;
  windowDays: number;
  datasets: StandardDataset[];
  idempotencyKey?: string;
  requestedLimit: number;
  storage: 'database' | 'in-memory';
  control: ReconciliationCutoverCompensationBatchControl;
  scanned: number;
  matched: number;
  attempted: number;
  results: ReconciliationCutoverCompensationBatchResultItem[];
  summary: ReconciliationCutoverCompensationBatchSummary;
}

interface ReconciliationCutoverCompensationSweepRun {
  userId: string;
  batchId: string;
  status: ReconciliationCutoverCompensationBatchStatus;
  replayed: boolean;
  attempted: number;
  summary: ReconciliationCutoverCompensationBatchSummary;
}

interface ReconciliationCutoverCompensationBatchRecord {
  batchId: string;
  status: ReconciliationCutoverCompensationBatchStatus;
  dryRun: boolean;
  replayed: boolean;
  idempotencyKey?: string;
  requestedByUserId: string;
  windowDays: number;
  datasets: StandardDataset[];
  requestedLimit: number;
  disableReconciliationGate: boolean;
  workflowVersionId?: string;
  note?: string;
  reason?: string;
  storage: 'database' | 'in-memory';
  control: ReconciliationCutoverCompensationBatchControl;
  scanned: number;
  matched: number;
  attempted: number;
  results: ReconciliationCutoverCompensationBatchResultItem[];
  summary: ReconciliationCutoverCompensationBatchSummary;
  createdAt: string;
}

interface PersistedReconciliationCutoverCompensationBatchRow {
  batchId: string;
  status: string;
  dryRun: unknown;
  replayed: unknown;
  idempotencyKey: string | null;
  requestedByUserId: string;
  windowDays: unknown;
  datasets: unknown;
  requestedLimit: unknown;
  disableReconciliationGate: unknown;
  workflowVersionId: string | null;
  note: string | null;
  reason: string | null;
  storage: string;
  control: unknown;
  scanned: unknown;
  matched: unknown;
  attempted: unknown;
  results: unknown;
  summary: unknown;
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
  private readonly cutoverExecutionRecords = new Map<
    string,
    ReconciliationCutoverExecutionRecord
  >();
  private readonly cutoverCompensationBatchRecords = new Map<
    string,
    ReconciliationCutoverCompensationBatchRecord
  >();
  private readonly cutoverCompensationBatchInFlight = new Map<
    string,
    Promise<ReconciliationCutoverCompensationBatchResponse>
  >();
  private reconciliationPersistenceUnavailable = false;
  private reconciliationDailyMetricsPersistenceUnavailable = false;
  private rollbackDrillPersistenceUnavailable = false;
  private m1ReadinessReportPersistenceUnavailable = false;
  private cutoverDecisionPersistenceUnavailable = false;
  private cutoverExecutionPersistenceUnavailable = false;
  private cutoverCompensationBatchPersistenceUnavailable = false;

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
    executionId: string;
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
    const executionId = randomUUID();
    const createdAt = new Date().toISOString();
    const stepTrace: Array<Record<string, unknown>> = [];
    const standardizedReadBefore = await this.configService.getWorkflowStandardizedReadMode();
    const reconciliationGateBefore =
      await this.configService.getWorkflowReconciliationGateEnabled();

    let standardizedReadAfter = standardizedReadBefore;
    let reconciliationGateAfter = reconciliationGateBefore;

    let decision: ReconciliationCutoverDecisionResult | null = null;

    try {
      decision = await this.createReconciliationCutoverDecision(userId, dto);
      stepTrace.push({
        step: 'create_cutover_decision',
        status: 'SUCCESS',
        at: new Date().toISOString(),
        detail: {
          decisionId: decision.decisionId,
          decisionStatus: decision.status,
        },
      });

      let applied = false;

      if (decision.status === 'APPROVED') {
        standardizedReadAfter = await this.configService.setWorkflowStandardizedReadMode(
          true,
          userId,
        );
        stepTrace.push({
          step: 'set_standardized_read_true',
          status: 'SUCCESS',
          at: new Date().toISOString(),
        });
        reconciliationGateAfter = await this.configService.setWorkflowReconciliationGateEnabled(
          true,
          userId,
        );
        stepTrace.push({
          step: 'set_reconciliation_gate_true',
          status: 'SUCCESS',
          at: new Date().toISOString(),
        });
        applied = true;
      }

      const record: ReconciliationCutoverExecutionRecord = {
        executionId,
        action: 'CUTOVER',
        status: 'SUCCESS',
        requestedByUserId: userId,
        datasets: decision.datasets,
        decisionId: decision.decisionId,
        decisionStatus: decision.status,
        applied,
        configBefore: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        configAfter: {
          standardizedRead: standardizedReadAfter.enabled,
          reconciliationGate: reconciliationGateAfter.enabled,
        },
        stepTrace,
        compensationApplied: false,
        createdAt,
      };
      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistReconciliationCutoverExecutionRecord(record);

      return {
        executionId,
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
    } catch (error) {
      const latestStandardizedRead = await this.configService
        .getWorkflowStandardizedReadMode()
        .catch(() => standardizedReadAfter);
      const latestReconciliationGate = await this.configService
        .getWorkflowReconciliationGateEnabled()
        .catch(() => reconciliationGateAfter);
      const status: ReconciliationCutoverExecutionStatus =
        latestStandardizedRead.enabled !== standardizedReadBefore.enabled ||
        latestReconciliationGate.enabled !== reconciliationGateBefore.enabled
          ? 'PARTIAL'
          : 'FAILED';

      const record: ReconciliationCutoverExecutionRecord = {
        executionId,
        action: 'CUTOVER',
        status,
        requestedByUserId: userId,
        datasets: decision?.datasets ?? this.resolveRequestedStandardDatasets(dto.datasets),
        decisionId: decision?.decisionId,
        decisionStatus: decision?.status,
        applied:
          latestStandardizedRead.enabled !== standardizedReadBefore.enabled ||
          latestReconciliationGate.enabled !== reconciliationGateBefore.enabled,
        configBefore: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        configAfter: {
          standardizedRead: latestStandardizedRead.enabled,
          reconciliationGate: latestReconciliationGate.enabled,
        },
        stepTrace: [
          ...stepTrace,
          {
            step: 'execute_cutover',
            status: 'FAILED',
            at: new Date().toISOString(),
            detail: {
              message: this.stringifyError(error),
            },
          },
        ],
        errorMessage: this.stringifyError(error),
        compensationApplied: false,
        createdAt,
      };
      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistReconciliationCutoverExecutionRecord(record);
      throw error;
    }
  }

  async executeReconciliationCutoverAutopilot(
    userId: string,
    dto: CreateReconciliationCutoverAutopilotDto,
  ): Promise<{
    executionId: string;
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
    const executionId = randomUUID();
    const createdAt = new Date().toISOString();
    const stepTrace: Array<Record<string, unknown>> = [];
    const standardizedReadBefore = await this.configService.getWorkflowStandardizedReadMode();
    const reconciliationGateBefore =
      await this.configService.getWorkflowReconciliationGateEnabled();
    let standardizedReadAfter = standardizedReadBefore;
    let reconciliationGateAfter = reconciliationGateBefore;
    let decision: ReconciliationCutoverDecisionResult | null = null;

    try {
      decision = await this.createReconciliationCutoverDecision(userId, {
        windowDays: dto.windowDays,
        targetCoverageRate: dto.targetCoverageRate,
        datasets: dto.datasets,
        reportFormat: dto.reportFormat,
        note: dto.note,
      });
      stepTrace.push({
        step: 'create_cutover_decision',
        status: 'SUCCESS',
        at: new Date().toISOString(),
        detail: {
          decisionId: decision.decisionId,
          decisionStatus: decision.status,
        },
      });

      const decisionSummary = {
        decisionId: decision.decisionId,
        status: decision.status,
        reasonCodes: decision.reasonCodes,
        reportSnapshotId: decision.reportSnapshotId,
        createdAt: decision.createdAt,
      };

      if (dto.dryRun) {
        stepTrace.push({
          step: 'dry_run',
          status: 'SUCCESS',
          at: new Date().toISOString(),
        });

        const record: ReconciliationCutoverExecutionRecord = {
          executionId,
          action: 'AUTOPILOT',
          status: 'SUCCESS',
          requestedByUserId: userId,
          datasets: decision.datasets,
          decisionId: decision.decisionId,
          decisionStatus: decision.status,
          applied: false,
          configBefore: {
            standardizedRead: standardizedReadBefore.enabled,
            reconciliationGate: reconciliationGateBefore.enabled,
          },
          configAfter: {
            standardizedRead: standardizedReadBefore.enabled,
            reconciliationGate: reconciliationGateBefore.enabled,
          },
          stepTrace: [...stepTrace],
          compensationApplied: false,
          createdAt,
        };
        this.cutoverExecutionRecords.set(executionId, record);
        await this.persistReconciliationCutoverExecutionRecord(record);

        return {
          executionId,
          executedAt: new Date().toISOString(),
          action: 'NONE',
          dryRun: true,
          decision: decisionSummary,
        };
      }

      if (decision.status === 'APPROVED') {
        standardizedReadAfter = await this.configService.setWorkflowStandardizedReadMode(
          true,
          userId,
        );
        stepTrace.push({
          step: 'set_standardized_read_true',
          status: 'SUCCESS',
          at: new Date().toISOString(),
        });

        reconciliationGateAfter = await this.configService.setWorkflowReconciliationGateEnabled(
          true,
          userId,
        );
        stepTrace.push({
          step: 'set_reconciliation_gate_true',
          status: 'SUCCESS',
          at: new Date().toISOString(),
        });

        const applied =
          standardizedReadBefore.enabled !== standardizedReadAfter.enabled ||
          reconciliationGateBefore.enabled !== reconciliationGateAfter.enabled;

        stepTrace.push({
          step: 'autopilot_cutover',
          status: 'SUCCESS',
          at: new Date().toISOString(),
          detail: {
            applied,
          },
        });

        const record: ReconciliationCutoverExecutionRecord = {
          executionId,
          action: 'AUTOPILOT',
          status: 'SUCCESS',
          requestedByUserId: userId,
          datasets: decision.datasets,
          decisionId: decision.decisionId,
          decisionStatus: decision.status,
          applied,
          configBefore: {
            standardizedRead: standardizedReadBefore.enabled,
            reconciliationGate: reconciliationGateBefore.enabled,
          },
          configAfter: {
            standardizedRead: standardizedReadAfter.enabled,
            reconciliationGate: reconciliationGateAfter.enabled,
          },
          stepTrace: [...stepTrace],
          compensationApplied: false,
          createdAt,
        };
        this.cutoverExecutionRecords.set(executionId, record);
        await this.persistReconciliationCutoverExecutionRecord(record);

        return {
          executionId,
          executedAt: new Date().toISOString(),
          action: 'CUTOVER',
          dryRun: false,
          decision: decisionSummary,
          cutover: {
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

        standardizedReadAfter = {
          ...standardizedReadAfter,
          enabled: rollback.config.standardizedRead.after,
        };
        reconciliationGateAfter = {
          ...reconciliationGateAfter,
          enabled: rollback.config.reconciliationGate.after,
        };

        stepTrace.push({
          step: 'autopilot_rejected_rollback',
          status: 'SUCCESS',
          at: new Date().toISOString(),
          detail: {
            rollbackExecutionId: rollback.executionId,
          },
        });

        const record: ReconciliationCutoverExecutionRecord = {
          executionId,
          action: 'AUTOPILOT',
          status: 'SUCCESS',
          requestedByUserId: userId,
          datasets: decision.datasets,
          decisionId: decision.decisionId,
          decisionStatus: decision.status,
          applied: rollback.applied,
          configBefore: {
            standardizedRead: standardizedReadBefore.enabled,
            reconciliationGate: reconciliationGateBefore.enabled,
          },
          configAfter: {
            standardizedRead: rollback.config.standardizedRead.after,
            reconciliationGate: rollback.config.reconciliationGate.after,
          },
          stepTrace: [...stepTrace],
          compensationApplied: false,
          createdAt,
        };
        this.cutoverExecutionRecords.set(executionId, record);
        await this.persistReconciliationCutoverExecutionRecord(record);

        return {
          executionId,
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

      stepTrace.push({
        step: 'autopilot_no_action',
        status: 'SUCCESS',
        at: new Date().toISOString(),
      });

      const record: ReconciliationCutoverExecutionRecord = {
        executionId,
        action: 'AUTOPILOT',
        status: 'SUCCESS',
        requestedByUserId: userId,
        datasets: decision.datasets,
        decisionId: decision.decisionId,
        decisionStatus: decision.status,
        applied: false,
        configBefore: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        configAfter: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        stepTrace: [...stepTrace],
        compensationApplied: false,
        createdAt,
      };
      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistReconciliationCutoverExecutionRecord(record);

      return {
        executionId,
        executedAt: new Date().toISOString(),
        action: 'NONE',
        dryRun: false,
        decision: decisionSummary,
      };
    } catch (error) {
      const latestStandardizedRead = await this.configService
        .getWorkflowStandardizedReadMode()
        .catch(() => standardizedReadAfter);
      const latestReconciliationGate = await this.configService
        .getWorkflowReconciliationGateEnabled()
        .catch(() => reconciliationGateAfter);
      const applied =
        latestStandardizedRead.enabled !== standardizedReadBefore.enabled ||
        latestReconciliationGate.enabled !== reconciliationGateBefore.enabled;
      const status: ReconciliationCutoverExecutionStatus = applied ? 'PARTIAL' : 'FAILED';

      const record: ReconciliationCutoverExecutionRecord = {
        executionId,
        action: 'AUTOPILOT',
        status,
        requestedByUserId: userId,
        datasets: decision?.datasets ?? this.resolveRequestedStandardDatasets(dto.datasets),
        decisionId: decision?.decisionId,
        decisionStatus: decision?.status,
        applied,
        configBefore: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        configAfter: {
          standardizedRead: latestStandardizedRead.enabled,
          reconciliationGate: latestReconciliationGate.enabled,
        },
        stepTrace: [
          ...stepTrace,
          {
            step: 'execute_autopilot',
            status: 'FAILED',
            at: new Date().toISOString(),
            detail: {
              message: this.stringifyError(error),
            },
          },
        ],
        errorMessage: this.stringifyError(error),
        compensationApplied: false,
        createdAt,
      };

      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistReconciliationCutoverExecutionRecord(record);
      throw error;
    }
  }

  async executeReconciliationRollback(
    userId: string,
    dto: ExecuteReconciliationRollbackDto,
  ): Promise<{
    executionId: string;
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
    const executionId = randomUUID();
    const createdAt = new Date().toISOString();
    const stepTrace: Array<Record<string, unknown>> = [];
    const datasets = this.resolveRequestedStandardDatasets(dto.datasets as StandardDataset[]);
    const standardizedReadBefore = await this.configService.getWorkflowStandardizedReadMode();
    const reconciliationGateBefore =
      await this.configService.getWorkflowReconciliationGateEnabled();

    let standardizedReadAfter = standardizedReadBefore;
    let reconciliationGateAfter = reconciliationGateBefore;
    const shouldDisableGate = dto.disableReconciliationGate ?? true;
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

    try {
      standardizedReadAfter = await this.configService.setWorkflowStandardizedReadMode(
        false,
        userId,
      );
      stepTrace.push({
        step: 'set_standardized_read_false',
        status: 'SUCCESS',
        at: new Date().toISOString(),
      });

      reconciliationGateAfter = shouldDisableGate
        ? await this.configService.setWorkflowReconciliationGateEnabled(false, userId)
        : reconciliationGateBefore;
      stepTrace.push({
        step: shouldDisableGate ? 'set_reconciliation_gate_false' : 'keep_reconciliation_gate',
        status: 'SUCCESS',
        at: new Date().toISOString(),
      });

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

      const record: ReconciliationCutoverExecutionRecord = {
        executionId,
        action: 'ROLLBACK',
        status: 'SUCCESS',
        requestedByUserId: userId,
        datasets,
        applied,
        configBefore: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        configAfter: {
          standardizedRead: standardizedReadAfter.enabled,
          reconciliationGate: reconciliationGateAfter.enabled,
        },
        stepTrace,
        compensationApplied: false,
        createdAt,
      };

      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistReconciliationCutoverExecutionRecord(record);

      return {
        executionId,
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
    } catch (error) {
      const latestStandardizedRead = await this.configService
        .getWorkflowStandardizedReadMode()
        .catch(() => standardizedReadAfter);
      const latestReconciliationGate = await this.configService
        .getWorkflowReconciliationGateEnabled()
        .catch(() => reconciliationGateAfter);

      const status: ReconciliationCutoverExecutionStatus =
        latestStandardizedRead.enabled !== standardizedReadBefore.enabled ||
        latestReconciliationGate.enabled !== reconciliationGateBefore.enabled
          ? 'PARTIAL'
          : 'FAILED';

      const record: ReconciliationCutoverExecutionRecord = {
        executionId,
        action: 'ROLLBACK',
        status,
        requestedByUserId: userId,
        datasets,
        applied:
          latestStandardizedRead.enabled !== standardizedReadBefore.enabled ||
          latestReconciliationGate.enabled !== reconciliationGateBefore.enabled,
        configBefore: {
          standardizedRead: standardizedReadBefore.enabled,
          reconciliationGate: reconciliationGateBefore.enabled,
        },
        configAfter: {
          standardizedRead: latestStandardizedRead.enabled,
          reconciliationGate: latestReconciliationGate.enabled,
        },
        stepTrace: [
          ...stepTrace,
          {
            step: 'execute_rollback',
            status: 'FAILED',
            at: new Date().toISOString(),
            detail: {
              message: this.stringifyError(error),
            },
          },
        ],
        errorMessage: this.stringifyError(error),
        compensationApplied: false,
        createdAt,
      };

      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistReconciliationCutoverExecutionRecord(record);
      throw error;
    }
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
    executionHealth: {
      windowDays: number;
      compensationPendingExecutions: number;
      hasCompensationBacklog: boolean;
      latestCompensationPendingExecution: {
        executionId: string;
        action: ReconciliationCutoverExecutionAction;
        status: 'FAILED' | 'PARTIAL';
        createdAt: string;
      } | null;
    };
    summary: {
      standardizedReadEnabled: boolean;
      reconciliationGateEnabled: boolean;
      hasRecentRollbackEvidenceAllDatasets: boolean;
      latestDecisionApproved: boolean;
      hasUncompensatedExecutionFailure: boolean;
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
    const executionOverview = await this.getReconciliationCutoverExecutionOverview(userId, {
      windowDays: 7,
      datasets,
      pendingLimit: 1,
    });
    const hasUncompensatedExecutionFailure =
      executionOverview.summary.compensationPendingExecutions > 0;
    const recommendsRollback =
      standardizedRead.enabled &&
      (!latestDecisionApproved ||
        !hasRecentRollbackEvidenceAllDatasets ||
        hasUncompensatedExecutionFailure);

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
      executionHealth: {
        windowDays: executionOverview.windowDays,
        compensationPendingExecutions: executionOverview.summary.compensationPendingExecutions,
        hasCompensationBacklog: hasUncompensatedExecutionFailure,
        latestCompensationPendingExecution: executionOverview.latestCompensationPending[0] ?? null,
      },
      summary: {
        standardizedReadEnabled: standardizedRead.enabled,
        reconciliationGateEnabled: reconciliationGate.enabled,
        hasRecentRollbackEvidenceAllDatasets,
        latestDecisionApproved,
        hasUncompensatedExecutionFailure,
        recommendsRollback,
      },
    };
  }

  async getReconciliationCutoverExecutionOverview(
    userId: string,
    query: ReconciliationCutoverExecutionOverviewQueryDto,
  ): Promise<{
    generatedAt: string;
    windowDays: number;
    datasets: StandardDataset[];
    storage: 'database' | 'in-memory';
    summary: {
      totalExecutions: number;
      successExecutions: number;
      failedExecutions: number;
      partialExecutions: number;
      compensatedExecutions: number;
      compensationPendingExecutions: number;
      compensationCoverageRate: number;
    };
    byAction: Array<{
      action: ReconciliationCutoverExecutionAction;
      total: number;
      success: number;
      failed: number;
      partial: number;
      compensated: number;
      compensationPending: number;
    }>;
    latestCompensationPending: Array<{
      executionId: string;
      action: ReconciliationCutoverExecutionAction;
      status: 'FAILED' | 'PARTIAL';
      createdAt: string;
      datasets: StandardDataset[];
      errorMessage?: string;
      compensationError?: string;
    }>;
  }> {
    const windowDays = Math.max(1, Math.min(30, query.windowDays ?? 7));
    const pendingLimit = Math.max(1, Math.min(100, query.pendingLimit ?? 20));
    const datasets = this.resolveRequestedStandardDatasets(query.datasets as StandardDataset[]);
    const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const windowStart = new Date(windowStartMs);

    const persistedRecords = await this.listRecentPersistedReconciliationCutoverExecutions(
      userId,
      windowStart,
    );

    const storage = persistedRecords ? ('database' as const) : ('in-memory' as const);
    const sourceRecords = persistedRecords
      ? persistedRecords
      : Array.from(this.cutoverExecutionRecords.values()).filter(
          (item) =>
            item.requestedByUserId === userId &&
            this.toTimestampMs(item.createdAt) >= windowStartMs,
        );

    const filteredRecords = sourceRecords
      .filter((item) => this.recordHasCutoverDataset(item, datasets))
      .sort((a, b) => this.toTimestampMs(b.createdAt) - this.toTimestampMs(a.createdAt));

    const summary = {
      totalExecutions: filteredRecords.length,
      successExecutions: filteredRecords.filter((item) => item.status === 'SUCCESS').length,
      failedExecutions: filteredRecords.filter((item) => item.status === 'FAILED').length,
      partialExecutions: filteredRecords.filter((item) => item.status === 'PARTIAL').length,
      compensatedExecutions: filteredRecords.filter((item) => item.status === 'COMPENSATED').length,
      compensationPendingExecutions: filteredRecords.filter((item) =>
        this.isCutoverExecutionCompensationPending(item),
      ).length,
      compensationCoverageRate: 1,
    };

    const requiringCompensationTotal =
      summary.failedExecutions + summary.partialExecutions + summary.compensatedExecutions;
    summary.compensationCoverageRate =
      requiringCompensationTotal <= 0
        ? 1
        : Number((summary.compensatedExecutions / requiringCompensationTotal).toFixed(4));

    const actionOrder: ReconciliationCutoverExecutionAction[] = [
      'CUTOVER',
      'ROLLBACK',
      'AUTOPILOT',
    ];
    const byAction = actionOrder.map((action) => {
      const actionRecords = filteredRecords.filter((item) => item.action === action);
      return {
        action,
        total: actionRecords.length,
        success: actionRecords.filter((item) => item.status === 'SUCCESS').length,
        failed: actionRecords.filter((item) => item.status === 'FAILED').length,
        partial: actionRecords.filter((item) => item.status === 'PARTIAL').length,
        compensated: actionRecords.filter((item) => item.status === 'COMPENSATED').length,
        compensationPending: actionRecords.filter((item) =>
          this.isCutoverExecutionCompensationPending(item),
        ).length,
      };
    });

    const latestCompensationPending = filteredRecords
      .filter((item) => this.isCutoverExecutionCompensationPending(item))
      .slice(0, pendingLimit)
      .map((item) => ({
        executionId: item.executionId,
        action: item.action,
        status: item.status as 'FAILED' | 'PARTIAL',
        createdAt: item.createdAt,
        datasets: item.datasets,
        errorMessage: item.errorMessage,
        compensationError: item.compensationError,
      }));

    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      datasets,
      storage,
      summary,
      byAction,
      latestCompensationPending,
    };
  }

  async listReconciliationCutoverExecutions(
    userId: string,
    query: ListReconciliationCutoverExecutionsQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const persisted = await this.listPersistedReconciliationCutoverExecutions(
      userId,
      page,
      pageSize,
      {
        action: query.action,
        status: query.status,
      },
    );
    if (persisted) {
      return persisted;
    }

    const filtered = Array.from(this.cutoverExecutionRecords.values())
      .filter((item) => item.requestedByUserId === userId)
      .filter((item) => (!query.action ? true : item.action === query.action))
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

  async getReconciliationCutoverExecution(userId: string, executionId: string) {
    const persisted = await this.findPersistedReconciliationCutoverExecution(executionId);
    if (persisted) {
      if (persisted.requestedByUserId !== userId) {
        throw new ForbiddenException('no permission to access this cutover execution');
      }
      return {
        ...persisted,
        storage: 'database' as const,
      };
    }

    const local = this.cutoverExecutionRecords.get(executionId);
    if (!local) {
      throw new NotFoundException('cutover execution not found');
    }
    if (local.requestedByUserId !== userId) {
      throw new ForbiddenException('no permission to access this cutover execution');
    }

    return {
      ...local,
      storage: 'in-memory' as const,
    };
  }

  async retryReconciliationCutoverExecutionCompensation(
    userId: string,
    executionId: string,
    dto: RetryReconciliationCutoverCompensationDto,
  ) {
    const execution = await this.getReconciliationCutoverExecution(userId, executionId);

    const shouldCompensate = execution.status === 'FAILED' || execution.status === 'PARTIAL';
    if (!shouldCompensate) {
      return {
        executionId: execution.executionId,
        compensated: false,
        reason: 'execution_status_not_compensatable',
        execution,
      };
    }

    let rollback: {
      executionId: string;
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
    };
    try {
      rollback = await this.executeReconciliationRollback(userId, {
        datasets: execution.datasets,
        workflowVersionId: dto.workflowVersionId,
        disableReconciliationGate: dto.disableReconciliationGate,
        note: dto.note,
        reason: dto.reason ?? 'manual_compensation',
      });
    } catch (error) {
      const failedCompensationRecord: ReconciliationCutoverExecutionRecord = {
        executionId: execution.executionId,
        action: execution.action,
        status: execution.status === 'PARTIAL' ? 'PARTIAL' : 'FAILED',
        requestedByUserId: execution.requestedByUserId,
        datasets: execution.datasets,
        decisionId: execution.decisionId,
        decisionStatus: execution.decisionStatus,
        applied: execution.applied,
        configBefore: execution.configBefore,
        configAfter: execution.configAfter,
        stepTrace: [
          ...(Array.isArray(execution.stepTrace) ? execution.stepTrace : []),
          {
            step: 'manual_compensation',
            status: 'FAILED',
            at: new Date().toISOString(),
            detail: {
              message: this.stringifyError(error),
            },
          },
        ],
        errorMessage: execution.errorMessage,
        compensationApplied: false,
        compensationAt: execution.compensationAt,
        compensationPayload: execution.compensationPayload,
        compensationError: this.stringifyError(error),
        createdAt: execution.createdAt,
      };

      this.cutoverExecutionRecords.set(
        failedCompensationRecord.executionId,
        failedCompensationRecord,
      );
      await this.persistReconciliationCutoverExecutionRecord(failedCompensationRecord);
      throw error;
    }

    const updatedRecord: ReconciliationCutoverExecutionRecord = {
      executionId: execution.executionId,
      action: execution.action,
      status: 'COMPENSATED',
      requestedByUserId: execution.requestedByUserId,
      datasets: execution.datasets,
      decisionId: execution.decisionId,
      decisionStatus: execution.decisionStatus,
      applied: execution.applied,
      configBefore: execution.configBefore,
      configAfter: {
        standardizedRead: rollback.config.standardizedRead.after,
        reconciliationGate: rollback.config.reconciliationGate.after,
      },
      stepTrace: [
        ...(Array.isArray(execution.stepTrace) ? execution.stepTrace : []),
        {
          step: 'manual_compensation',
          status: 'SUCCESS',
          at: new Date().toISOString(),
          detail: {
            compensationExecutionId: rollback.executionId,
            rollbackDrillCount: rollback.rollbackDrills.length,
          },
        },
      ],
      errorMessage: execution.errorMessage,
      compensationApplied: true,
      compensationAt: rollback.executedAt,
      compensationPayload: {
        compensationExecutionId: rollback.executionId,
        rollbackDrills: rollback.rollbackDrills,
      },
      compensationError: undefined,
      createdAt: execution.createdAt,
    };

    this.cutoverExecutionRecords.set(updatedRecord.executionId, updatedRecord);
    await this.persistReconciliationCutoverExecutionRecord(updatedRecord);

    return {
      executionId: updatedRecord.executionId,
      compensated: true,
      compensationExecutionId: rollback.executionId,
      execution: {
        ...updatedRecord,
        storage: execution.storage,
      },
    };
  }

  async retryReconciliationCutoverExecutionCompensationBatch(
    userId: string,
    dto: RetryReconciliationCutoverCompensationBatchDto,
  ): Promise<ReconciliationCutoverCompensationBatchResponse> {
    const windowDays = Math.max(1, Math.min(30, dto.windowDays ?? 7));
    const limit = Math.max(1, Math.min(100, dto.limit ?? 20));
    const maxConcurrency = Math.max(1, Math.min(10, dto.maxConcurrency ?? 3));
    const perExecutionTimeoutMs = Math.max(
      1000,
      Math.min(120000, dto.perExecutionTimeoutMs ?? 30000),
    );
    const stopOnFailureCount = dto.stopOnFailureCount;
    const stopOnFailureRate = dto.stopOnFailureRate;
    const minProcessedForFailureRate = Math.max(
      1,
      Math.min(100, dto.minProcessedForFailureRate ?? 3),
    );
    const datasets = this.resolveRequestedStandardDatasets(dto.datasets as StandardDataset[]);
    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
    const control: ReconciliationCutoverCompensationBatchControl = {
      maxConcurrency,
      perExecutionTimeoutMs,
      stopOnFailureCount,
      stopOnFailureRate,
      minProcessedForFailureRate,
    };

    if (idempotencyKey) {
      const inFlightKey = this.buildCompensationBatchInFlightKey(userId, idempotencyKey);
      const inFlight = this.cutoverCompensationBatchInFlight.get(inFlightKey);
      if (inFlight) {
        const response = await inFlight;
        return {
          ...response,
          replayed: true,
        };
      }

      const existing = await this.findReconciliationCutoverCompensationBatchByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (existing) {
        return this.toReconciliationCutoverCompensationBatchResponse(existing, true);
      }

      const runPromise = this.executeReconciliationCutoverCompensationBatch({
        userId,
        dto,
        windowDays,
        datasets,
        limit,
        idempotencyKey,
        control,
      });
      this.cutoverCompensationBatchInFlight.set(inFlightKey, runPromise);
      try {
        return await runPromise;
      } finally {
        this.cutoverCompensationBatchInFlight.delete(inFlightKey);
      }
    }

    return this.executeReconciliationCutoverCompensationBatch({
      userId,
      dto,
      windowDays,
      datasets,
      limit,
      idempotencyKey,
      control,
    });
  }

  private async executeReconciliationCutoverCompensationBatch(input: {
    userId: string;
    dto: RetryReconciliationCutoverCompensationBatchDto;
    windowDays: number;
    datasets: StandardDataset[];
    limit: number;
    idempotencyKey?: string;
    control: ReconciliationCutoverCompensationBatchControl;
  }): Promise<ReconciliationCutoverCompensationBatchResponse> {
    const { userId, dto, windowDays, datasets, limit, idempotencyKey, control } = input;
    const { maxConcurrency, perExecutionTimeoutMs, stopOnFailureCount, stopOnFailureRate } =
      control;
    const minProcessedForFailureRate = control.minProcessedForFailureRate;

    const batchId = randomUUID();
    const createdAt = new Date().toISOString();

    const overview = await this.getReconciliationCutoverExecutionOverview(userId, {
      windowDays,
      datasets,
      pendingLimit: limit,
    });
    const candidates = overview.latestCompensationPending.slice(0, limit);

    if (dto.dryRun) {
      const record: ReconciliationCutoverCompensationBatchRecord = {
        batchId,
        status: 'DRY_RUN',
        dryRun: true,
        replayed: false,
        idempotencyKey,
        requestedByUserId: userId,
        windowDays,
        datasets,
        requestedLimit: limit,
        disableReconciliationGate: dto.disableReconciliationGate,
        workflowVersionId: dto.workflowVersionId,
        note: dto.note,
        reason: dto.reason,
        storage: overview.storage,
        control,
        scanned: overview.summary.totalExecutions,
        matched: overview.summary.compensationPendingExecutions,
        attempted: 0,
        results: candidates.map(
          (item): ReconciliationCutoverCompensationBatchResultItem => ({
            executionId: item.executionId,
            action: item.action,
            statusBefore: item.status,
            compensated: false,
            reason: 'dry_run',
          }),
        ),
        summary: {
          compensated: 0,
          failed: 0,
          skipped: candidates.length,
          processed: 0,
          breakerTriggered: false,
        },
        createdAt,
      };

      this.cutoverCompensationBatchRecords.set(record.batchId, record);
      const persisted = await this.persistReconciliationCutoverCompensationBatchRecord(record);
      const recovered = await this.tryRecoverCompensationBatchByIdempotencyKey(
        persisted,
        userId,
        idempotencyKey,
      );
      if (recovered) {
        return recovered;
      }
      return this.toReconciliationCutoverCompensationBatchResponse(record);
    }

    const results: ReconciliationCutoverCompensationBatchResultItem[] = [];
    const candidateOrder = new Map<string, number>(
      candidates.map((item, index) => [item.executionId, index]),
    );
    const startedExecutionIds = new Set<string>();
    let nextCandidateIndex = 0;
    let processed = 0;
    let failed = 0;
    let breakerTriggered = false;
    let breakerReason: string | undefined;

    const evaluateCircuitBreaker = () => {
      if (breakerTriggered) {
        return;
      }

      if (stopOnFailureCount !== undefined && failed >= stopOnFailureCount) {
        breakerTriggered = true;
        breakerReason = `failure_count_exceeded:${failed}`;
        return;
      }

      if (
        stopOnFailureRate !== undefined &&
        processed >= minProcessedForFailureRate &&
        processed > 0
      ) {
        const currentFailureRate = failed / processed;
        if (currentFailureRate >= stopOnFailureRate) {
          breakerTriggered = true;
          breakerReason = `failure_rate_exceeded:${currentFailureRate.toFixed(4)}`;
        }
      }
    };

    const workers = Array.from({ length: Math.min(maxConcurrency, candidates.length) }, () =>
      (async () => {
        while (!breakerTriggered) {
          const currentIndex = nextCandidateIndex;
          if (currentIndex >= candidates.length) {
            return;
          }
          nextCandidateIndex += 1;
          const candidate = candidates[currentIndex];
          startedExecutionIds.add(candidate.executionId);

          try {
            const compensation = await this.withTimeout(
              this.retryReconciliationCutoverExecutionCompensation(userId, candidate.executionId, {
                disableReconciliationGate: dto.disableReconciliationGate,
                workflowVersionId: dto.workflowVersionId,
                note: dto.note,
                reason: dto.reason ?? 'batch_compensation',
              }),
              perExecutionTimeoutMs,
              `compensation timeout after ${perExecutionTimeoutMs}ms`,
            );

            if (compensation.compensated) {
              results.push({
                executionId: candidate.executionId,
                action: candidate.action,
                statusBefore: candidate.status,
                compensated: true,
                compensationExecutionId: compensation.compensationExecutionId,
              });
            } else {
              results.push({
                executionId: candidate.executionId,
                action: candidate.action,
                statusBefore: candidate.status,
                compensated: false,
                reason: compensation.reason ?? 'execution_status_not_compensatable',
              });
            }
          } catch (error) {
            failed += 1;
            results.push({
              executionId: candidate.executionId,
              action: candidate.action,
              statusBefore: candidate.status,
              compensated: false,
              error: this.stringifyError(error),
            });
          } finally {
            processed += 1;
            evaluateCircuitBreaker();
          }
        }
      })(),
    );

    await Promise.all(workers);

    if (breakerTriggered) {
      const unprocessed = candidates.filter((item) => !startedExecutionIds.has(item.executionId));
      for (const candidate of unprocessed) {
        results.push({
          executionId: candidate.executionId,
          action: candidate.action,
          statusBefore: candidate.status,
          compensated: false,
          reason: breakerReason ? `circuit_breaker_open:${breakerReason}` : 'circuit_breaker_open',
        });
      }
    }

    results.sort(
      (a, b) =>
        (candidateOrder.get(a.executionId) ?? Number.MAX_SAFE_INTEGER) -
        (candidateOrder.get(b.executionId) ?? Number.MAX_SAFE_INTEGER),
    );

    const summary = {
      compensated: results.filter((item) => item.compensated).length,
      failed: results.filter((item) => !item.compensated && !!item.error).length,
      skipped: results.filter((item) => !item.compensated && !item.error).length,
      processed,
      breakerTriggered,
      breakerReason,
    };

    const status: ReconciliationCutoverCompensationBatchStatus =
      summary.failed === 0 && summary.skipped === 0
        ? 'SUCCESS'
        : summary.compensated > 0
          ? 'PARTIAL'
          : 'FAILED';

    const record: ReconciliationCutoverCompensationBatchRecord = {
      batchId,
      status,
      dryRun: false,
      replayed: false,
      idempotencyKey,
      requestedByUserId: userId,
      windowDays,
      datasets,
      requestedLimit: limit,
      disableReconciliationGate: dto.disableReconciliationGate,
      workflowVersionId: dto.workflowVersionId,
      note: dto.note,
      reason: dto.reason,
      storage: overview.storage,
      control,
      scanned: overview.summary.totalExecutions,
      matched: overview.summary.compensationPendingExecutions,
      attempted: processed,
      results,
      summary,
      createdAt,
    };

    this.cutoverCompensationBatchRecords.set(record.batchId, record);
    const persisted = await this.persistReconciliationCutoverCompensationBatchRecord(record);
    const recovered = await this.tryRecoverCompensationBatchByIdempotencyKey(
      persisted,
      userId,
      idempotencyKey,
    );
    if (recovered) {
      return recovered;
    }
    return this.toReconciliationCutoverCompensationBatchResponse(record);
  }

  async listReconciliationCutoverCompensationBatches(
    userId: string,
    query: ListReconciliationCutoverCompensationBatchesQueryDto,
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    storage: 'database' | 'in-memory';
    items: Array<{
      batchId: string;
      status: ReconciliationCutoverCompensationBatchStatus;
      dryRun: boolean;
      replayed: boolean;
      idempotencyKey?: string;
      windowDays: number;
      datasets: StandardDataset[];
      requestedLimit: number;
      scanned: number;
      matched: number;
      attempted: number;
      summary: {
        compensated: number;
        failed: number;
        skipped: number;
        processed: number;
        breakerTriggered: boolean;
        breakerReason?: string;
      };
      createdAt: string;
    }>;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const persisted = await this.listPersistedReconciliationCutoverCompensationBatches(
      userId,
      page,
      pageSize,
      {
        dryRun: query.dryRun,
        replayed: query.replayed,
        status: query.status,
      },
    );
    if (persisted) {
      return persisted;
    }

    const filtered = Array.from(this.cutoverCompensationBatchRecords.values())
      .filter((item) => item.requestedByUserId === userId)
      .filter((item) => (query.dryRun === undefined ? true : item.dryRun === query.dryRun))
      .filter((item) => (query.replayed === undefined ? true : item.replayed === query.replayed))
      .filter((item) => (!query.status ? true : item.status === query.status))
      .sort((a, b) => this.toTimestampMs(b.createdAt) - this.toTimestampMs(a.createdAt));

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      total,
      totalPages,
      storage: 'in-memory',
      items: filtered.slice(start, start + pageSize).map((item) => ({
        batchId: item.batchId,
        status: item.status,
        dryRun: item.dryRun,
        replayed: item.replayed,
        idempotencyKey: item.idempotencyKey,
        windowDays: item.windowDays,
        datasets: item.datasets,
        requestedLimit: item.requestedLimit,
        scanned: item.scanned,
        matched: item.matched,
        attempted: item.attempted,
        summary: item.summary,
        createdAt: item.createdAt,
      })),
    };
  }

  async getReconciliationCutoverCompensationBatch(
    userId: string,
    batchId: string,
  ): Promise<
    ReconciliationCutoverCompensationBatchRecord & {
      storage: 'database' | 'in-memory';
    }
  > {
    const persisted = await this.findPersistedReconciliationCutoverCompensationBatch(batchId);
    if (persisted) {
      if (persisted.requestedByUserId !== userId) {
        throw new ForbiddenException('no permission to access this cutover compensation batch');
      }
      return {
        ...persisted,
        storage: 'database',
      };
    }

    const local = this.cutoverCompensationBatchRecords.get(batchId);
    if (!local) {
      throw new NotFoundException('cutover compensation batch not found');
    }
    if (local.requestedByUserId !== userId) {
      throw new ForbiddenException('no permission to access this cutover compensation batch');
    }

    return {
      ...local,
      storage: 'in-memory',
    };
  }

  async getReconciliationCutoverCompensationBatchReport(
    userId: string,
    batchId: string,
    query: ReconciliationCutoverCompensationBatchReportQueryDto,
  ): Promise<{
    batchId: string;
    format: 'json' | 'markdown';
    fileName: string;
    generatedAt: string;
    storage: 'database' | 'in-memory';
    payload: Record<string, unknown> | string;
  }> {
    const batch = await this.getReconciliationCutoverCompensationBatch(userId, batchId);
    const format = query.format ?? 'markdown';
    const generatedAt = new Date().toISOString();

    const serializable = {
      batchId: batch.batchId,
      status: batch.status,
      dryRun: batch.dryRun,
      replayed: batch.replayed,
      idempotencyKey: batch.idempotencyKey,
      requestedByUserId: batch.requestedByUserId,
      windowDays: batch.windowDays,
      datasets: batch.datasets,
      requestedLimit: batch.requestedLimit,
      disableReconciliationGate: batch.disableReconciliationGate,
      workflowVersionId: batch.workflowVersionId,
      note: batch.note,
      reason: batch.reason,
      storage: batch.storage,
      control: batch.control,
      scanned: batch.scanned,
      matched: batch.matched,
      attempted: batch.attempted,
      summary: batch.summary,
      results: batch.results,
      createdAt: batch.createdAt,
      generatedAt,
    } satisfies Record<string, unknown>;

    if (format === 'json') {
      return {
        batchId: batch.batchId,
        format,
        fileName: `reconciliation-cutover-compensation-batch-${batch.batchId}.json`,
        generatedAt,
        storage: batch.storage,
        payload: serializable,
      };
    }

    return {
      batchId: batch.batchId,
      format,
      fileName: `reconciliation-cutover-compensation-batch-${batch.batchId}.md`,
      generatedAt,
      storage: batch.storage,
      payload: this.renderReconciliationCutoverCompensationBatchMarkdown(serializable),
    };
  }

  async runReconciliationCutoverCompensationSweep(): Promise<{
    enabled: boolean;
    triggered: boolean;
    reason: string;
    scope?: ReconciliationCutoverCompensationSweepScope;
    targetUserCount?: number;
    batchId?: string;
    status?: ReconciliationCutoverCompensationBatchStatus;
    replayed?: boolean;
    attempted?: number;
    summary?: ReconciliationCutoverCompensationBatchSummary;
    settings?: {
      scope: ReconciliationCutoverCompensationSweepScope;
      userId: string;
      windowDays: number;
      limit: number;
      datasets: StandardDataset[];
      idempotencyKey: string;
      maxConcurrency: number;
      perExecutionTimeoutMs: number;
    };
    runs?: ReconciliationCutoverCompensationSweepRun[];
  }> {
    const enabled =
      this.parseOptionalBoolean(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED) ??
      false;
    if (!enabled) {
      return {
        enabled: false,
        triggered: false,
        reason: 'auto_compensation_disabled',
      };
    }

    const scopeRaw =
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE?.trim().toUpperCase() || 'USER';
    const scope: ReconciliationCutoverCompensationSweepScope =
      scopeRaw === 'GLOBAL' ? 'GLOBAL' : 'USER';
    const configuredUserId =
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID?.trim() ||
      'system-auto-compensation';
    const windowDays = Math.max(
      1,
      Math.min(
        30,
        this.parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS,
        ) ?? 7,
      ),
    );
    const limit = Math.max(
      1,
      Math.min(
        100,
        this.parsePositiveInteger(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT) ?? 20,
      ),
    );
    const maxConcurrency = Math.max(
      1,
      Math.min(
        10,
        this.parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY,
        ) ?? 3,
      ),
    );
    const perExecutionTimeoutMs = Math.max(
      1000,
      Math.min(
        120000,
        this.parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS,
        ) ?? 30000,
      ),
    );
    const stopOnFailureCountValue = this.parsePositiveInteger(
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_STOP_ON_FAILURE_COUNT,
    );
    const stopOnFailureCount = stopOnFailureCountValue ?? undefined;
    const stopOnFailureRateRaw = this.parseFiniteNumber(
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_STOP_ON_FAILURE_RATE,
    );
    const stopOnFailureRate =
      stopOnFailureRateRaw !== undefined &&
      stopOnFailureRateRaw >= 0.05 &&
      stopOnFailureRateRaw <= 1
        ? stopOnFailureRateRaw
        : undefined;
    const minProcessedForFailureRate = Math.max(
      1,
      Math.min(
        100,
        this.parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MIN_PROCESSED,
        ) ?? 3,
      ),
    );
    const disableReconciliationGate =
      this.parseOptionalBoolean(
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DISABLE_RECONCILIATION_GATE,
      ) ?? true;
    const datasets = this.resolveRequestedStandardDatasets(
      this.parseStandardDatasetsFromEnv(
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS,
      ),
    );
    const idempotencySlotMinutes = Math.max(
      1,
      Math.min(
        60,
        this.parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES,
        ) ?? 10,
      ),
    );
    const idempotencyKeyBase = this.buildCompensationSweepIdempotencyKey(idempotencySlotMinutes);

    const pendingUsers = await this.listUsersWithCompensationPendingExecutions(
      windowDays,
      datasets,
    );
    const targetUserIds =
      scope === 'GLOBAL'
        ? pendingUsers
        : pendingUsers.includes(configuredUserId)
          ? [configuredUserId]
          : [];

    if (targetUserIds.length === 0) {
      return {
        enabled: true,
        triggered: false,
        reason:
          scope === 'GLOBAL'
            ? 'auto_compensation_no_pending_execution'
            : 'auto_compensation_user_scope_no_pending_execution',
        scope,
        targetUserCount: 0,
        settings: {
          scope,
          userId: configuredUserId,
          windowDays,
          limit,
          datasets,
          idempotencyKey: idempotencyKeyBase,
          maxConcurrency,
          perExecutionTimeoutMs,
        },
      };
    }

    const runs: ReconciliationCutoverCompensationSweepRun[] = [];
    for (const targetUserId of targetUserIds) {
      const idempotencyKey =
        scope === 'GLOBAL' ? `${idempotencyKeyBase}-u-${targetUserId}` : idempotencyKeyBase;
      const batch = await this.retryReconciliationCutoverExecutionCompensationBatch(targetUserId, {
        windowDays,
        datasets,
        limit,
        dryRun: false,
        idempotencyKey,
        maxConcurrency,
        perExecutionTimeoutMs,
        stopOnFailureCount,
        stopOnFailureRate,
        minProcessedForFailureRate,
        disableReconciliationGate,
        reason: 'auto_compensation_sweep',
        note: `auto compensation sweep, slot=${idempotencySlotMinutes}m`,
      });
      runs.push({
        userId: targetUserId,
        batchId: batch.batchId,
        status: batch.status,
        replayed: batch.replayed,
        attempted: batch.attempted,
        summary: batch.summary,
      });
    }

    const attempted = runs.reduce((sum, item) => sum + item.attempted, 0);
    const replayed = runs.every((item) => item.replayed);
    const compensated = runs.reduce((sum, item) => sum + item.summary.compensated, 0);
    const failed = runs.reduce((sum, item) => sum + item.summary.failed, 0);
    const skipped = runs.reduce((sum, item) => sum + item.summary.skipped, 0);
    const processed = runs.reduce((sum, item) => sum + item.summary.processed, 0);
    const breakerTriggered = runs.some((item) => item.summary.breakerTriggered);
    const breakerReasons = runs
      .map((item) => item.summary.breakerReason)
      .filter((item): item is string => Boolean(item));
    const status = this.resolveAggregateCompensationBatchStatus(runs.map((item) => item.status));
    const batchId = runs[0]?.batchId;

    return {
      enabled: true,
      triggered: true,
      reason: replayed ? 'auto_compensation_replayed' : 'auto_compensation_executed',
      scope,
      targetUserCount: runs.length,
      batchId,
      status,
      replayed,
      attempted,
      summary: {
        compensated,
        failed,
        skipped,
        processed,
        breakerTriggered,
        breakerReason: breakerReasons.length > 0 ? breakerReasons.join('; ') : undefined,
      },
      settings: {
        scope,
        userId: configuredUserId,
        windowDays,
        limit,
        datasets,
        idempotencyKey: idempotencyKeyBase,
        maxConcurrency,
        perExecutionTimeoutMs,
      },
      runs,
    };
  }

  private toReconciliationCutoverCompensationBatchResponse(
    record: ReconciliationCutoverCompensationBatchRecord,
    replayedOverride?: boolean,
  ): ReconciliationCutoverCompensationBatchResponse {
    return {
      batchId: record.batchId,
      status: record.status,
      replayed: replayedOverride ?? record.replayed,
      generatedAt: new Date().toISOString(),
      dryRun: record.dryRun,
      windowDays: record.windowDays,
      datasets: record.datasets,
      idempotencyKey: record.idempotencyKey,
      requestedLimit: record.requestedLimit,
      storage: record.storage,
      control: record.control,
      scanned: record.scanned,
      matched: record.matched,
      attempted: record.attempted,
      results: record.results,
      summary: record.summary,
    };
  }

  private async tryRecoverCompensationBatchByIdempotencyKey(
    persisted: boolean,
    userId: string,
    idempotencyKey?: string,
  ): Promise<ReconciliationCutoverCompensationBatchResponse | null> {
    if (persisted || !idempotencyKey) {
      return null;
    }

    const recovered =
      await this.findReconciliationCutoverCompensationBatchByIdempotencyKeyWithRetry(
        userId,
        idempotencyKey,
      );
    if (!recovered) {
      return null;
    }

    return this.toReconciliationCutoverCompensationBatchResponse(recovered, true);
  }

  private async listUsersWithCompensationPendingExecutions(
    windowDays: number,
    datasets: StandardDataset[],
  ): Promise<string[]> {
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    if (!this.cutoverExecutionPersistenceUnavailable) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{
            requestedByUserId: string;
            datasets: unknown;
          }>
        >(
          `SELECT DISTINCT
             "requestedByUserId",
             "datasets"
           FROM "DataReconciliationCutoverExecution"
           WHERE "status" IN ('FAILED', 'PARTIAL')
             AND "compensationApplied" = FALSE
             AND "createdAt" >= $1
           ORDER BY "requestedByUserId" ASC
           LIMIT 500`,
          windowStart,
        );

        const userIds = new Set<string>();
        for (const row of rows) {
          const rowDatasetsRaw = this.parseJsonValue<unknown[]>(row.datasets) ?? [];
          const rowDatasets = rowDatasetsRaw
            .map((item) => this.normalizeReconciliationDataset(String(item)) as StandardDataset)
            .filter((item, index, all) => all.indexOf(item) === index);
          if (this.hasDatasetOverlap(rowDatasets, datasets)) {
            userIds.add(row.requestedByUserId);
          }
        }

        return Array.from(userIds.values()).sort((a, b) => a.localeCompare(b));
      } catch (error) {
        if (this.isCutoverExecutionPersistenceMissingTableError(error)) {
          this.disableCutoverExecutionPersistence('list pending compensation users', error);
        } else {
          this.logger.warn(`List pending compensation users failed: ${this.stringifyError(error)}`);
        }
      }
    }

    const windowStartMs = windowStart.getTime();
    const userIds = new Set<string>();
    for (const record of this.cutoverExecutionRecords.values()) {
      if (record.status !== 'FAILED' && record.status !== 'PARTIAL') {
        continue;
      }
      if (record.compensationApplied) {
        continue;
      }
      if (this.toTimestampMs(record.createdAt) < windowStartMs) {
        continue;
      }
      if (!this.recordHasCutoverDataset(record, datasets)) {
        continue;
      }
      userIds.add(record.requestedByUserId);
    }

    return Array.from(userIds.values()).sort((a, b) => a.localeCompare(b));
  }

  private resolveAggregateCompensationBatchStatus(
    statuses: ReconciliationCutoverCompensationBatchStatus[],
  ): ReconciliationCutoverCompensationBatchStatus {
    if (statuses.length === 0) {
      return 'FAILED';
    }
    if (statuses.every((status) => status === 'SUCCESS')) {
      return 'SUCCESS';
    }
    if (statuses.every((status) => status === 'DRY_RUN')) {
      return 'DRY_RUN';
    }
    if (statuses.every((status) => status === 'FAILED')) {
      return 'FAILED';
    }
    return 'PARTIAL';
  }

  private hasDatasetOverlap(source: StandardDataset[], target: StandardDataset[]): boolean {
    if (target.length === 0) {
      return true;
    }
    return source.some((dataset) => target.includes(dataset));
  }

  private renderReconciliationCutoverCompensationBatchMarkdown(
    payload: Record<string, unknown>,
  ): string {
    const datasets = Array.isArray(payload.datasets)
      ? payload.datasets.map((item) => String(item)).join(', ')
      : '';
    const summary =
      (payload.summary as
        | {
            compensated?: number;
            failed?: number;
            skipped?: number;
            processed?: number;
            breakerTriggered?: boolean;
            breakerReason?: string;
          }
        | undefined) ?? {};
    const results = Array.isArray(payload.results)
      ? (payload.results as Array<Record<string, unknown>>)
      : [];

    const lines = [
      '# Reconciliation Cutover Compensation Batch Report',
      '',
      `- Batch ID: ${String(payload.batchId ?? '')}`,
      `- Status: ${String(payload.status ?? '')}`,
      `- Dry Run: ${String(payload.dryRun ?? false)}`,
      `- Replayed: ${String(payload.replayed ?? false)}`,
      `- Idempotency Key: ${String(payload.idempotencyKey ?? '')}`,
      `- Requested By: ${String(payload.requestedByUserId ?? '')}`,
      `- Window Days: ${String(payload.windowDays ?? 0)}`,
      `- Datasets: ${datasets}`,
      `- Requested Limit: ${String(payload.requestedLimit ?? 0)}`,
      `- Created At: ${String(payload.createdAt ?? '')}`,
      '',
      '## Summary',
      '',
      `- Processed: ${String(summary.processed ?? 0)}`,
      `- Compensated: ${String(summary.compensated ?? 0)}`,
      `- Failed: ${String(summary.failed ?? 0)}`,
      `- Skipped: ${String(summary.skipped ?? 0)}`,
      `- Breaker Triggered: ${String(summary.breakerTriggered ?? false)}`,
      `- Breaker Reason: ${String(summary.breakerReason ?? '')}`,
      '',
      '## Results',
      '',
      '| Execution ID | Action | Status Before | Compensated | Reason/Error |',
      '| --- | --- | --- | --- | --- |',
    ];

    for (const item of results) {
      const reasonOrError =
        typeof item.error === 'string'
          ? item.error
          : typeof item.reason === 'string'
            ? item.reason
            : '';
      lines.push(
        `| ${String(item.executionId ?? '')} | ${String(item.action ?? '')} | ${String(item.statusBefore ?? '')} | ${String(item.compensated ?? false)} | ${reasonOrError.replace(/\|/g, '/')} |`,
      );
    }

    return lines.join('\n');
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
        meta: this.buildMeta(dataset, rows),
      };
    }

    if (dataset === 'FUTURES_QUOTE') {
      const rows = await this.queryFutures(options.filters, limit, options.from, options.to);
      return {
        dataset,
        rows,
        meta: this.buildMeta(dataset, rows),
      };
    }

    const rows = await this.queryMarketEvent(options.filters, limit, options.from, options.to);
    return {
      dataset,
      rows,
      meta: this.buildMeta(dataset, rows),
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

  private async persistReconciliationCutoverExecutionRecord(
    record: ReconciliationCutoverExecutionRecord,
  ): Promise<boolean> {
    if (this.cutoverExecutionPersistenceUnavailable) {
      return false;
    }

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationCutoverExecution"
          ("id", "executionId", "action", "status", "requestedByUserId", "datasets", "decisionId", "decisionStatus", "applied", "configBefore", "configAfter", "stepTrace", "errorMessage", "compensationApplied", "compensationAt", "compensationPayload", "compensationError", "createdAt", "updatedAt")
         VALUES
          ($1, $2, $3::"ReconciliationCutoverExecutionAction", $4::"ReconciliationCutoverExecutionStatus", $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16::jsonb, $17, $18, $19)
         ON CONFLICT ("executionId") DO UPDATE SET
          "status" = EXCLUDED."status",
          "datasets" = EXCLUDED."datasets",
          "decisionId" = EXCLUDED."decisionId",
          "decisionStatus" = EXCLUDED."decisionStatus",
          "applied" = EXCLUDED."applied",
          "configBefore" = EXCLUDED."configBefore",
          "configAfter" = EXCLUDED."configAfter",
          "stepTrace" = EXCLUDED."stepTrace",
          "errorMessage" = EXCLUDED."errorMessage",
          "compensationApplied" = EXCLUDED."compensationApplied",
          "compensationAt" = EXCLUDED."compensationAt",
          "compensationPayload" = EXCLUDED."compensationPayload",
          "compensationError" = EXCLUDED."compensationError",
          "updatedAt" = EXCLUDED."updatedAt"`,
        randomUUID(),
        record.executionId,
        record.action,
        record.status,
        record.requestedByUserId,
        JSON.stringify(record.datasets),
        record.decisionId ?? null,
        record.decisionStatus ?? null,
        record.applied,
        JSON.stringify(record.configBefore ?? null),
        JSON.stringify(record.configAfter ?? null),
        JSON.stringify(record.stepTrace),
        record.errorMessage ?? null,
        record.compensationApplied,
        record.compensationAt ? new Date(record.compensationAt) : null,
        JSON.stringify(record.compensationPayload ?? null),
        record.compensationError ?? null,
        new Date(record.createdAt),
        new Date(),
      );
      return true;
    } catch (error) {
      if (this.isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('persist cutover execution record', error);
        return false;
      }
      this.logger.error(`Persist cutover execution record failed: ${this.stringifyError(error)}`);
      return false;
    }
  }

  private async listPersistedReconciliationCutoverExecutions(
    userId: string,
    page: number,
    pageSize: number,
    options: {
      action?: ReconciliationCutoverExecutionAction;
      status?: ReconciliationCutoverExecutionStatus;
    },
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    storage: 'database';
    items: ReconciliationCutoverExecutionRecord[];
  } | null> {
    if (this.cutoverExecutionPersistenceUnavailable) {
      return null;
    }

    try {
      const whereParts: string[] = ['"requestedByUserId" = $1'];
      const whereParams: unknown[] = [userId];

      if (options.action) {
        whereParts.push(
          `"action" = $${whereParams.length + 1}::"ReconciliationCutoverExecutionAction"`,
        );
        whereParams.push(options.action);
      }

      if (options.status) {
        whereParts.push(
          `"status" = $${whereParams.length + 1}::"ReconciliationCutoverExecutionStatus"`,
        );
        whereParams.push(options.status);
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const totalRows = await this.prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
        `SELECT COUNT(*)::int AS "total"
         FROM "DataReconciliationCutoverExecution"
         ${whereClause}`,
        ...whereParams,
      );

      const total = Number(totalRows[0]?.total ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationCutoverExecutionRow[]>(
        `SELECT
           "executionId",
           "action",
           "status",
           "requestedByUserId",
           "datasets",
           "decisionId",
           "decisionStatus",
           "applied",
           "configBefore",
           "configAfter",
           "stepTrace",
           "errorMessage",
           "compensationApplied",
           "compensationAt",
           "compensationPayload",
           "compensationError",
           "createdAt"
         FROM "DataReconciliationCutoverExecution"
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
        items: rows.map((row) => this.mapPersistedReconciliationCutoverExecutionRow(row)),
      };
    } catch (error) {
      if (this.isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('list cutover execution records', error);
        return null;
      }
      this.logger.error(`List cutover execution records failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private async listRecentPersistedReconciliationCutoverExecutions(
    userId: string,
    createdAtFrom: Date,
  ): Promise<ReconciliationCutoverExecutionRecord[] | null> {
    if (this.cutoverExecutionPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationCutoverExecutionRow[]>(
        `SELECT
           "executionId",
           "action",
           "status",
           "requestedByUserId",
           "datasets",
           "decisionId",
           "decisionStatus",
           "applied",
           "configBefore",
           "configAfter",
           "stepTrace",
           "errorMessage",
           "compensationApplied",
           "compensationAt",
           "compensationPayload",
           "compensationError",
           "createdAt"
         FROM "DataReconciliationCutoverExecution"
         WHERE "requestedByUserId" = $1
           AND "createdAt" >= $2
         ORDER BY "createdAt" DESC
         LIMIT 5000`,
        userId,
        createdAtFrom,
      );

      return rows.map((row) => this.mapPersistedReconciliationCutoverExecutionRow(row));
    } catch (error) {
      if (this.isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('list recent cutover execution records', error);
        return null;
      }
      this.logger.error(
        `List recent cutover execution records failed: ${this.stringifyError(error)}`,
      );
      return null;
    }
  }

  private async findPersistedReconciliationCutoverExecution(
    executionId: string,
  ): Promise<ReconciliationCutoverExecutionRecord | null> {
    if (this.cutoverExecutionPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<PersistedReconciliationCutoverExecutionRow[]>(
        `SELECT
           "executionId",
           "action",
           "status",
           "requestedByUserId",
           "datasets",
           "decisionId",
           "decisionStatus",
           "applied",
           "configBefore",
           "configAfter",
           "stepTrace",
           "errorMessage",
           "compensationApplied",
           "compensationAt",
           "compensationPayload",
           "compensationError",
           "createdAt"
         FROM "DataReconciliationCutoverExecution"
         WHERE "executionId" = $1
         LIMIT 1`,
        executionId,
      );

      if (rows.length === 0) {
        return null;
      }

      return this.mapPersistedReconciliationCutoverExecutionRow(rows[0]);
    } catch (error) {
      if (this.isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('find cutover execution record', error);
        return null;
      }
      this.logger.error(`Find cutover execution record failed: ${this.stringifyError(error)}`);
      return null;
    }
  }

  private mapPersistedReconciliationCutoverExecutionRow(
    row: PersistedReconciliationCutoverExecutionRow,
  ): ReconciliationCutoverExecutionRecord {
    const datasetsRaw = this.parseJsonValue<unknown[]>(row.datasets) ?? [];
    const datasets = datasetsRaw
      .map((item) => this.normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);

    const configBeforeRaw = this.parseJsonValue<Record<string, unknown>>(row.configBefore);
    const configAfterRaw = this.parseJsonValue<Record<string, unknown>>(row.configAfter);
    const stepTrace = this.parseJsonValue<Array<Record<string, unknown>>>(row.stepTrace) ?? [];

    return {
      executionId: row.executionId,
      action: this.normalizeCutoverExecutionAction(row.action),
      status: this.normalizeCutoverExecutionStatus(row.status),
      requestedByUserId: row.requestedByUserId,
      datasets,
      decisionId: row.decisionId ?? undefined,
      decisionStatus: row.decisionStatus
        ? this.normalizeCutoverDecisionStatus(row.decisionStatus)
        : undefined,
      applied: this.parseBoolean(row.applied),
      configBefore: configBeforeRaw
        ? {
            standardizedRead: this.parseBoolean(configBeforeRaw.standardizedRead),
            reconciliationGate: this.parseBoolean(configBeforeRaw.reconciliationGate),
          }
        : undefined,
      configAfter: configAfterRaw
        ? {
            standardizedRead: this.parseBoolean(configAfterRaw.standardizedRead),
            reconciliationGate: this.parseBoolean(configAfterRaw.reconciliationGate),
          }
        : undefined,
      stepTrace,
      errorMessage: row.errorMessage ?? undefined,
      compensationApplied: this.parseBoolean(row.compensationApplied),
      compensationAt: this.toIsoString(row.compensationAt),
      compensationPayload:
        this.parseJsonValue<Record<string, unknown>>(row.compensationPayload) ?? undefined,
      compensationError: row.compensationError ?? undefined,
      createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  private async findReconciliationCutoverCompensationBatchByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<ReconciliationCutoverCompensationBatchRecord | null> {
    const persisted =
      await this.findPersistedReconciliationCutoverCompensationBatchByIdempotencyKey(
        userId,
        idempotencyKey,
      );
    if (persisted) {
      return persisted;
    }

    const local = Array.from(this.cutoverCompensationBatchRecords.values())
      .filter((item) => item.requestedByUserId === userId && item.idempotencyKey === idempotencyKey)
      .sort((a, b) => this.toTimestampMs(b.createdAt) - this.toTimestampMs(a.createdAt));
    return local[0] ?? null;
  }

  private buildCompensationBatchInFlightKey(userId: string, idempotencyKey: string) {
    return `${userId}::${idempotencyKey}`;
  }

  private async findReconciliationCutoverCompensationBatchByIdempotencyKeyWithRetry(
    userId: string,
    idempotencyKey: string,
    maxAttempts = 5,
    delayMs = 80,
  ): Promise<ReconciliationCutoverCompensationBatchRecord | null> {
    const attempts = Math.max(1, maxAttempts);
    for (let index = 0; index < attempts; index += 1) {
      const found = await this.findReconciliationCutoverCompensationBatchByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (found) {
        return found;
      }
      if (index < attempts - 1) {
        await this.sleep(delayMs);
      }
    }
    return null;
  }

  private async persistReconciliationCutoverCompensationBatchRecord(
    record: ReconciliationCutoverCompensationBatchRecord,
  ): Promise<boolean> {
    if (this.cutoverCompensationBatchPersistenceUnavailable) {
      return false;
    }

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DataReconciliationCutoverCompensationBatch"
          ("id", "batchId", "status", "dryRun", "replayed", "idempotencyKey", "requestedByUserId", "windowDays", "datasets", "requestedLimit", "disableReconciliationGate", "workflowVersionId", "note", "reason", "storage", "control", "scanned", "matched", "attempted", "results", "summary", "createdAt", "updatedAt")
         VALUES
          ($1, $2, $3::"ReconciliationCutoverCompensationBatchStatus", $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20::jsonb, $21::jsonb, $22, $23)
         ON CONFLICT ("batchId") DO UPDATE SET
          "status" = EXCLUDED."status",
          "dryRun" = EXCLUDED."dryRun",
          "replayed" = EXCLUDED."replayed",
          "idempotencyKey" = EXCLUDED."idempotencyKey",
          "windowDays" = EXCLUDED."windowDays",
          "datasets" = EXCLUDED."datasets",
          "requestedLimit" = EXCLUDED."requestedLimit",
          "disableReconciliationGate" = EXCLUDED."disableReconciliationGate",
          "workflowVersionId" = EXCLUDED."workflowVersionId",
          "note" = EXCLUDED."note",
          "reason" = EXCLUDED."reason",
          "storage" = EXCLUDED."storage",
          "control" = EXCLUDED."control",
          "scanned" = EXCLUDED."scanned",
          "matched" = EXCLUDED."matched",
          "attempted" = EXCLUDED."attempted",
          "results" = EXCLUDED."results",
          "summary" = EXCLUDED."summary",
          "updatedAt" = EXCLUDED."updatedAt"`,
        randomUUID(),
        record.batchId,
        record.status,
        record.dryRun,
        record.replayed,
        record.idempotencyKey ?? null,
        record.requestedByUserId,
        record.windowDays,
        JSON.stringify(record.datasets),
        record.requestedLimit,
        record.disableReconciliationGate,
        record.workflowVersionId ?? null,
        record.note ?? null,
        record.reason ?? null,
        record.storage,
        JSON.stringify(record.control),
        record.scanned,
        record.matched,
        record.attempted,
        JSON.stringify(record.results),
        JSON.stringify(record.summary),
        new Date(record.createdAt),
        new Date(),
      );
      return true;
    } catch (error) {
      if (this.isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'persist cutover compensation batch record',
          error,
        );
        return false;
      }
      if (this.isCutoverCompensationBatchIdempotencyConflict(error)) {
        return false;
      }
      this.logger.error(
        `Persist cutover compensation batch record failed: ${this.stringifyError(error)}`,
      );
      return false;
    }
  }

  private async listPersistedReconciliationCutoverCompensationBatches(
    userId: string,
    page: number,
    pageSize: number,
    options: {
      dryRun?: boolean;
      replayed?: boolean;
      status?: ReconciliationCutoverCompensationBatchStatus;
    },
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    storage: 'database';
    items: Array<{
      batchId: string;
      status: ReconciliationCutoverCompensationBatchStatus;
      dryRun: boolean;
      replayed: boolean;
      idempotencyKey?: string;
      windowDays: number;
      datasets: StandardDataset[];
      requestedLimit: number;
      scanned: number;
      matched: number;
      attempted: number;
      summary: {
        compensated: number;
        failed: number;
        skipped: number;
        processed: number;
        breakerTriggered: boolean;
        breakerReason?: string;
      };
      createdAt: string;
    }>;
  } | null> {
    if (this.cutoverCompensationBatchPersistenceUnavailable) {
      return null;
    }

    try {
      const whereParts: string[] = ['"requestedByUserId" = $1'];
      const whereParams: unknown[] = [userId];

      if (options.dryRun !== undefined) {
        whereParts.push(`"dryRun" = $${whereParams.length + 1}`);
        whereParams.push(options.dryRun);
      }

      if (options.replayed !== undefined) {
        whereParts.push(`"replayed" = $${whereParams.length + 1}`);
        whereParams.push(options.replayed);
      }

      if (options.status) {
        whereParts.push(
          `"status" = $${whereParams.length + 1}::"ReconciliationCutoverCompensationBatchStatus"`,
        );
        whereParams.push(options.status);
      }

      const whereClause = `WHERE ${whereParts.join(' AND ')}`;
      const totalRows = await this.prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
        `SELECT COUNT(*)::int AS "total"
         FROM "DataReconciliationCutoverCompensationBatch"
         ${whereClause}`,
        ...whereParams,
      );

      const total = Number(totalRows[0]?.total ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await this.prisma.$queryRawUnsafe<
        PersistedReconciliationCutoverCompensationBatchRow[]
      >(
        `SELECT
             "batchId",
             "status",
             "dryRun",
             "replayed",
             "idempotencyKey",
             "requestedByUserId",
             "windowDays",
             "datasets",
             "requestedLimit",
             "disableReconciliationGate",
             "workflowVersionId",
             "note",
             "reason",
             "storage",
             "control",
             "scanned",
             "matched",
             "attempted",
             "results",
             "summary",
             "createdAt"
           FROM "DataReconciliationCutoverCompensationBatch"
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
        items: rows.map((row) => {
          const record = this.mapPersistedReconciliationCutoverCompensationBatchRow(row);
          return {
            batchId: record.batchId,
            status: record.status,
            dryRun: record.dryRun,
            replayed: record.replayed,
            idempotencyKey: record.idempotencyKey,
            windowDays: record.windowDays,
            datasets: record.datasets,
            requestedLimit: record.requestedLimit,
            scanned: record.scanned,
            matched: record.matched,
            attempted: record.attempted,
            summary: record.summary,
            createdAt: record.createdAt,
          };
        }),
      };
    } catch (error) {
      if (this.isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'list cutover compensation batch records',
          error,
        );
        return null;
      }
      this.logger.error(
        `List cutover compensation batch records failed: ${this.stringifyError(error)}`,
      );
      return null;
    }
  }

  private async findPersistedReconciliationCutoverCompensationBatch(
    batchId: string,
  ): Promise<ReconciliationCutoverCompensationBatchRecord | null> {
    if (this.cutoverCompensationBatchPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        PersistedReconciliationCutoverCompensationBatchRow[]
      >(
        `SELECT
             "batchId",
             "status",
             "dryRun",
             "replayed",
             "idempotencyKey",
             "requestedByUserId",
             "windowDays",
             "datasets",
             "requestedLimit",
             "disableReconciliationGate",
             "workflowVersionId",
             "note",
             "reason",
             "storage",
             "control",
             "scanned",
             "matched",
             "attempted",
             "results",
             "summary",
             "createdAt"
           FROM "DataReconciliationCutoverCompensationBatch"
           WHERE "batchId" = $1
           LIMIT 1`,
        batchId,
      );

      if (rows.length === 0) {
        return null;
      }

      return this.mapPersistedReconciliationCutoverCompensationBatchRow(rows[0]);
    } catch (error) {
      if (this.isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'find cutover compensation batch record',
          error,
        );
        return null;
      }
      this.logger.error(
        `Find cutover compensation batch record failed: ${this.stringifyError(error)}`,
      );
      return null;
    }
  }

  private async findPersistedReconciliationCutoverCompensationBatchByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<ReconciliationCutoverCompensationBatchRecord | null> {
    if (this.cutoverCompensationBatchPersistenceUnavailable) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        PersistedReconciliationCutoverCompensationBatchRow[]
      >(
        `SELECT
             "batchId",
             "status",
             "dryRun",
             "replayed",
             "idempotencyKey",
             "requestedByUserId",
             "windowDays",
             "datasets",
             "requestedLimit",
             "disableReconciliationGate",
             "workflowVersionId",
             "note",
             "reason",
             "storage",
             "control",
             "scanned",
             "matched",
             "attempted",
             "results",
             "summary",
             "createdAt"
           FROM "DataReconciliationCutoverCompensationBatch"
           WHERE "requestedByUserId" = $1
             AND "idempotencyKey" = $2
           ORDER BY "createdAt" DESC
           LIMIT 1`,
        userId,
        idempotencyKey,
      );

      if (rows.length === 0) {
        return null;
      }

      return this.mapPersistedReconciliationCutoverCompensationBatchRow(rows[0]);
    } catch (error) {
      if (this.isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'find cutover compensation batch by idempotency key',
          error,
        );
        return null;
      }
      this.logger.error(
        `Find cutover compensation batch by idempotency key failed: ${this.stringifyError(error)}`,
      );
      return null;
    }
  }

  private mapPersistedReconciliationCutoverCompensationBatchRow(
    row: PersistedReconciliationCutoverCompensationBatchRow,
  ): ReconciliationCutoverCompensationBatchRecord {
    const datasetsRaw = this.parseJsonValue<unknown[]>(row.datasets) ?? [];
    const datasets = datasetsRaw
      .map((item) => this.normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);

    const resultsRaw =
      this.parseJsonValue<Array<Record<string, unknown>>>(row.results) ??
      ([] as Array<Record<string, unknown>>);
    const results: ReconciliationCutoverCompensationBatchResultItem[] = resultsRaw.map((item) => ({
      executionId: String(item.executionId ?? ''),
      action: this.normalizeCutoverExecutionAction(item.action),
      statusBefore:
        item.statusBefore === 'PARTIAL' || item.statusBefore === 'FAILED'
          ? item.statusBefore
          : 'FAILED',
      compensated: this.parseBoolean(item.compensated),
      compensationExecutionId:
        typeof item.compensationExecutionId === 'string' ? item.compensationExecutionId : undefined,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
      error: typeof item.error === 'string' ? item.error : undefined,
    }));

    const summaryRaw = this.parseJsonValue<Record<string, unknown>>(row.summary) ?? {};
    const controlRaw = this.parseJsonValue<Record<string, unknown>>(row.control) ?? {};

    return {
      batchId: row.batchId,
      status: this.normalizeCutoverCompensationBatchStatus(row.status),
      dryRun: this.parseBoolean(row.dryRun),
      replayed: this.parseBoolean(row.replayed),
      idempotencyKey: row.idempotencyKey ?? undefined,
      requestedByUserId: row.requestedByUserId,
      windowDays: this.parseInteger(row.windowDays) || 7,
      datasets,
      requestedLimit: this.parseInteger(row.requestedLimit) || 20,
      disableReconciliationGate: this.parseBoolean(row.disableReconciliationGate),
      workflowVersionId: row.workflowVersionId ?? undefined,
      note: row.note ?? undefined,
      reason: row.reason ?? undefined,
      storage: row.storage === 'in-memory' ? 'in-memory' : 'database',
      control: {
        maxConcurrency: this.parseInteger(controlRaw.maxConcurrency) || 3,
        perExecutionTimeoutMs: this.parseInteger(controlRaw.perExecutionTimeoutMs) || 30000,
        stopOnFailureCount: this.parseNonNegativeInteger(controlRaw.stopOnFailureCount),
        stopOnFailureRate: this.parseFiniteNumber(controlRaw.stopOnFailureRate),
        minProcessedForFailureRate: this.parseInteger(controlRaw.minProcessedForFailureRate) || 3,
      },
      scanned: this.parseInteger(row.scanned),
      matched: this.parseInteger(row.matched),
      attempted: this.parseInteger(row.attempted),
      results,
      summary: {
        compensated: this.parseInteger(summaryRaw.compensated),
        failed: this.parseInteger(summaryRaw.failed),
        skipped: this.parseInteger(summaryRaw.skipped),
        processed: this.parseInteger(summaryRaw.processed),
        breakerTriggered: this.parseBoolean(summaryRaw.breakerTriggered),
        breakerReason:
          typeof summaryRaw.breakerReason === 'string' ? summaryRaw.breakerReason : undefined,
      },
      createdAt: this.toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  private normalizeM1ReadinessReportFormat(value: unknown): ReconciliationM1ReadinessReportFormat {
    if (value === 'json' || value === 'markdown') {
      return value;
    }
    return 'markdown';
  }

  private normalizeCutoverExecutionAction(value: unknown): ReconciliationCutoverExecutionAction {
    if (value === 'CUTOVER' || value === 'ROLLBACK' || value === 'AUTOPILOT') {
      return value;
    }
    return 'AUTOPILOT';
  }

  private normalizeCutoverExecutionStatus(value: unknown): ReconciliationCutoverExecutionStatus {
    if (
      value === 'SUCCESS' ||
      value === 'FAILED' ||
      value === 'PARTIAL' ||
      value === 'COMPENSATED'
    ) {
      return value;
    }
    return 'FAILED';
  }

  private normalizeCutoverCompensationBatchStatus(
    value: unknown,
  ): ReconciliationCutoverCompensationBatchStatus {
    if (value === 'DRY_RUN' || value === 'SUCCESS' || value === 'PARTIAL' || value === 'FAILED') {
      return value;
    }
    return 'FAILED';
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

  private parseStandardDatasetsFromEnv(value: string | undefined): StandardDataset[] | undefined {
    if (!value) {
      return undefined;
    }

    const tokens = value
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item.length > 0);
    if (tokens.length === 0) {
      return undefined;
    }

    const mapped = tokens
      .map((item) => {
        if (item === 'SPOT_PRICE' || item === 'PRICE_DATA' || item === 'SPOT') {
          return 'SPOT_PRICE' as const;
        }
        if (item === 'FUTURES_QUOTE' || item === 'FUTURES_QUOTE_SNAPSHOT' || item === 'FUTURES') {
          return 'FUTURES_QUOTE' as const;
        }
        if (item === 'MARKET_EVENT' || item === 'MARKET_INTEL' || item === 'EVENT') {
          return 'MARKET_EVENT' as const;
        }
        return undefined;
      })
      .filter((item): item is StandardDataset => Boolean(item));

    if (mapped.length === 0) {
      return undefined;
    }

    return mapped.filter((item, index, all) => all.indexOf(item) === index);
  }

  private buildCompensationSweepIdempotencyKey(slotMinutes: number): string {
    const safeSlotMinutes = Math.max(1, Math.min(60, slotMinutes));
    const slotMs = safeSlotMinutes * 60 * 1000;
    const slotStart = new Date(Math.floor(Date.now() / slotMs) * slotMs)
      .toISOString()
      .replace(/[:.]/g, '-');
    return `auto-compensation-${safeSlotMinutes}m-${slotStart}`;
  }

  private parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) && value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return false;
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

  private toTimestampMs(value: unknown): number {
    if (value === null || value === undefined) {
      return Number.NEGATIVE_INFINITY;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) {
      return Number.NEGATIVE_INFINITY;
    }
    return parsed.getTime();
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new BadRequestException(message));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    const duration = Math.max(0, ms);
    await new Promise<void>((resolve) => setTimeout(resolve, duration));
  }

  private recordHasCutoverDataset(
    record: ReconciliationCutoverExecutionRecord,
    datasets: StandardDataset[],
  ): boolean {
    if (datasets.length === 0) {
      return true;
    }
    return record.datasets.some((dataset) => datasets.includes(dataset));
  }

  private isCutoverExecutionCompensationPending(
    record: ReconciliationCutoverExecutionRecord,
  ): boolean {
    return (
      (record.status === 'FAILED' || record.status === 'PARTIAL') &&
      record.compensationApplied !== true
    );
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

  private isCutoverExecutionPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTarget =
      message.includes('datareconciliationcutoverexecution') ||
      message.includes('reconciliationcutoverexecutionaction') ||
      message.includes('reconciliationcutoverexecutionstatus');
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

  private isCutoverCompensationBatchPersistenceMissingTableError(error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2021') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    const containsTarget =
      message.includes('datareconciliationcutovercompensationbatch') ||
      message.includes('reconciliationcutovercompensationbatchstatus');
    const containsColumns =
      message.includes('idempotencykey') ||
      message.includes('replayed') ||
      message.includes('control') ||
      message.includes('disablereconciliationgate');
    const missingTableHint =
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column') ||
      message.includes('undefined') ||
      message.includes('42703') ||
      message.includes('42704') ||
      message.includes('p2021') ||
      message.includes('invalid input value for enum');
    return (containsTarget || containsColumns) && missingTableHint;
  }

  private isCutoverCompensationBatchIdempotencyConflict(error: unknown): boolean {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'P2002') {
      return true;
    }

    const message = this.stringifyError(error).toLowerCase();
    return (
      (message.includes('duplicate key') ||
        message.includes('23505') ||
        message.includes('unique')) &&
      message.includes(
        'datareconciliationcutovercompensationbatch_requestedbyuserid_idempotencykey_key',
      )
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

  private disableCutoverExecutionPersistence(operation: string, error: unknown) {
    if (this.cutoverExecutionPersistenceUnavailable) {
      return;
    }
    this.cutoverExecutionPersistenceUnavailable = true;
    this.logger.warn(
      `Cutover execution persistence disabled (${operation}): ${this.stringifyError(error)}`,
    );
  }

  private disableCutoverCompensationBatchPersistence(operation: string, error: unknown) {
    if (this.cutoverCompensationBatchPersistenceUnavailable) {
      return;
    }
    this.cutoverCompensationBatchPersistenceUnavailable = true;
    this.logger.warn(
      `Cutover compensation batch persistence disabled (${operation}): ${this.stringifyError(error)}`,
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

  private buildMeta(
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

    const overall = Math.round(completeness * 0.4 + timeliness * 0.35 + consistency * 0.25);

    return {
      overall,
      grade: this.resolveQualityGrade(overall),
      dimensions: {
        completeness,
        timeliness,
        consistency,
      },
    };
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
