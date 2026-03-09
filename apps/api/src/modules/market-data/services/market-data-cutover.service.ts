import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReconciliationM1ReadinessReportSnapshotDto,
  CreateReconciliationCutoverAutopilotDto,
  CreateReconciliationCutoverDecisionDto,
  ExecuteReconciliationRollbackDto,
  ListReconciliationCutoverCompensationBatchesQueryDto,
  ListReconciliationCutoverDecisionsQueryDto,
  ListReconciliationCutoverExecutionsQueryDto,
  ReconciliationCutoverCompensationBatchReportQueryDto,
  ReconciliationCutoverExecutionOverviewQueryDto,
  ReconciliationCutoverRuntimeStatusQueryDto,
  RetryReconciliationCutoverCompensationBatchDto,
  RetryReconciliationCutoverCompensationDto,
} from '@packages/types';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma';
import { ConfigService } from '../../config/config.service';
import {
  parseOptionalBoolean,
  parseFiniteNumber,
  parsePositiveInteger,
  parseJsonValue,
  toTimestampMs,
  isCutoverExecutionPersistenceMissingTableError,
  recordHasCutoverDataset,
  isCutoverExecutionCompensationPending,
  stringifyError,
  sleep,
  withTimeout,
  parseStandardDatasetsFromEnv,
  normalizeReconciliationDataset,
  buildCompensationBatchInFlightKey,
  buildCompensationSweepIdempotencyKey,
} from './market-data.helpers';
import { MarketDataPersistenceService } from './market-data-persistence.service';
import type {
  ReconciliationCutoverDecisionRecord,
  ReconciliationCutoverExecutionRecord,
  ReconciliationCutoverCompensationBatchRecord,
  ReconciliationCutoverCompensationBatchResponse,
  ReconciliationCutoverCompensationBatchResultItem,
  ReconciliationCutoverCompensationBatchControl,
  ReconciliationCutoverCompensationBatchSummary,
  ReconciliationCutoverCompensationSweepRun,
  ReconciliationCutoverCompensationSweepScope,
  RollbackDrillRecord,
  ReconciliationCutoverDecisionResult,
  PersistedReconciliationCutoverExecutionRow,
  ReconciliationM1ReadinessReportSnapshotResult,
} from './market-data.types';


type StandardDataset = 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT';
type ReconciliationCutoverDecisionStatus = 'APPROVED' | 'REJECTED';
type ReconciliationCutoverExecutionAction = 'CUTOVER' | 'ROLLBACK' | 'AUTOPILOT';
type ReconciliationCutoverExecutionStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'COMPENSATED';
type ReconciliationCutoverCompensationBatchStatus = 'DRY_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
type RollbackDrillStatus = 'PLANNED' | 'RUNNING' | 'PASSED' | 'FAILED';

/**
 * Delegate interface for cross-service calls back to MarketDataService.
 * Avoids circular dependency by keeping method signatures minimal.
 */
export interface MarketDataCutoverDelegate {
  createReconciliationM1ReadinessReportSnapshot(
    userId: string,
    dto: CreateReconciliationM1ReadinessReportSnapshotDto,
  ): Promise<ReconciliationM1ReadinessReportSnapshotResult>;
  createReconciliationRollbackDrill(
    userId: string,
    dto: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  getLatestRollbackDrillsByDataset(
    datasets: StandardDataset[],
  ): Promise<Map<StandardDataset, RollbackDrillRecord | undefined>>;
}

@Injectable()
export class MarketDataCutoverService {
  private readonly logger = new Logger(MarketDataCutoverService.name);

  // In-memory state
  readonly cutoverDecisionRecords = new Map<string, ReconciliationCutoverDecisionRecord>();
  readonly cutoverExecutionRecords = new Map<string, ReconciliationCutoverExecutionRecord>();
  readonly cutoverCompensationBatchRecords = new Map<string, ReconciliationCutoverCompensationBatchRecord>();
  readonly cutoverCompensationBatchInFlight = new Map<string, Promise<ReconciliationCutoverCompensationBatchResponse>>();

  private delegate?: MarketDataCutoverDelegate;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly persistenceService: MarketDataPersistenceService,
  ) { }

  setDelegate(delegate: MarketDataCutoverDelegate) {
    this.delegate = delegate;
  }

  private getDelegate(): MarketDataCutoverDelegate {
    if (!this.delegate) {
      throw new Error('MarketDataCutoverService delegate not set');
    }
    return this.delegate;
  }

  // ─── Extracted cutover + compensation methods ──────────────────────────────

