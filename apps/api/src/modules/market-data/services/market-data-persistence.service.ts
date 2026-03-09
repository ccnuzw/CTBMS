// ─── Market Data Persistence Service ─────────────────────────────────────────
// Extracted from market-data.service.ts during refactoring.
// Handles all database read/write operations for market-data module.

import { Injectable, Logger } from '@nestjs/common';
import type {
  CreateReconciliationJobDto,
  ReconciliationDataset,
  ReconciliationRollbackDrillStatus,
  ReconciliationSummaryDto,
} from '@packages/types';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma';
import {
  parseOptionalBoolean,
  parseBoolean,
  parseFiniteNumber,
  parseNonNegativeInteger,
  parseInteger,
  parseRetryCount,
  parseJsonValue,
  toUtcDateKey,
  toIsoString,
  normalizeCoverageRate,
  normalizeReconciliationStatus,
  normalizeRollbackDrillStatus,
  normalizeReconciliationDataset,
  extractScalarDimensions,
  isReconciliationPersistenceMissingTableError,
  isReconciliationDailyMetricsPersistenceMissingTableError,
  isRollbackDrillPersistenceMissingTableError,
  isM1ReadinessReportPersistenceMissingTableError,
  isCutoverDecisionPersistenceMissingTableError,
  isCutoverExecutionPersistenceMissingTableError,
  isCutoverCompensationBatchPersistenceMissingTableError,
  isCutoverCompensationBatchIdempotencyConflict,
  stringifyError,
} from './market-data.helpers';
import type {
  M1ReadinessReportSnapshotRecord,
  PersistedM1ReadinessReportSnapshotRow,
  PersistedReconciliationCutoverCompensationBatchRow,
  PersistedReconciliationCutoverDecisionRow,
  PersistedReconciliationCutoverExecutionRow,
  PersistedReconciliationDiffRow,
  PersistedReconciliationGateRow,
  PersistedReconciliationJobRetryRow,
  PersistedReconciliationJobRow,
  PersistedRollbackDrillRow,
  ReconciliationCutoverCompensationBatchRecord,
  ReconciliationCutoverCompensationBatchResultItem,
  ReconciliationCutoverDecisionRecord,
  ReconciliationM1ReadinessResult,
  ReconciliationCutoverExecutionRecord,
  ReconciliationGateSnapshot,
  ReconciliationJob,
  ReconciliationJobListResult,
  ReconciliationM1ReadinessReportSnapshotResult,
  ReconciliationCutoverDecisionResult,
  ReconciliationWindowMetricsResult,
  RollbackDrillRecord,
} from './market-data.types';
import {
  RECONCILIATION_SORT_COLUMN_MAP,
} from './market-data.types';

type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';
type ReconciliationJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
type ReconciliationM1ReadinessReportFormat = 'json' | 'markdown';
type ReconciliationCutoverDecisionStatus = 'APPROVED' | 'REJECTED';
type ReconciliationCutoverExecutionAction = 'CUTOVER' | 'ROLLBACK' | 'AUTOPILOT';
type ReconciliationCutoverExecutionStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'COMPENSATED';
type ReconciliationCutoverCompensationBatchStatus = 'DRY_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
type RollbackDrillStatus = ReconciliationRollbackDrillStatus;
type ReconciliationListSortBy = 'createdAt' | 'startedAt' | 'finishedAt' | 'status' | 'dataset';
type ReconciliationListSortOrder = 'asc' | 'desc';


@Injectable()
export class MarketDataPersistenceService {
  private readonly logger = new Logger(MarketDataPersistenceService.name);

  // Persistence availability flags
  reconciliationPersistenceUnavailable = false;
  reconciliationDailyMetricsPersistenceUnavailable = false;
  rollbackDrillPersistenceUnavailable = false;
  m1ReadinessReportPersistenceUnavailable = false;
  cutoverDecisionPersistenceUnavailable = false;
  cutoverExecutionPersistenceUnavailable = false;
  cutoverCompensationBatchPersistenceUnavailable = false;

  constructor(private readonly prisma: PrismaService) { }

  // ─── Disable persistence methods ──────────────────────────────────────────

