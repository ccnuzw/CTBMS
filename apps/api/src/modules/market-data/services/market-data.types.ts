// ─── Market Data Types ────────────────────────────────────────────────────────
// Extracted from market-data.service.ts during refactoring.
// All interfaces, type aliases, and constants used across market-data sub-services.

import type {
    CreateReconciliationJobDto,
    ReconciliationRollbackDrillStatus,
    ReconciliationDataset,
    ReconciliationSummaryDto,
} from '@packages/types';
export type { ReconciliationDataset } from '@packages/types';
export type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';
export type ReconciliationJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
export type ReconciliationM1ReadinessReportFormat = 'json' | 'markdown';
export type ReconciliationCutoverDecisionStatus = 'APPROVED' | 'REJECTED';
export type ReconciliationCutoverExecutionAction = 'CUTOVER' | 'ROLLBACK' | 'AUTOPILOT';
export type ReconciliationCutoverExecutionStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'COMPENSATED';
export type ReconciliationCutoverCompensationBatchStatus = 'DRY_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type ReconciliationCutoverCompensationSweepScope = 'USER' | 'GLOBAL';
export type RollbackDrillStatus = ReconciliationRollbackDrillStatus;
export type ReconciliationListSortBy = 'createdAt' | 'startedAt' | 'finishedAt' | 'status' | 'dataset';
export type ReconciliationListSortOrder = 'asc' | 'desc';
export type AggregateOp = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface ListReconciliationJobsQueryInput {
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

export interface MarketDataAggregateMetricInput {
    field: string;
    op: AggregateOp;
    as?: string;
}

export interface StandardizedQueryOptions {
    from?: Date;
    to?: Date;
    filters?: Record<string, unknown>;
    limit?: number;
    enforceReconciliationGate?: boolean;
}

export interface StandardizedDataQualityScore {
    overall: number;
    grade: 'A' | 'B' | 'C' | 'D';
    dimensions: {
        completeness: number;
        timeliness: number;
        consistency: number;
        anomalyStability: number;
    };
}

export interface StandardizedDataFreshness {
    status: 'FRESH' | 'STALE' | 'OUTDATED' | 'UNKNOWN';
    degradeSeverity: 'NONE' | 'WARNING' | 'CRITICAL';
    ttlMinutes: number;
    dataLagMinutes?: number;
    newestDataTime?: string;
    oldestDataTime?: string;
}

export interface StandardizedDataGovernanceMeta {
    standardizedRead: {
        enabled: boolean;
        source: string;
        updatedAt: string | null;
    };
    reconciliationGate: {
        enabled: boolean;
        passed: boolean;
        reason: ReconciliationGateReason;
        checkedAt: string;
        maxAgeMinutes?: number;
        ageMinutes?: number;
        latest?: {
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
        };
    };
}

export interface StandardizedDataMeta {
    recordCount: number;
    mappingVersion: string;
    schemaVersion?: string;
    lineageVersion?: string;
    fetchedAt: string;
    degradeAction: 'ALLOW' | 'WARN' | 'BLOCK';
    qualityScore: StandardizedDataQualityScore;
    freshness: StandardizedDataFreshness;
    lineage?: {
        dataset: StandardDataset;
        sourceTables: string[];
        ruleSetId: string;
        metricVersions: Record<string, string>;
    };
    governance?: StandardizedDataGovernanceMeta;
}

export interface WeatherLogisticsImpactIndexQueryInput {
    from?: string;
    to?: string;
    windowDays?: number;
    commodityCode?: string;
    regionCode?: string;
}

export type WeatherLogisticsRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface WeatherLogisticsImpactIndexPoint {
    date: string;
    weatherDisturbanceIndex: number;
    transportFrictionIndex: number;
    supplyRiskIndex: number;
    deliveryDelayRisk: number;
    weatherEventCount: number;
    logisticsEventCount: number;
    freightSampleCount: number;
    riskLevel: WeatherLogisticsRiskLevel;
}

export interface WeatherLogisticsComputationBucket {
    date: string;
    weatherSignal: number;
    logisticsSignal: number;
    weatherEventCount: number;
    logisticsEventCount: number;
    freightValues: number[];
}

export interface ReconciliationJob {
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

export interface PersistedReconciliationJobRow {
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

export interface PersistedReconciliationDiffRow {
    payload: unknown;
}

export interface PersistedReconciliationGateRow {
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

export interface PersistedReconciliationDailyMetricRow {
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

export interface RollbackDrillRecord {
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

export interface PersistedRollbackDrillRow {
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

export interface PersistedReadCoverageDailyRow {
    metricDate: unknown;
    totalCount: unknown;
    standardCount: unknown;
    legacyCount: unknown;
    otherCount: unknown;
    gateEvaluatedCount: unknown;
    gatePassedCount: unknown;
}

export interface PersistedReconciliationJobRetryRow {
    createdByUserId: string;
    status: string;
    dataset: string;
    retryCount: unknown;
    timeRangeFrom: unknown;
    timeRangeTo: unknown;
    dimensions: unknown;
    threshold: unknown;
}

export interface M1ReadinessReportSnapshotRecord {
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

export interface PersistedM1ReadinessReportSnapshotRow {
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

export interface ReconciliationCutoverDecisionRecord {
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

export interface PersistedReconciliationCutoverDecisionRow {
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

export interface CutoverRuntimeConfigSnapshot {
    standardizedRead: boolean;
    reconciliationGate: boolean;
}

export interface ReconciliationCutoverExecutionRecord {
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

export interface PersistedReconciliationCutoverExecutionRow {
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

export interface ReconciliationCutoverCompensationBatchResultItem {
    executionId: string;
    action: ReconciliationCutoverExecutionAction;
    statusBefore: 'FAILED' | 'PARTIAL';
    compensated: boolean;
    compensationExecutionId?: string;
    reason?: string;
    error?: string;
}

export interface ReconciliationCutoverCompensationBatchControl {
    maxConcurrency: number;
    perExecutionTimeoutMs: number;
    stopOnFailureCount?: number;
    stopOnFailureRate?: number;
    minProcessedForFailureRate: number;
}

export interface ReconciliationCutoverCompensationBatchSummary {
    compensated: number;
    failed: number;
    skipped: number;
    processed: number;
    breakerTriggered: boolean;
    breakerReason?: string;
}

export interface ReconciliationCutoverCompensationBatchResponse {
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

export interface ReconciliationCutoverCompensationSweepRun {
    userId: string;
    batchId: string;
    status: ReconciliationCutoverCompensationBatchStatus;
    replayed: boolean;
    attempted: number;
    summary: ReconciliationCutoverCompensationBatchSummary;
}

export interface ReconciliationCutoverCompensationBatchRecord {
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

export interface PersistedReconciliationCutoverCompensationBatchRow {
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

export interface ReconciliationJobListResult {
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

export interface ReconciliationGateSnapshot {
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

export interface ReconciliationWindowJobRecord {
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

export const RECONCILIATION_SORT_COLUMN_MAP: Record<ReconciliationListSortBy, string> = {
    createdAt: '"createdAt"',
    startedAt: '"startedAt"',
    finishedAt: '"finishedAt"',
    status: '"status"',
    dataset: '"dataset"',
};

export const COMMODITY_CODE_MAP: Record<string, string> = {
    玉米: 'CORN',
    豆粕: 'SOY_MEAL',
    大豆: 'SOYBEAN',
    小麦: 'WHEAT',
};

export const MARKET_INTEL_EVENT_TYPE_MAP: Record<string, string> = {
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