  async createReconciliationCutoverDecision(
    userId: string,
    dto: CreateReconciliationCutoverDecisionDto,
  ): Promise<ReconciliationCutoverDecisionResult> {
    const snapshot = await this.getDelegate().createReconciliationM1ReadinessReportSnapshot(userId, {
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
    const persisted =
      await this.persistenceService.persistReconciliationCutoverDecisionRecord(record);

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
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);

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
              message: stringifyError(error),
            },
          },
        ],
        errorMessage: stringifyError(error),
        compensationApplied: false,
        createdAt,
      };
      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);
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
        await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);

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
        await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);

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
        await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);

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
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);

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
              message: stringifyError(error),
            },
          },
        ],
        errorMessage: stringifyError(error),
        compensationApplied: false,
        createdAt,
      };

      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);
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
        const drill = await this.getDelegate().createReconciliationRollbackDrill(userId, {
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
          drillId: drill.drillId as string,
          dataset: drill.dataset as StandardDataset,
          status: drill.status as RollbackDrillStatus,
          storage: drill.storage === 'database' ? 'database' : 'in-memory',
          createdAt: drill.createdAt as string,
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
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);

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
              message: stringifyError(error),
            },
          },
        ],
        errorMessage: stringifyError(error),
        compensationApplied: false,
        createdAt,
      };

      this.cutoverExecutionRecords.set(executionId, record);
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(record);
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
    const latestRollbackDrills = await this.getDelegate().getLatestRollbackDrillsByDataset(datasets);
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
          item.requestedByUserId === userId && toTimestampMs(item.createdAt) >= windowStartMs,
      );

    const filteredRecords = sourceRecords
      .filter((item) => recordHasCutoverDataset(item, datasets))
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));

    const summary = {
      totalExecutions: filteredRecords.length,
      successExecutions: filteredRecords.filter((item) => item.status === 'SUCCESS').length,
      failedExecutions: filteredRecords.filter((item) => item.status === 'FAILED').length,
      partialExecutions: filteredRecords.filter((item) => item.status === 'PARTIAL').length,
      compensatedExecutions: filteredRecords.filter((item) => item.status === 'COMPENSATED').length,
      compensationPendingExecutions: filteredRecords.filter((item) =>
        isCutoverExecutionCompensationPending(item),
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
          isCutoverExecutionCompensationPending(item),
        ).length,
      };
    });

    const latestCompensationPending = filteredRecords
      .filter((item) => isCutoverExecutionCompensationPending(item))
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

    const persisted = await this.persistenceService.listPersistedReconciliationCutoverExecutions(
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
    const persisted =
      await this.persistenceService.findPersistedReconciliationCutoverExecution(executionId);
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
              message: stringifyError(error),
            },
          },
        ],
        errorMessage: execution.errorMessage,
        compensationApplied: false,
        compensationAt: execution.compensationAt,
        compensationPayload: execution.compensationPayload,
        compensationError: stringifyError(error),
        createdAt: execution.createdAt,
      };

      this.cutoverExecutionRecords.set(
        failedCompensationRecord.executionId,
        failedCompensationRecord,
      );
      await this.persistenceService.persistReconciliationCutoverExecutionRecord(
        failedCompensationRecord,
      );
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
    await this.persistenceService.persistReconciliationCutoverExecutionRecord(updatedRecord);

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
      const inFlightKey = buildCompensationBatchInFlightKey(userId, idempotencyKey);
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

  async executeReconciliationCutoverCompensationBatch(input: {
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
      const persisted =
        await this.persistenceService.persistReconciliationCutoverCompensationBatchRecord(record);
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
            const compensation = await withTimeout(
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
              error: stringifyError(error),
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
    const persisted =
      await this.persistenceService.persistReconciliationCutoverCompensationBatchRecord(record);
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

    const persisted =
      await this.persistenceService.listPersistedReconciliationCutoverCompensationBatches(
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
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));

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
    const persisted =
      await this.persistenceService.findPersistedReconciliationCutoverCompensationBatch(batchId);
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
      parseOptionalBoolean(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED) ?? false;
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
        parsePositiveInteger(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS) ?? 7,
      ),
    );
    const limit = Math.max(
      1,
      Math.min(
        100,
        parsePositiveInteger(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT) ?? 20,
      ),
    );
    const maxConcurrency = Math.max(
      1,
      Math.min(
        10,
        parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY,
        ) ?? 3,
      ),
    );
    const perExecutionTimeoutMs = Math.max(
      1000,
      Math.min(
        120000,
        parsePositiveInteger(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS) ??
        30000,
      ),
    );
    const stopOnFailureCountValue = parsePositiveInteger(
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_STOP_ON_FAILURE_COUNT,
    );
    const stopOnFailureCount = stopOnFailureCountValue ?? undefined;
    const stopOnFailureRateRaw = parseFiniteNumber(
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
        parsePositiveInteger(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MIN_PROCESSED) ??
        3,
      ),
    );
    const disableReconciliationGate =
      parseOptionalBoolean(
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DISABLE_RECONCILIATION_GATE,
      ) ?? true;
    const datasets = this.resolveRequestedStandardDatasets(
      parseStandardDatasetsFromEnv(process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS),
    );
    const idempotencySlotMinutes = Math.max(
      1,
      Math.min(
        60,
        parsePositiveInteger(
          process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES,
        ) ?? 10,
      ),
    );
    const idempotencyKeyBase = buildCompensationSweepIdempotencyKey(idempotencySlotMinutes);

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

  toReconciliationCutoverCompensationBatchResponse(
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

  async findReconciliationCutoverCompensationBatchByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<ReconciliationCutoverCompensationBatchRecord | null> {
    const persisted =
      await this.persistenceService.findPersistedReconciliationCutoverCompensationBatchByIdempotencyKey(
        userId,
        idempotencyKey,
      );
    if (persisted) {
      return persisted;
    }

    const local = Array.from(this.cutoverCompensationBatchRecords.values())
      .filter((item) => item.requestedByUserId === userId)
      .filter((item) => item.idempotencyKey === idempotencyKey)
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt))[0];

    return local ?? null;
  }

  async findReconciliationCutoverCompensationBatchByIdempotencyKeyWithRetry(
    userId: string,
    idempotencyKey: string,
  ): Promise<ReconciliationCutoverCompensationBatchRecord | null> {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const record = await this.findReconciliationCutoverCompensationBatchByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (record) {
        return record;
      }
      if (attempt < maxAttempts - 1) {
        await sleep(120 * (attempt + 1));
      }
    }
    return null;
  }

  async tryRecoverCompensationBatchByIdempotencyKey(
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

  async listUsersWithCompensationPendingExecutions(
    windowDays: number,
    datasets: StandardDataset[],
  ): Promise<string[]> {
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    if (!this.persistenceService.cutoverExecutionPersistenceUnavailable) {
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
          const rowDatasetsRaw = parseJsonValue<unknown[]>(row.datasets) ?? [];
          const rowDatasets = rowDatasetsRaw
            .map((item) => normalizeReconciliationDataset(String(item)) as StandardDataset)
            .filter((item, index, all) => all.indexOf(item) === index);
          if (this.hasDatasetOverlap(rowDatasets, datasets)) {
            userIds.add(row.requestedByUserId);
          }
        }

        return Array.from(userIds.values()).sort((a, b) => a.localeCompare(b));
      } catch (error) {
        if (isCutoverExecutionPersistenceMissingTableError(error)) {
          this.persistenceService.disableCutoverExecutionPersistence(
            'list pending compensation users',
            error,
          );
        } else {
          this.logger.warn(`List pending compensation users failed: ${stringifyError(error)}`);
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
      if (toTimestampMs(record.createdAt) < windowStartMs) {
        continue;
      }
      if (!recordHasCutoverDataset(record, datasets)) {
        continue;
      }
      userIds.add(record.requestedByUserId);
    }

    return Array.from(userIds.values()).sort((a, b) => a.localeCompare(b));
  }

  resolveAggregateCompensationBatchStatus(
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

  hasDatasetOverlap(source: StandardDataset[], target: StandardDataset[]): boolean {
    if (target.length === 0) {
      return true;
    }
    return source.some((dataset) => target.includes(dataset));
  }

  renderReconciliationCutoverCompensationBatchMarkdown(
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

    const persisted = await this.persistenceService.listPersistedReconciliationCutoverDecisions(
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
    const persisted =
      await this.persistenceService.findPersistedReconciliationCutoverDecision(decisionId);
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

  resolveRequestedStandardDatasets(datasets?: StandardDataset[]): StandardDataset[] {
    const normalized = (datasets ?? [])
      .map((dataset) => normalizeReconciliationDataset(dataset) as StandardDataset)
      .filter((dataset, index, all) => all.indexOf(dataset) === index);

    if (normalized.length > 0) {
      return normalized;
    }

    return ['SPOT_PRICE', 'FUTURES_QUOTE', 'MARKET_EVENT'];
  }

  async getLatestReconciliationCutoverDecision(
    userId: string,
  ): Promise<ReconciliationCutoverDecisionRecord | null> {
    const persisted = await this.persistenceService.listPersistedReconciliationCutoverDecisions(
      userId,
      1,
      1,
      {},
    );
    if (persisted && persisted.items.length > 0) {
      return persisted.items[0];
    }

    const local = Array.from(this.cutoverDecisionRecords.values())
      .filter((item) => item.requestedByUserId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return local[0] ?? null;
  }

  resolveCutoverDecisionReasonCodes(summary: {
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

  async listRecentPersistedReconciliationCutoverExecutions(
    userId: string,
    createdAtFrom: Date,
  ): Promise<ReconciliationCutoverExecutionRecord[] | null> {
    if (this.persistenceService.cutoverExecutionPersistenceUnavailable) {
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

      return rows.map((row) =>
        this.persistenceService.mapPersistedReconciliationCutoverExecutionRow(row),
      );
    } catch (error) {
      if (isCutoverExecutionPersistenceMissingTableError(error)) {
        this.persistenceService.disableCutoverExecutionPersistence(
          'list recent cutover execution records',
          error,
        );
        return null;
      }
      this.logger.error(`List recent cutover execution records failed: ${stringifyError(error)}`);
      return null;
    }
  }
}