  disableReconciliationPersistence(operation: string, error: unknown) {
    if (this.reconciliationPersistenceUnavailable) return;
    this.reconciliationPersistenceUnavailable = true;
    this.logger.warn(`Reconciliation persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  disableReconciliationDailyMetricsPersistence(operation: string, error: unknown) {
    if (this.reconciliationDailyMetricsPersistenceUnavailable) return;
    this.reconciliationDailyMetricsPersistenceUnavailable = true;
    this.logger.warn(`Reconciliation daily metrics persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  disableRollbackDrillPersistence(operation: string, error: unknown) {
    if (this.rollbackDrillPersistenceUnavailable) return;
    this.rollbackDrillPersistenceUnavailable = true;
    this.logger.warn(`Rollback drill persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  disableM1ReadinessReportPersistence(operation: string, error: unknown) {
    if (this.m1ReadinessReportPersistenceUnavailable) return;
    this.m1ReadinessReportPersistenceUnavailable = true;
    this.logger.warn(`M1 readiness report persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  disableCutoverDecisionPersistence(operation: string, error: unknown) {
    if (this.cutoverDecisionPersistenceUnavailable) return;
    this.cutoverDecisionPersistenceUnavailable = true;
    this.logger.warn(`Cutover decision persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  disableCutoverExecutionPersistence(operation: string, error: unknown) {
    if (this.cutoverExecutionPersistenceUnavailable) return;
    this.cutoverExecutionPersistenceUnavailable = true;
    this.logger.warn(`Cutover execution persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  disableCutoverCompensationBatchPersistence(operation: string, error: unknown) {
    if (this.cutoverCompensationBatchPersistenceUnavailable) return;
    this.cutoverCompensationBatchPersistenceUnavailable = true;
    this.logger.warn(`Cutover compensation batch persistence disabled (${operation}): ${stringifyError(error)}`);
  }

  // ─── Extracted persistence methods ────────────────────────────────────────

  mapPersistedRollbackDrillRow(row: PersistedRollbackDrillRow): RollbackDrillRecord {
    return {
      drillId: row.drillId,
      dataset: normalizeReconciliationDataset(row.dataset) as StandardDataset,
      workflowVersionId: row.workflowVersionId ?? undefined,
      scenario: row.scenario,
      status: normalizeRollbackDrillStatus(row.status),
      startedAt: toIsoString(row.startedAt) ?? new Date().toISOString(),
      completedAt: toIsoString(row.completedAt),
      durationSeconds: parseNonNegativeInteger(row.durationSeconds),
      rollbackPath: row.rollbackPath ?? undefined,
      resultSummary: parseJsonValue<Record<string, unknown>>(row.resultSummary),
      notes: row.notes ?? undefined,
      triggeredByUserId: row.triggeredByUserId,
      createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  async persistM1ReadinessReportSnapshot(
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
      if (isM1ReadinessReportPersistenceMissingTableError(error)) {
        this.disableM1ReadinessReportPersistence('persist m1 readiness report snapshot', error);
        return false;
      }
      this.logger.error(
        `Persist m1 readiness report snapshot failed: ${stringifyError(error)}`,
      );
      return false;
    }
  }

  async listPersistedM1ReadinessReportSnapshots(
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
      if (isM1ReadinessReportPersistenceMissingTableError(error)) {
        this.disableM1ReadinessReportPersistence('list m1 readiness report snapshots', error);
        return null;
      }
      this.logger.error(`List m1 readiness report snapshots failed: ${stringifyError(error)}`);
      return null;
    }
  }

  async findPersistedM1ReadinessReportSnapshot(
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
      if (isM1ReadinessReportPersistenceMissingTableError(error)) {
        this.disableM1ReadinessReportPersistence('find m1 readiness report snapshot', error);
        return null;
      }
      this.logger.error(`Find m1 readiness report snapshot failed: ${stringifyError(error)}`);
      return null;
    }
  }

  mapPersistedM1ReadinessReportSnapshotRow(
    row: PersistedM1ReadinessReportSnapshotRow,
  ): M1ReadinessReportSnapshotRecord {
    const format = this.normalizeM1ReadinessReportFormat(row.format);
    const readiness =
      parseJsonValue<ReconciliationM1ReadinessResult>(row.readinessSnapshot) ??
      (this.createEmptyM1ReadinessSnapshot() as ReconciliationM1ReadinessResult);
    const reportPayload = parseJsonValue<Record<string, unknown>>(row.reportPayload);
    const report =
      format === 'markdown'
        ? typeof reportPayload?.markdown === 'string'
          ? reportPayload.markdown
          : ''
        : ((reportPayload?.json as ReconciliationM1ReadinessResult | undefined) ?? readiness);

    const datasetsRaw = parseJsonValue<unknown[]>(row.datasets);
    const datasets = (datasetsRaw ?? [])
      .map((item) => normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);

    return {
      snapshotId: row.snapshotId,
      format,
      fileName: row.fileName,
      windowDays: parseInteger(row.windowDays),
      targetCoverageRate: normalizeCoverageRate(row.targetCoverageRate, 0.9),
      datasets,
      readiness,
      report,
      requestedByUserId: row.requestedByUserId,
      createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  async persistReconciliationCutoverDecisionRecord(
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
      if (isCutoverDecisionPersistenceMissingTableError(error)) {
        this.disableCutoverDecisionPersistence('persist cutover decision record', error);
        return false;
      }
      this.logger.error(`Persist cutover decision record failed: ${stringifyError(error)}`);
      return false;
    }
  }

  async listPersistedReconciliationCutoverDecisions(
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
      if (isCutoverDecisionPersistenceMissingTableError(error)) {
        this.disableCutoverDecisionPersistence('list cutover decision records', error);
        return null;
      }
      this.logger.error(`List cutover decision records failed: ${stringifyError(error)}`);
      return null;
    }
  }

  async findPersistedReconciliationCutoverDecision(
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
      if (isCutoverDecisionPersistenceMissingTableError(error)) {
        this.disableCutoverDecisionPersistence('find cutover decision record', error);
        return null;
      }
      this.logger.error(`Find cutover decision record failed: ${stringifyError(error)}`);
      return null;
    }
  }

  mapPersistedReconciliationCutoverDecisionRow(
    row: PersistedReconciliationCutoverDecisionRow,
  ): ReconciliationCutoverDecisionRecord {
    const reasonCodesRaw = parseJsonValue<unknown[]>(row.reasonCodes) ?? [];
    const reasonCodes = reasonCodesRaw
      .map((item) => String(item))
      .filter((item) => item.trim().length > 0);
    const datasetsRaw = parseJsonValue<unknown[]>(row.datasets) ?? [];
    const datasets = datasetsRaw
      .map((item) => normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);
    const readinessSummary = parseJsonValue<
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
      windowDays: parseInteger(row.windowDays),
      targetCoverageRate: normalizeCoverageRate(row.targetCoverageRate, 0.9),
      datasets,
      reportFormat: this.normalizeM1ReadinessReportFormat(row.reportFormat),
      reportSnapshotId: row.reportSnapshotId,
      readinessSummary,
      note: row.note ?? undefined,
      requestedByUserId: row.requestedByUserId,
      createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  async persistReconciliationCutoverExecutionRecord(
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
      if (isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('persist cutover execution record', error);
        return false;
      }
      this.logger.error(`Persist cutover execution record failed: ${stringifyError(error)}`);
      return false;
    }
  }

  async listPersistedReconciliationCutoverExecutions(
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
      if (isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('list cutover execution records', error);
        return null;
      }
      this.logger.error(`List cutover execution records failed: ${stringifyError(error)}`);
      return null;
    }
  }

  async listRecentPersistedReconciliationCutoverExecutions(
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
      if (isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('list recent cutover execution records', error);
        return null;
      }
      this.logger.error(
        `List recent cutover execution records failed: ${stringifyError(error)}`,
      );
      return null;
    }
  }

  async findPersistedReconciliationCutoverExecution(
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
      if (isCutoverExecutionPersistenceMissingTableError(error)) {
        this.disableCutoverExecutionPersistence('find cutover execution record', error);
        return null;
      }
      this.logger.error(`Find cutover execution record failed: ${stringifyError(error)}`);
      return null;
    }
  }

  mapPersistedReconciliationCutoverExecutionRow(
    row: PersistedReconciliationCutoverExecutionRow,
  ): ReconciliationCutoverExecutionRecord {
    const datasetsRaw = parseJsonValue<unknown[]>(row.datasets) ?? [];
    const datasets = datasetsRaw
      .map((item) => normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);

    const configBeforeRaw = parseJsonValue<Record<string, unknown>>(row.configBefore);
    const configAfterRaw = parseJsonValue<Record<string, unknown>>(row.configAfter);
    const stepTrace = parseJsonValue<Array<Record<string, unknown>>>(row.stepTrace) ?? [];

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
      applied: parseBoolean(row.applied),
      configBefore: configBeforeRaw
        ? {
          standardizedRead: parseBoolean(configBeforeRaw.standardizedRead),
          reconciliationGate: parseBoolean(configBeforeRaw.reconciliationGate),
        }
        : undefined,
      configAfter: configAfterRaw
        ? {
          standardizedRead: parseBoolean(configAfterRaw.standardizedRead),
          reconciliationGate: parseBoolean(configAfterRaw.reconciliationGate),
        }
        : undefined,
      stepTrace,
      errorMessage: row.errorMessage ?? undefined,
      compensationApplied: parseBoolean(row.compensationApplied),
      compensationAt: toIsoString(row.compensationAt),
      compensationPayload:
        parseJsonValue<Record<string, unknown>>(row.compensationPayload) ?? undefined,
      compensationError: row.compensationError ?? undefined,
      createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }



  async persistReconciliationCutoverCompensationBatchRecord(
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
      if (isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'persist cutover compensation batch record',
          error,
        );
        return false;
      }
      if (isCutoverCompensationBatchIdempotencyConflict(error)) {
        return false;
      }
      this.logger.error(
        `Persist cutover compensation batch record failed: ${stringifyError(error)}`,
      );
      return false;
    }
  }

  async listPersistedReconciliationCutoverCompensationBatches(
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
      if (isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'list cutover compensation batch records',
          error,
        );
        return null;
      }
      this.logger.error(
        `List cutover compensation batch records failed: ${stringifyError(error)}`,
      );
      return null;
    }
  }

  async findPersistedReconciliationCutoverCompensationBatch(
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
      if (isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'find cutover compensation batch record',
          error,
        );
        return null;
      }
      this.logger.error(
        `Find cutover compensation batch record failed: ${stringifyError(error)}`,
      );
      return null;
    }
  }

  async findPersistedReconciliationCutoverCompensationBatchByIdempotencyKey(
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
      if (isCutoverCompensationBatchPersistenceMissingTableError(error)) {
        this.disableCutoverCompensationBatchPersistence(
          'find cutover compensation batch by idempotency key',
          error,
        );
        return null;
      }
      this.logger.error(
        `Find cutover compensation batch by idempotency key failed: ${stringifyError(error)}`,
      );
      return null;
    }
  }

  mapPersistedReconciliationCutoverCompensationBatchRow(
    row: PersistedReconciliationCutoverCompensationBatchRow,
  ): ReconciliationCutoverCompensationBatchRecord {
    const datasetsRaw = parseJsonValue<unknown[]>(row.datasets) ?? [];
    const datasets = datasetsRaw
      .map((item) => normalizeReconciliationDataset(String(item)) as StandardDataset)
      .filter((item, index, all) => all.indexOf(item) === index);

    const resultsRaw =
      parseJsonValue<Array<Record<string, unknown>>>(row.results) ??
      ([] as Array<Record<string, unknown>>);
    const results: ReconciliationCutoverCompensationBatchResultItem[] = resultsRaw.map((item) => ({
      executionId: String(item.executionId ?? ''),
      action: this.normalizeCutoverExecutionAction(item.action),
      statusBefore:
        item.statusBefore === 'PARTIAL' || item.statusBefore === 'FAILED'
          ? item.statusBefore
          : 'FAILED',
      compensated: parseBoolean(item.compensated),
      compensationExecutionId:
        typeof item.compensationExecutionId === 'string' ? item.compensationExecutionId : undefined,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
      error: typeof item.error === 'string' ? item.error : undefined,
    }));

    const summaryRaw = parseJsonValue<Record<string, unknown>>(row.summary) ?? {};
    const controlRaw = parseJsonValue<Record<string, unknown>>(row.control) ?? {};

    return {
      batchId: row.batchId,
      status: this.normalizeCutoverCompensationBatchStatus(row.status),
      dryRun: parseBoolean(row.dryRun),
      replayed: parseBoolean(row.replayed),
      idempotencyKey: row.idempotencyKey ?? undefined,
      requestedByUserId: row.requestedByUserId,
      windowDays: parseInteger(row.windowDays) || 7,
      datasets,
      requestedLimit: parseInteger(row.requestedLimit) || 20,
      disableReconciliationGate: parseBoolean(row.disableReconciliationGate),
      workflowVersionId: row.workflowVersionId ?? undefined,
      note: row.note ?? undefined,
      reason: row.reason ?? undefined,
      storage: row.storage === 'in-memory' ? 'in-memory' : 'database',
      control: {
        maxConcurrency: parseInteger(controlRaw.maxConcurrency) || 3,
        perExecutionTimeoutMs: parseInteger(controlRaw.perExecutionTimeoutMs) || 30000,
        stopOnFailureCount: parseNonNegativeInteger(controlRaw.stopOnFailureCount),
        stopOnFailureRate: parseFiniteNumber(controlRaw.stopOnFailureRate),
        minProcessedForFailureRate: parseInteger(controlRaw.minProcessedForFailureRate) || 3,
      },
      scanned: parseInteger(row.scanned),
      matched: parseInteger(row.matched),
      attempted: parseInteger(row.attempted),
      results,
      summary: {
        compensated: parseInteger(summaryRaw.compensated),
        failed: parseInteger(summaryRaw.failed),
        skipped: parseInteger(summaryRaw.skipped),
        processed: parseInteger(summaryRaw.processed),
        breakerTriggered: parseBoolean(summaryRaw.breakerTriggered),
        breakerReason:
          typeof summaryRaw.breakerReason === 'string' ? summaryRaw.breakerReason : undefined,
      },
      createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    };
  }

  normalizeM1ReadinessReportFormat(value: unknown): ReconciliationM1ReadinessReportFormat {
    if (value === 'json' || value === 'markdown') {
      return value;
    }
    return 'markdown';
  }

  normalizeCutoverExecutionAction(value: unknown): ReconciliationCutoverExecutionAction {
    if (value === 'CUTOVER' || value === 'ROLLBACK' || value === 'AUTOPILOT') {
      return value;
    }
    return 'AUTOPILOT';
  }

  normalizeCutoverExecutionStatus(value: unknown): ReconciliationCutoverExecutionStatus {
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

  normalizeCutoverCompensationBatchStatus(
    value: unknown,
  ): ReconciliationCutoverCompensationBatchStatus {
    if (value === 'DRY_RUN' || value === 'SUCCESS' || value === 'PARTIAL' || value === 'FAILED') {
      return value;
    }
    return 'FAILED';
  }

  normalizeCutoverDecisionStatus(value: unknown): ReconciliationCutoverDecisionStatus {
    if (value === 'APPROVED' || value === 'REJECTED') {
      return value;
    }
    return 'REJECTED';
  }

  createEmptyM1ReadinessSnapshot(): ReconciliationM1ReadinessResult {
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

  async persistReconciliationDailyMetric(
    metrics: ReconciliationWindowMetricsResult,
    generatedAt: Date,
  ) {
    if (this.reconciliationDailyMetricsPersistenceUnavailable) {
      return;
    }

    const metricDateKey = toUtcDateKey(generatedAt);
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
      if (isReconciliationDailyMetricsPersistenceMissingTableError(error)) {
        this.disableReconciliationDailyMetricsPersistence('persist daily metrics snapshot', error);
        return;
      }
      this.logger.error(
        `Persist daily reconciliation metrics failed: ${stringifyError(error)}`,
      );
    }
  }

  async persistRollbackDrillRecord(record: RollbackDrillRecord): Promise<boolean> {
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
      if (isRollbackDrillPersistenceMissingTableError(error)) {
        this.disableRollbackDrillPersistence('persist rollback drill', error);
        return false;
      }
      this.logger.error(`Persist rollback drill failed: ${stringifyError(error)}`);
      return false;
    }
  }

  async listPersistedRollbackDrillRecords(
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
        dataset: normalizeReconciliationDataset(row.dataset) as StandardDataset,
        workflowVersionId: row.workflowVersionId ?? undefined,
        scenario: row.scenario,
        status: normalizeRollbackDrillStatus(row.status),
        startedAt: toIsoString(row.startedAt) ?? new Date().toISOString(),
        completedAt: toIsoString(row.completedAt),
        durationSeconds: parseNonNegativeInteger(row.durationSeconds),
        rollbackPath: row.rollbackPath ?? undefined,
        resultSummary: parseJsonValue<Record<string, unknown>>(row.resultSummary),
        notes: row.notes ?? undefined,
        triggeredByUserId: row.triggeredByUserId,
        createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
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
      if (isRollbackDrillPersistenceMissingTableError(error)) {
        this.disableRollbackDrillPersistence('list rollback drills', error);
        return null;
      }
      this.logger.error(`List rollback drills failed: ${stringifyError(error)}`);
      return null;
    }
  }

  async persistReconciliationJobSnapshot(
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
    const retryCount = parseRetryCount(job.retryCount);
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
      if (isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('persist snapshot', error);
        return;
      }
      this.logger.error(
        `Persist reconciliation snapshot failed for job ${job.jobId}: ${stringifyError(error)}`,
      );
    }
  }

  async replacePersistedReconciliationDiffs(
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
      if (isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('persist diffs', error);
        return;
      }
      this.logger.error(
        `Persist reconciliation diffs failed for job ${jobId}: ${stringifyError(error)}`,
      );
    }
  }

  async listPersistedReconciliationJobs(
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
        const summary = parseJsonValue<ReconciliationSummaryDto>(row.summary);
        return {
          jobId: row.jobId,
          status: normalizeReconciliationStatus(row.status),
          dataset: normalizeReconciliationDataset(row.dataset),
          retriedFromJobId: row.retriedFromJobId ?? null,
          retryCount: parseRetryCount(row.retryCount),
          createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
          startedAt: toIsoString(row.startedAt),
          finishedAt: toIsoString(row.finishedAt),
          cancelledAt: toIsoString(row.cancelledAt),
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
      if (isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('list persisted jobs', error);
        return null;
      }
      this.logger.error(`List persisted reconciliation jobs failed: ${stringifyError(error)}`);
      return null;
    }
  }

  async findLatestPersistedReconciliationForGate(
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
        status: normalizeReconciliationStatus(row.status),
        retriedFromJobId: row.retriedFromJobId ?? null,
        retryCount: parseRetryCount(row.retryCount),
        summaryPass: parseOptionalBoolean(row.summaryPass),
        createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
        finishedAt: toIsoString(row.finishedAt),
        cancelledAt: toIsoString(row.cancelledAt),
        dimensions: extractScalarDimensions(
          parseJsonValue<Record<string, unknown>>(row.dimensions),
        ),
        source: 'database',
      };
    } catch (error) {
      if (isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('read latest reconciliation for gate', error);
        return null;
      }
      this.logger.error(
        `Read latest reconciliation for gate failed: ${stringifyError(error)}`,
      );
      return null;
    }
  }

  async findPersistedReconciliationJob(jobId: string): Promise<ReconciliationJob | null> {
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
      const summary = parseJsonValue<ReconciliationSummaryDto>(row.summary);
      return {
        jobId: row.jobId,
        status: normalizeReconciliationStatus(row.status),
        dataset: normalizeReconciliationDataset(row.dataset),
        retriedFromJobId: row.retriedFromJobId ?? undefined,
        retryCount: parseRetryCount(row.retryCount),
        createdByUserId: row.createdByUserId,
        createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
        startedAt: toIsoString(row.startedAt),
        finishedAt: toIsoString(row.finishedAt),
        cancelledAt: toIsoString(row.cancelledAt),
        cancelReason: row.cancelReason ?? undefined,
        summaryPass: this.resolveSummaryPass(summary, row.summaryPass),
        summary,
        sampleDiffs: diffRows
          .map((item) => parseJsonValue<Record<string, unknown>>(item.payload))
          .filter((item): item is Record<string, unknown> => !!item),
        error: row.errorMessage ?? undefined,
      };
    } catch (error) {
      if (isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('read persisted job', error);
        return null;
      }
      this.logger.error(`Read persisted reconciliation job failed: ${stringifyError(error)}`);
      return null;
    }
  }

  async findPersistedReconciliationJobForRetry(jobId: string): Promise<{
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
      const from = toIsoString(row.timeRangeFrom);
      const to = toIsoString(row.timeRangeTo);
      const status = normalizeReconciliationStatus(row.status);

      if (!from || !to) {
        return {
          createdByUserId: row.createdByUserId,
          status,
          retryCount: parseRetryCount(row.retryCount),
          request: undefined,
        };
      }

      const thresholdRaw =
        parseJsonValue<{ maxDiffRate?: unknown; maxMissingRate?: unknown }>(row.threshold) ??
        {};

      const request: CreateReconciliationJobDto = {
        dataset: normalizeReconciliationDataset(row.dataset),
        timeRange: {
          from,
          to,
        },
        dimensions: parseJsonValue<Record<string, unknown>>(row.dimensions) ?? undefined,
        threshold: {
          maxDiffRate: parseFiniteNumber(thresholdRaw.maxDiffRate) ?? 0.01,
          maxMissingRate: parseFiniteNumber(thresholdRaw.maxMissingRate) ?? 0.005,
        },
      };

      return {
        createdByUserId: row.createdByUserId,
        status,
        retryCount: parseRetryCount(row.retryCount),
        request,
      };
    } catch (error) {
      if (isReconciliationPersistenceMissingTableError(error)) {
        this.disableReconciliationPersistence('read persisted retry payload', error);
        return null;
      }
      this.logger.error(
        `Read persisted reconciliation retry payload failed: ${stringifyError(error)}`,
      );
      return null;
    }
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

}
