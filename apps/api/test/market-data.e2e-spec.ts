import assert from 'node:assert/strict';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { MockAuthMiddleware } from '../src/common/middleware/mock-auth.middleware';
import { MarketDataModule, MarketDataService } from '../src/modules/market-data';
import { PrismaModule } from '../src/prisma';

@Module({
  imports: [PrismaModule, MarketDataModule],
})
class MarketDataE2eModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MockAuthMiddleware).forRoutes('*');
  }
}

const fetchJson = async <T>(
  input: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> => {
  const response = await fetch(input, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body };
};

async function main() {
  const app = await NestFactory.create(MarketDataE2eModule, { logger: false });
  app.useGlobalPipes(new ZodValidationPipe());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const marketDataService = app.get(MarketDataService);

  try {
    const query = await fetchJson<{
      success: boolean;
      data: { rows: unknown[]; meta: Record<string, unknown> };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        limit: 10,
      }),
    });
    assert.equal(query.status, 201);
    assert.equal(query.body.success, true);
    assert.ok(Array.isArray(query.body.data.rows));

    const aggregate = await fetchJson<{
      success: boolean;
      data: { rows: unknown[]; meta: Record<string, unknown> };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/aggregate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        groupBy: ['commodityCode'],
        metrics: [{ field: 'spotPrice', op: 'avg', as: 'avgSpotPrice' }],
        limit: 100,
      }),
    });
    assert.equal(aggregate.status, 201);
    assert.equal(aggregate.body.success, true);
    assert.ok(Array.isArray(aggregate.body.data.rows));

    const preview = await fetchJson<{
      success: boolean;
      data: { dataset: string; previewRows: unknown[] };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/standardization/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
        'x-trace-id': 'tr_market_data_preview_e2e',
      },
      body: JSON.stringify({
        dataset: 'PRICE_DATA',
        sampleLimit: 5,
        mappingVersion: 'v1',
      }),
    });
    assert.equal(preview.status, 201);
    assert.equal(preview.body.success, true);
    assert.equal(preview.body.data.dataset, 'PRICE_DATA');
    assert.ok(Array.isArray(preview.body.data.previewRows));
    assert.equal(preview.body.traceId, 'tr_market_data_preview_e2e');

    const reconcileCreated = await fetchJson<{
      success: boolean;
      data: { jobId: string; status: string; retriedFromJobId: string | null; retryCount: number };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        timeRange: {
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
        },
        threshold: {
          maxDiffRate: 0.05,
          maxMissingRate: 0.05,
        },
      }),
    });
    assert.equal(reconcileCreated.status, 201);
    assert.equal(reconcileCreated.body.success, true);
    assert.ok(reconcileCreated.body.data.jobId.length > 0);
    assert.equal(reconcileCreated.body.data.retriedFromJobId, null);
    assert.equal(reconcileCreated.body.data.retryCount, 0);

    const gateEvaluation = await fetchJson<{
      success: boolean;
      data: {
        enabled: boolean;
        passed: boolean;
        reason: string;
        checkedAt: string;
        maxAgeMinutes?: number;
        ageMinutes?: number;
        latest?: { jobId: string; status: string };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/gate/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        filters: {
          commodityCode: 'CORN',
        },
      }),
    });
    assert.equal(gateEvaluation.status, 201);
    assert.equal(gateEvaluation.body.success, true);
    assert.ok(gateEvaluation.body.data.reason.length > 0);
    assert.ok(gateEvaluation.body.data.checkedAt.length > 0);

    const windowMetrics = await fetchJson<{
      success: boolean;
      data: {
        dataset: string;
        windowDays: number;
        source: string;
        totalJobs: number;
        doneJobs: number;
        passedJobs: number;
        daily: Array<{ date: string; passed: boolean; totalJobs: number }>;
        consecutivePassedDays: number;
        meetsWindowTarget: boolean;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/window?dataset=SPOT_PRICE&days=7`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(windowMetrics.status, 200);
    assert.equal(windowMetrics.body.success, true);
    assert.equal(windowMetrics.body.data.dataset, 'SPOT_PRICE');
    assert.equal(windowMetrics.body.data.windowDays, 7);
    assert.equal(windowMetrics.body.data.daily.length, 7);

    const snapshotMetrics = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        windowDays: number;
        source: string;
        results: Array<{
          dataset: string;
          totalJobs: number;
          passedJobs: number;
          consecutivePassedDays: number;
          meetsWindowTarget: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        datasets: ['SPOT_PRICE'],
      }),
    });
    assert.equal(snapshotMetrics.status, 201);
    assert.equal(snapshotMetrics.body.success, true);
    assert.equal(snapshotMetrics.body.data.windowDays, 7);
    assert.ok(snapshotMetrics.body.data.results.some((item) => item.dataset === 'SPOT_PRICE'));

    const dailyMetricsHistory = await fetchJson<{
      success: boolean;
      data: {
        dataset: string;
        windowDays: number;
        days: number;
        source: string;
        items: Array<{
          metricDate: string;
          totalJobs: number;
          doneJobs: number;
          passedJobs: number;
          dayPassed: boolean;
          consecutivePassedDays: number;
          meetsWindowTarget: boolean;
          generatedAt: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/daily?dataset=SPOT_PRICE&windowDays=7&days=30`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(dailyMetricsHistory.status, 200);
    assert.equal(dailyMetricsHistory.body.success, true);
    assert.equal(dailyMetricsHistory.body.data.dataset, 'SPOT_PRICE');
    assert.equal(dailyMetricsHistory.body.data.windowDays, 7);

    const readCoverage = await fetchJson<{
      success: boolean;
      data: {
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
          coverageRate: number;
          meetsTarget: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/read-coverage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        days: 7,
        targetCoverageRate: 0.9,
      }),
    });
    assert.equal(readCoverage.status, 201);
    assert.equal(readCoverage.body.success, true);
    assert.equal(readCoverage.body.data.windowDays, 7);
    assert.equal(readCoverage.body.data.targetCoverageRate, 0.9);
    assert.equal(readCoverage.body.data.daily.length, 7);

    const rollbackDrillCreated = await fetchJson<{
      success: boolean;
      data: {
        drillId: string;
        dataset: string;
        status: string;
        workflowVersionId?: string;
        scenario: string;
        storage: string;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/drills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        dataset: 'SPOT_PRICE',
        scenario: 'standard_to_legacy_weekly_report',
        status: 'PASSED',
        rollbackPath: 'STANDARD_READ->LEGACY_READ',
        notes: 'm1 rehearsal',
      }),
    });
    assert.equal(rollbackDrillCreated.status, 201);
    assert.equal(rollbackDrillCreated.body.success, true);
    assert.equal(rollbackDrillCreated.body.data.dataset, 'SPOT_PRICE');
    assert.equal(rollbackDrillCreated.body.data.status, 'PASSED');

    const rollbackDrills = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          drillId: string;
          dataset: string;
          status: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/drills?page=1&pageSize=20&dataset=SPOT_PRICE&status=PASSED`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(rollbackDrills.status, 200);
    assert.equal(rollbackDrills.body.success, true);
    assert.ok(rollbackDrills.body.data.total >= 1);
    assert.ok(
      rollbackDrills.body.data.items.some(
        (item) => item.drillId === rollbackDrillCreated.body.data.drillId,
      ),
    );

    const m1Readiness = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        windowDays: number;
        datasets: string[];
        summary: {
          meetsReconciliationTarget: boolean;
          meetsCoverageTarget: boolean;
          hasRecentRollbackDrillEvidence: boolean;
          ready: boolean;
        };
        coverage: {
          windowDays: number;
          targetCoverageRate: number;
          coverageRate: number;
        };
        reconciliation: Array<{
          dataset: string;
          meetsWindowTarget: boolean;
          consecutivePassedDays: number;
        }>;
        rollbackDrills: Array<{
          dataset: string;
          exists: boolean;
          recent: boolean;
          passed: boolean;
          drillId?: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(m1Readiness.status, 200);
    assert.equal(m1Readiness.body.success, true);
    assert.equal(m1Readiness.body.data.windowDays, 7);
    assert.ok(m1Readiness.body.data.datasets.includes('SPOT_PRICE'));
    assert.equal(m1Readiness.body.data.coverage.windowDays, 7);
    assert.ok(m1Readiness.body.data.reconciliation.length >= 1);
    assert.ok(m1Readiness.body.data.rollbackDrills.length >= 1);

    const m1ReadinessReportMarkdown = await fetchJson<{
      success: boolean;
      data: {
        format: string;
        generatedAt: string;
        fileName: string;
        readiness: { windowDays: number; datasets: string[] };
        report: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE&format=markdown`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(m1ReadinessReportMarkdown.status, 200);
    assert.equal(m1ReadinessReportMarkdown.body.success, true);
    assert.equal(m1ReadinessReportMarkdown.body.data.format, 'markdown');
    assert.equal(m1ReadinessReportMarkdown.body.data.readiness.windowDays, 7);
    assert.ok(m1ReadinessReportMarkdown.body.data.fileName.endsWith('.md'));
    assert.ok(
      m1ReadinessReportMarkdown.body.data.report.includes('Reconciliation M1 Readiness Report'),
    );

    const m1ReadinessReportJson = await fetchJson<{
      success: boolean;
      data: {
        format: string;
        generatedAt: string;
        fileName: string;
        readiness: { windowDays: number; datasets: string[] };
        report: { windowDays: number; datasets: string[] };
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE&format=json`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(m1ReadinessReportJson.status, 200);
    assert.equal(m1ReadinessReportJson.body.success, true);
    assert.equal(m1ReadinessReportJson.body.data.format, 'json');
    assert.equal(m1ReadinessReportJson.body.data.readiness.windowDays, 7);
    assert.equal(m1ReadinessReportJson.body.data.report.windowDays, 7);
    assert.ok(m1ReadinessReportJson.body.data.fileName.endsWith('.json'));

    const reportSnapshotCreated = await fetchJson<{
      success: boolean;
      data: {
        snapshotId: string;
        format: string;
        fileName: string;
        windowDays: number;
        targetCoverageRate: number;
        datasets: string[];
        readiness: {
          summary: {
            ready: boolean;
          };
        };
        storage: string;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        format: 'markdown',
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
      }),
    });
    assert.equal(reportSnapshotCreated.status, 201);
    assert.equal(reportSnapshotCreated.body.success, true);
    assert.equal(reportSnapshotCreated.body.data.format, 'markdown');
    assert.equal(reportSnapshotCreated.body.data.windowDays, 7);
    assert.ok(reportSnapshotCreated.body.data.snapshotId.length > 0);

    const reportSnapshotList = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          snapshotId: string;
          format: string;
          fileName: string;
          windowDays: number;
          summary: {
            ready: boolean;
          };
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report/snapshots?page=1&pageSize=20&format=markdown`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(reportSnapshotList.status, 200);
    assert.equal(reportSnapshotList.body.success, true);
    assert.ok(reportSnapshotList.body.data.total >= 1);
    assert.ok(
      reportSnapshotList.body.data.items.some(
        (item) => item.snapshotId === reportSnapshotCreated.body.data.snapshotId,
      ),
    );

    const reportSnapshotDetail = await fetchJson<{
      success: boolean;
      data: {
        snapshotId: string;
        format: string;
        report: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/metrics/m1-readiness/report/snapshots/${reportSnapshotCreated.body.data.snapshotId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(reportSnapshotDetail.status, 200);
    assert.equal(reportSnapshotDetail.body.success, true);
    assert.equal(
      reportSnapshotDetail.body.data.snapshotId,
      reportSnapshotCreated.body.data.snapshotId,
    );
    assert.ok(reportSnapshotDetail.body.data.report.includes('Reconciliation M1 Readiness Report'));

    const cutoverDecisionCreated = await fetchJson<{
      success: boolean;
      data: {
        decisionId: string;
        status: string;
        reasonCodes: string[];
        reportSnapshotId: string;
        readinessSummary: {
          ready: boolean;
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        note: 'm1 cutover gate decision',
      }),
    });
    assert.equal(cutoverDecisionCreated.status, 201);
    assert.equal(cutoverDecisionCreated.body.success, true);
    assert.ok(cutoverDecisionCreated.body.data.decisionId.length > 0);
    assert.ok(cutoverDecisionCreated.body.data.reportSnapshotId.length > 0);
    assert.ok(
      cutoverDecisionCreated.body.data.status === 'APPROVED' ||
        cutoverDecisionCreated.body.data.status === 'REJECTED',
    );

    const cutoverExecute = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        executedAt: string;
        decision: {
          decisionId: string;
          status: string;
        };
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
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        note: 'execute cutover gate',
      }),
    });
    assert.equal(cutoverExecute.status, 201);
    assert.equal(cutoverExecute.body.success, true);
    assert.ok(cutoverExecute.body.data.executionId.length > 0);
    assert.ok(cutoverExecute.body.data.executedAt.length > 0);
    assert.ok(cutoverExecute.body.data.decision.decisionId.length > 0);
    assert.ok(
      cutoverExecute.body.data.decision.status === 'APPROVED' ||
        cutoverExecute.body.data.decision.status === 'REJECTED',
    );
    if (cutoverExecute.body.data.decision.status === 'APPROVED') {
      assert.equal(cutoverExecute.body.data.applied, true);
      assert.equal(cutoverExecute.body.data.config.standardizedRead.after, true);
      assert.equal(cutoverExecute.body.data.config.reconciliationGate.after, true);
    }

    const cutoverRuntimeStatusBeforeRollback = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        datasets: string[];
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
          status: string;
          reportSnapshotId: string;
        } | null;
        rollbackDrillEvidence: Array<{
          dataset: string;
          exists: boolean;
          recent: boolean;
          passed: boolean;
        }>;
        executionHealth: {
          windowDays: number;
          compensationPendingExecutions: number;
          hasCompensationBacklog: boolean;
          latestCompensationPendingExecution: {
            executionId: string;
            action: string;
            status: string;
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
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/runtime-status?datasets=SPOT_PRICE`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverRuntimeStatusBeforeRollback.status, 200);
    assert.equal(cutoverRuntimeStatusBeforeRollback.body.success, true);
    assert.equal(cutoverRuntimeStatusBeforeRollback.body.data.datasets.length, 1);
    assert.equal(cutoverRuntimeStatusBeforeRollback.body.data.datasets[0], 'SPOT_PRICE');
    assert.equal(
      typeof cutoverRuntimeStatusBeforeRollback.body.data.summary.hasUncompensatedExecutionFailure,
      'boolean',
    );
    assert.equal(
      typeof cutoverRuntimeStatusBeforeRollback.body.data.executionHealth.hasCompensationBacklog,
      'boolean',
    );

    const rollbackExecute = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        executedAt: string;
        applied: boolean;
        datasets: string[];
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
          dataset: string;
          status: string;
          storage: string;
          createdAt: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        datasets: ['SPOT_PRICE'],
        disableReconciliationGate: true,
        note: 'execute rollback gate',
        reason: 'stability drill',
      }),
    });
    assert.equal(rollbackExecute.status, 201);
    assert.equal(rollbackExecute.body.success, true);
    assert.ok(rollbackExecute.body.data.executionId.length > 0);
    assert.ok(rollbackExecute.body.data.executedAt.length > 0);
    assert.equal(rollbackExecute.body.data.datasets.length, 1);
    assert.equal(rollbackExecute.body.data.datasets[0], 'SPOT_PRICE');
    assert.equal(rollbackExecute.body.data.config.standardizedRead.after, false);
    assert.equal(rollbackExecute.body.data.config.reconciliationGate.after, false);
    assert.equal(rollbackExecute.body.data.rollbackDrills.length, 1);
    assert.equal(rollbackExecute.body.data.rollbackDrills[0].dataset, 'SPOT_PRICE');
    assert.equal(rollbackExecute.body.data.rollbackDrills[0].status, 'PASSED');

    const cutoverRuntimeStatusAfterRollback = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        datasets: string[];
        config: {
          standardizedRead: {
            enabled: boolean;
          };
          reconciliationGate: {
            enabled: boolean;
          };
        };
        rollbackDrillEvidence: Array<{
          dataset: string;
          exists: boolean;
          recent: boolean;
          passed: boolean;
          drillId?: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/runtime-status?datasets=SPOT_PRICE`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverRuntimeStatusAfterRollback.status, 200);
    assert.equal(cutoverRuntimeStatusAfterRollback.body.success, true);
    assert.equal(
      cutoverRuntimeStatusAfterRollback.body.data.config.standardizedRead.enabled,
      false,
    );
    assert.equal(
      cutoverRuntimeStatusAfterRollback.body.data.config.reconciliationGate.enabled,
      false,
    );
    assert.ok(cutoverRuntimeStatusAfterRollback.body.data.rollbackDrillEvidence.length >= 1);
    const latestSpotRollbackEvidence =
      cutoverRuntimeStatusAfterRollback.body.data.rollbackDrillEvidence.find(
        (item) => item.dataset === 'SPOT_PRICE',
      );
    assert.ok(latestSpotRollbackEvidence);
    if (latestSpotRollbackEvidence) {
      assert.equal(latestSpotRollbackEvidence.exists, true);
      assert.equal(latestSpotRollbackEvidence.passed, true);
    }

    const cutoverAutopilot = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        executedAt: string;
        action: string;
        dryRun: boolean;
        decision: {
          decisionId: string;
          status: string;
          reasonCodes: string[];
          reportSnapshotId: string;
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
          datasets: string[];
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
            dataset: string;
            status: string;
          }>;
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/autopilot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        onRejectedAction: 'ROLLBACK',
        disableReconciliationGate: true,
        rollbackReason: 'autopilot_rejected',
        note: 'autopilot gate execution',
      }),
    });
    assert.equal(cutoverAutopilot.status, 201);
    assert.equal(cutoverAutopilot.body.success, true);
    assert.ok(cutoverAutopilot.body.data.executionId.length > 0);
    assert.ok(cutoverAutopilot.body.data.executedAt.length > 0);
    assert.equal(cutoverAutopilot.body.data.dryRun, false);
    assert.ok(cutoverAutopilot.body.data.decision.decisionId.length > 0);
    assert.ok(
      cutoverAutopilot.body.data.decision.status === 'APPROVED' ||
        cutoverAutopilot.body.data.decision.status === 'REJECTED',
    );
    assert.ok(
      cutoverAutopilot.body.data.action === 'CUTOVER' ||
        cutoverAutopilot.body.data.action === 'ROLLBACK' ||
        cutoverAutopilot.body.data.action === 'NONE',
    );
    if (cutoverAutopilot.body.data.action === 'CUTOVER') {
      assert.ok(cutoverAutopilot.body.data.cutover);
      if (cutoverAutopilot.body.data.cutover) {
        assert.equal(cutoverAutopilot.body.data.cutover.config.standardizedRead.after, true);
      }
    }
    if (cutoverAutopilot.body.data.action === 'ROLLBACK') {
      assert.ok(cutoverAutopilot.body.data.rollback);
      if (cutoverAutopilot.body.data.rollback) {
        assert.equal(cutoverAutopilot.body.data.rollback.config.standardizedRead.after, false);
        assert.ok(cutoverAutopilot.body.data.rollback.rollbackDrills.length >= 1);
      }
    }

    const cutoverAutopilotDryRun = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        action: string;
        dryRun: boolean;
        decision: {
          decisionId: string;
          status: string;
        };
        cutover?: unknown;
        rollback?: unknown;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/autopilot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        targetCoverageRate: 0.9,
        datasets: ['SPOT_PRICE'],
        reportFormat: 'markdown',
        onRejectedAction: 'ROLLBACK',
        dryRun: true,
        note: 'autopilot dry run',
      }),
    });
    assert.equal(cutoverAutopilotDryRun.status, 201);
    assert.equal(cutoverAutopilotDryRun.body.success, true);
    assert.ok(cutoverAutopilotDryRun.body.data.executionId.length > 0);
    assert.equal(cutoverAutopilotDryRun.body.data.action, 'NONE');
    assert.equal(cutoverAutopilotDryRun.body.data.dryRun, true);
    assert.ok(cutoverAutopilotDryRun.body.data.decision.decisionId.length > 0);
    assert.equal(cutoverAutopilotDryRun.body.data.cutover, undefined);
    assert.equal(cutoverAutopilotDryRun.body.data.rollback, undefined);

    const cutoverExecutionList = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          executionId: string;
          action: string;
          status: string;
          requestedByUserId: string;
          datasets: string[];
          applied: boolean;
          createdAt: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/executions?page=1&pageSize=50`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverExecutionList.status, 200);
    assert.equal(cutoverExecutionList.body.success, true);
    assert.ok(cutoverExecutionList.body.data.total >= 3);
    assert.ok(
      cutoverExecutionList.body.data.items.some(
        (item) => item.executionId === cutoverExecute.body.data.executionId,
      ),
    );
    assert.ok(
      cutoverExecutionList.body.data.items.some(
        (item) => item.executionId === rollbackExecute.body.data.executionId,
      ),
    );

    const cutoverExecutionOverview = await fetchJson<{
      success: boolean;
      data: {
        generatedAt: string;
        windowDays: number;
        datasets: string[];
        storage: string;
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
          action: string;
          total: number;
          success: number;
          failed: number;
          partial: number;
          compensated: number;
          compensationPending: number;
        }>;
        latestCompensationPending: Array<{
          executionId: string;
          action: string;
          status: string;
          createdAt: string;
          datasets: string[];
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/overview?windowDays=7&datasets=SPOT_PRICE&pendingLimit=10`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(cutoverExecutionOverview.status, 200);
    assert.equal(cutoverExecutionOverview.body.success, true);
    assert.equal(cutoverExecutionOverview.body.data.windowDays, 7);
    assert.equal(cutoverExecutionOverview.body.data.datasets[0], 'SPOT_PRICE');
    assert.ok(cutoverExecutionOverview.body.data.summary.totalExecutions >= 3);
    assert.equal(cutoverExecutionOverview.body.data.byAction.length, 3);
    assert.ok(
      cutoverExecutionOverview.body.data.byAction.some((item) => item.action === 'AUTOPILOT'),
    );

    const cutoverExecutionDetail = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        action: string;
        status: string;
        datasets: string[];
        applied: boolean;
        configBefore?: {
          standardizedRead: boolean;
          reconciliationGate: boolean;
        };
        configAfter?: {
          standardizedRead: boolean;
          reconciliationGate: boolean;
        };
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/${rollbackExecute.body.data.executionId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(cutoverExecutionDetail.status, 200);
    assert.equal(cutoverExecutionDetail.body.success, true);
    assert.equal(
      cutoverExecutionDetail.body.data.executionId,
      rollbackExecute.body.data.executionId,
    );
    assert.equal(cutoverExecutionDetail.body.data.action, 'ROLLBACK');

    const cutoverCompensateNoop = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        compensated: boolean;
        reason?: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/${rollbackExecute.body.data.executionId}/compensate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': 'admin-user',
        },
        body: JSON.stringify({
          disableReconciliationGate: true,
          reason: 'manual_compensation_noop',
        }),
      },
    );
    assert.equal(cutoverCompensateNoop.status, 201);
    assert.equal(cutoverCompensateNoop.body.success, true);
    assert.equal(
      cutoverCompensateNoop.body.data.executionId,
      rollbackExecute.body.data.executionId,
    );
    assert.equal(cutoverCompensateNoop.body.data.compensated, false);

    const failedAutopilotExecutionsBefore = await fetchJson<{
      success: boolean;
      data: {
        total: number;
        items: Array<{
          executionId: string;
          action: string;
          status: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions?page=1&pageSize=100&action=AUTOPILOT&status=FAILED`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(failedAutopilotExecutionsBefore.status, 200);
    assert.equal(failedAutopilotExecutionsBefore.body.success, true);
    const failedAutopilotExecutionIdsBefore = new Set(
      failedAutopilotExecutionsBefore.body.data.items.map((item) => item.executionId),
    );

    const originalCreateReconciliationCutoverDecision =
      marketDataService.createReconciliationCutoverDecision.bind(marketDataService);

    (
      marketDataService as {
        createReconciliationCutoverDecision: typeof originalCreateReconciliationCutoverDecision;
      }
    ).createReconciliationCutoverDecision = (async () => {
      throw new Error('forced_autopilot_failure_for_compensation');
    }) as typeof originalCreateReconciliationCutoverDecision;

    try {
      await assert.rejects(
        marketDataService.executeReconciliationCutoverAutopilot('admin-user', {
          windowDays: 7,
          targetCoverageRate: 0.9,
          datasets: ['SPOT_PRICE'] as Array<'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT'>,
          reportFormat: 'markdown',
          onRejectedAction: 'ROLLBACK',
          disableReconciliationGate: true,
          dryRun: false,
          note: 'forced autopilot failure for compensation',
        }),
        /forced_autopilot_failure_for_compensation/,
      );
    } finally {
      (
        marketDataService as {
          createReconciliationCutoverDecision: typeof originalCreateReconciliationCutoverDecision;
        }
      ).createReconciliationCutoverDecision = originalCreateReconciliationCutoverDecision;
    }

    const failedAutopilotExecutionsAfter = await fetchJson<{
      success: boolean;
      data: {
        total: number;
        items: Array<{
          executionId: string;
          action: string;
          status: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions?page=1&pageSize=100&action=AUTOPILOT&status=FAILED`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(failedAutopilotExecutionsAfter.status, 200);
    assert.equal(failedAutopilotExecutionsAfter.body.success, true);
    const forcedFailedAutopilotExecution = failedAutopilotExecutionsAfter.body.data.items.find(
      (item) => !failedAutopilotExecutionIdsBefore.has(item.executionId),
    );
    assert.ok(forcedFailedAutopilotExecution);
    if (!forcedFailedAutopilotExecution) {
      throw new Error('forced failed autopilot execution not found');
    }

    const cutoverCompensateSuccess = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        compensated: boolean;
        compensationExecutionId?: string;
        execution: {
          executionId: string;
          status: string;
          compensationApplied: boolean;
        };
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/${forcedFailedAutopilotExecution.executionId}/compensate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': 'admin-user',
        },
        body: JSON.stringify({
          disableReconciliationGate: true,
          reason: 'manual_compensation_retry',
        }),
      },
    );
    assert.equal(cutoverCompensateSuccess.status, 201);
    assert.equal(cutoverCompensateSuccess.body.success, true);
    assert.equal(cutoverCompensateSuccess.body.data.compensated, true);
    assert.ok((cutoverCompensateSuccess.body.data.compensationExecutionId ?? '').length > 0);
    assert.equal(
      cutoverCompensateSuccess.body.data.executionId,
      forcedFailedAutopilotExecution.executionId,
    );
    assert.equal(cutoverCompensateSuccess.body.data.execution.status, 'COMPENSATED');
    assert.equal(cutoverCompensateSuccess.body.data.execution.compensationApplied, true);

    const failedAutopilotExecutionsBeforeCompensationFailure = await fetchJson<{
      success: boolean;
      data: {
        total: number;
        items: Array<{
          executionId: string;
          action: string;
          status: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions?page=1&pageSize=100&action=AUTOPILOT&status=FAILED`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(failedAutopilotExecutionsBeforeCompensationFailure.status, 200);
    assert.equal(failedAutopilotExecutionsBeforeCompensationFailure.body.success, true);
    const failedAutopilotExecutionIdsBeforeCompensationFailure = new Set(
      failedAutopilotExecutionsBeforeCompensationFailure.body.data.items.map(
        (item) => item.executionId,
      ),
    );

    const originalCreateReconciliationCutoverDecisionForCompensationFailure =
      marketDataService.createReconciliationCutoverDecision.bind(marketDataService);
    (
      marketDataService as {
        createReconciliationCutoverDecision: typeof originalCreateReconciliationCutoverDecisionForCompensationFailure;
      }
    ).createReconciliationCutoverDecision = (async () => {
      throw new Error('forced_autopilot_failure_for_compensation_error_path');
    }) as typeof originalCreateReconciliationCutoverDecisionForCompensationFailure;

    try {
      await assert.rejects(
        marketDataService.executeReconciliationCutoverAutopilot('admin-user', {
          windowDays: 7,
          targetCoverageRate: 0.9,
          datasets: ['SPOT_PRICE'] as Array<'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT'>,
          reportFormat: 'markdown',
          onRejectedAction: 'ROLLBACK',
          disableReconciliationGate: true,
          dryRun: false,
          note: 'forced autopilot failure for compensation failure path',
        }),
        /forced_autopilot_failure_for_compensation_error_path/,
      );
    } finally {
      (
        marketDataService as {
          createReconciliationCutoverDecision: typeof originalCreateReconciliationCutoverDecisionForCompensationFailure;
        }
      ).createReconciliationCutoverDecision =
        originalCreateReconciliationCutoverDecisionForCompensationFailure;
    }

    const failedAutopilotExecutionsForCompensationFailure = await fetchJson<{
      success: boolean;
      data: {
        total: number;
        items: Array<{
          executionId: string;
          action: string;
          status: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions?page=1&pageSize=100&action=AUTOPILOT&status=FAILED`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(failedAutopilotExecutionsForCompensationFailure.status, 200);
    assert.equal(failedAutopilotExecutionsForCompensationFailure.body.success, true);
    const failedExecutionForCompensationFailure =
      failedAutopilotExecutionsForCompensationFailure.body.data.items.find(
        (item) => !failedAutopilotExecutionIdsBeforeCompensationFailure.has(item.executionId),
      );
    assert.ok(failedExecutionForCompensationFailure);
    if (!failedExecutionForCompensationFailure) {
      throw new Error('failed execution for compensation failure test not found');
    }

    const originalExecuteReconciliationRollback =
      marketDataService.executeReconciliationRollback.bind(marketDataService);
    (
      marketDataService as {
        executeReconciliationRollback: typeof originalExecuteReconciliationRollback;
      }
    ).executeReconciliationRollback = (async () => {
      throw new Error('forced_compensation_rollback_failure');
    }) as typeof originalExecuteReconciliationRollback;

    try {
      await assert.rejects(
        marketDataService.retryReconciliationCutoverExecutionCompensation(
          'admin-user',
          failedExecutionForCompensationFailure.executionId,
          {
            disableReconciliationGate: true,
            reason: 'manual_compensation_forced_failure',
          },
        ),
        /forced_compensation_rollback_failure/,
      );
    } finally {
      (
        marketDataService as {
          executeReconciliationRollback: typeof originalExecuteReconciliationRollback;
        }
      ).executeReconciliationRollback = originalExecuteReconciliationRollback;
    }

    const failedCompensationExecutionDetail = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        status: string;
        compensationApplied: boolean;
        compensationError?: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/${failedExecutionForCompensationFailure.executionId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(failedCompensationExecutionDetail.status, 200);
    assert.equal(failedCompensationExecutionDetail.body.success, true);
    assert.equal(
      failedCompensationExecutionDetail.body.data.executionId,
      failedExecutionForCompensationFailure.executionId,
    );
    assert.ok(
      failedCompensationExecutionDetail.body.data.status === 'FAILED' ||
        failedCompensationExecutionDetail.body.data.status === 'PARTIAL',
    );
    assert.equal(failedCompensationExecutionDetail.body.data.compensationApplied, false);
    assert.ok(
      (failedCompensationExecutionDetail.body.data.compensationError ?? '').includes(
        'forced_compensation_rollback_failure',
      ),
    );

    const compensationBatchIdempotencySuffix = Date.now().toString(36);
    const cutoverCompensateBatchDryRunKey = `market-data-batch-dry-run-${compensationBatchIdempotencySuffix}`;
    const cutoverCompensateBatchExecuteKey = `market-data-batch-execute-${compensationBatchIdempotencySuffix}`;

    const cutoverCompensateBatchDryRun = await fetchJson<{
      success: boolean;
      data: {
        batchId: string;
        status: string;
        replayed: boolean;
        dryRun: boolean;
        idempotencyKey?: string;
        requestedLimit: number;
        control: {
          maxConcurrency: number;
          perExecutionTimeoutMs: number;
          stopOnFailureCount?: number;
          stopOnFailureRate?: number;
          minProcessedForFailureRate: number;
        };
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
        results: Array<{
          executionId: string;
          statusBefore: string;
          compensated: boolean;
          reason?: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/executions/compensate-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        datasets: ['SPOT_PRICE'],
        limit: 10,
        dryRun: true,
        idempotencyKey: cutoverCompensateBatchDryRunKey,
        maxConcurrency: 2,
        perExecutionTimeoutMs: 10000,
        disableReconciliationGate: true,
      }),
    });
    assert.equal(cutoverCompensateBatchDryRun.status, 201);
    assert.equal(cutoverCompensateBatchDryRun.body.success, true);
    assert.ok(cutoverCompensateBatchDryRun.body.data.batchId.length > 0);
    assert.equal(cutoverCompensateBatchDryRun.body.data.status, 'DRY_RUN');
    assert.equal(cutoverCompensateBatchDryRun.body.data.replayed, false);
    assert.equal(cutoverCompensateBatchDryRun.body.data.dryRun, true);
    assert.equal(
      cutoverCompensateBatchDryRun.body.data.idempotencyKey,
      cutoverCompensateBatchDryRunKey,
    );
    assert.equal(cutoverCompensateBatchDryRun.body.data.attempted, 0);
    assert.equal(cutoverCompensateBatchDryRun.body.data.control.maxConcurrency, 2);
    assert.equal(cutoverCompensateBatchDryRun.body.data.control.perExecutionTimeoutMs, 10000);
    assert.equal(cutoverCompensateBatchDryRun.body.data.summary.processed, 0);
    assert.equal(cutoverCompensateBatchDryRun.body.data.summary.breakerTriggered, false);
    assert.ok(cutoverCompensateBatchDryRun.body.data.matched >= 1);

    const cutoverCompensateBatchExecuteBody = {
      windowDays: 7,
      datasets: ['SPOT_PRICE'],
      limit: 10,
      dryRun: false,
      idempotencyKey: cutoverCompensateBatchExecuteKey,
      maxConcurrency: 3,
      perExecutionTimeoutMs: 15000,
      stopOnFailureCount: 5,
      stopOnFailureRate: 0.8,
      minProcessedForFailureRate: 1,
      disableReconciliationGate: true,
      reason: 'batch_compensation_retry',
    };

    const [cutoverCompensateBatchExecuteA, cutoverCompensateBatchExecuteB] = await Promise.all([
      fetchJson<{
        success: boolean;
        data: {
          batchId: string;
          status: string;
          replayed: boolean;
          dryRun: boolean;
          idempotencyKey?: string;
          requestedLimit: number;
          control: {
            maxConcurrency: number;
            perExecutionTimeoutMs: number;
            stopOnFailureCount?: number;
            stopOnFailureRate?: number;
            minProcessedForFailureRate: number;
          };
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
          results: Array<{
            executionId: string;
            compensated: boolean;
            compensationExecutionId?: string;
            error?: string;
            reason?: string;
          }>;
        };
        traceId: string;
        ts: string;
      }>(`${baseUrl}/market-data/reconciliation/cutover/executions/compensate-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': 'admin-user',
        },
        body: JSON.stringify(cutoverCompensateBatchExecuteBody),
      }),
      fetchJson<{
        success: boolean;
        data: {
          batchId: string;
          status: string;
          replayed: boolean;
          dryRun: boolean;
          idempotencyKey?: string;
          requestedLimit: number;
          control: {
            maxConcurrency: number;
            perExecutionTimeoutMs: number;
            stopOnFailureCount?: number;
            stopOnFailureRate?: number;
            minProcessedForFailureRate: number;
          };
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
          results: Array<{
            executionId: string;
            compensated: boolean;
            compensationExecutionId?: string;
            error?: string;
            reason?: string;
          }>;
        };
        traceId: string;
        ts: string;
      }>(`${baseUrl}/market-data/reconciliation/cutover/executions/compensate-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-virtual-user-id': 'admin-user',
        },
        body: JSON.stringify(cutoverCompensateBatchExecuteBody),
      }),
    ]);

    assert.equal(cutoverCompensateBatchExecuteA.status, 201);
    assert.equal(cutoverCompensateBatchExecuteB.status, 201);
    assert.equal(cutoverCompensateBatchExecuteA.body.success, true);
    assert.equal(cutoverCompensateBatchExecuteB.body.success, true);
    assert.equal(
      cutoverCompensateBatchExecuteA.body.data.batchId,
      cutoverCompensateBatchExecuteB.body.data.batchId,
    );

    const cutoverCompensateBatchExecute = cutoverCompensateBatchExecuteA.body.data.replayed
      ? cutoverCompensateBatchExecuteB
      : cutoverCompensateBatchExecuteA;
    const cutoverCompensateBatchExecuteReplayInFlight = cutoverCompensateBatchExecuteA.body.data
      .replayed
      ? cutoverCompensateBatchExecuteA
      : cutoverCompensateBatchExecuteB;

    assert.equal(cutoverCompensateBatchExecuteReplayInFlight.body.data.replayed, true);
    assert.ok(cutoverCompensateBatchExecute.body.data.batchId.length > 0);
    assert.equal(cutoverCompensateBatchExecute.body.data.replayed, false);
    assert.equal(cutoverCompensateBatchExecute.body.data.dryRun, false);
    assert.equal(
      cutoverCompensateBatchExecute.body.data.idempotencyKey,
      cutoverCompensateBatchExecuteKey,
    );
    assert.ok(cutoverCompensateBatchExecute.body.data.attempted >= 1);
    assert.equal(cutoverCompensateBatchExecute.body.data.control.maxConcurrency, 3);
    assert.equal(cutoverCompensateBatchExecute.body.data.control.perExecutionTimeoutMs, 15000);
    assert.ok(cutoverCompensateBatchExecute.body.data.summary.compensated >= 1);
    assert.ok(cutoverCompensateBatchExecute.body.data.summary.processed >= 1);
    assert.ok(
      cutoverCompensateBatchExecute.body.data.results.some((item) => item.compensated === true),
    );

    const cutoverCompensateBatchReplay = await fetchJson<{
      success: boolean;
      data: {
        batchId: string;
        status: string;
        replayed: boolean;
        dryRun: boolean;
        attempted: number;
        summary: {
          compensated: number;
          failed: number;
          skipped: number;
          processed: number;
          breakerTriggered: boolean;
          breakerReason?: string;
        };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/executions/compensate-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        windowDays: 7,
        datasets: ['SPOT_PRICE'],
        limit: 10,
        dryRun: false,
        idempotencyKey: cutoverCompensateBatchExecuteKey,
        disableReconciliationGate: true,
        reason: 'batch_compensation_retry',
      }),
    });
    assert.equal(cutoverCompensateBatchReplay.status, 201);
    assert.equal(cutoverCompensateBatchReplay.body.success, true);
    assert.equal(cutoverCompensateBatchReplay.body.data.replayed, true);
    assert.equal(
      cutoverCompensateBatchReplay.body.data.batchId,
      cutoverCompensateBatchExecute.body.data.batchId,
    );

    const compensationBatchListReplayedOnly = await fetchJson<{
      success: boolean;
      data: {
        total: number;
        items: Array<{
          batchId: string;
          replayed: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/compensation-batches?page=1&pageSize=20&replayed=true`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(compensationBatchListReplayedOnly.status, 200);
    assert.equal(compensationBatchListReplayedOnly.body.success, true);
    assert.ok(
      compensationBatchListReplayedOnly.body.data.items.every((item) => item.replayed === true),
    );

    const compensationBatchList = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          batchId: string;
          status: string;
          dryRun: boolean;
          replayed: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/compensation-batches?page=1&pageSize=20`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(compensationBatchList.status, 200);
    assert.equal(compensationBatchList.body.success, true);
    assert.ok(compensationBatchList.body.data.total >= 1);
    assert.ok(
      compensationBatchList.body.data.items.some(
        (item) => item.batchId === cutoverCompensateBatchExecute.body.data.batchId,
      ),
    );

    const compensationBatchDetail = await fetchJson<{
      success: boolean;
      data: {
        batchId: string;
        status: string;
        dryRun: boolean;
        replayed: boolean;
        idempotencyKey?: string;
        attempted: number;
        summary: {
          compensated: number;
          failed: number;
          skipped: number;
          processed: number;
          breakerTriggered: boolean;
          breakerReason?: string;
        };
        results: Array<{
          executionId: string;
          compensated: boolean;
        }>;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/compensation-batches/${cutoverCompensateBatchExecute.body.data.batchId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(compensationBatchDetail.status, 200);
    assert.equal(compensationBatchDetail.body.success, true);
    assert.equal(
      compensationBatchDetail.body.data.batchId,
      cutoverCompensateBatchExecute.body.data.batchId,
    );
    assert.equal(
      compensationBatchDetail.body.data.idempotencyKey,
      cutoverCompensateBatchExecuteKey,
    );
    assert.ok(compensationBatchDetail.body.data.results.length >= 1);

    const compensationBatchReportJson = await fetchJson<{
      success: boolean;
      data: {
        batchId: string;
        format: string;
        fileName: string;
        generatedAt: string;
        storage: string;
        payload: {
          batchId: string;
          summary: {
            compensated: number;
          };
        };
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/compensation-batches/${cutoverCompensateBatchExecute.body.data.batchId}/report?format=json`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(compensationBatchReportJson.status, 200);
    assert.equal(compensationBatchReportJson.body.success, true);
    assert.equal(compensationBatchReportJson.body.data.format, 'json');
    assert.ok(compensationBatchReportJson.body.data.fileName.endsWith('.json'));
    assert.equal(
      compensationBatchReportJson.body.data.payload.batchId,
      cutoverCompensateBatchExecute.body.data.batchId,
    );

    const compensationBatchReportMarkdown = await fetchJson<{
      success: boolean;
      data: {
        batchId: string;
        format: string;
        fileName: string;
        generatedAt: string;
        storage: string;
        payload: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/compensation-batches/${cutoverCompensateBatchExecute.body.data.batchId}/report?format=markdown`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(compensationBatchReportMarkdown.status, 200);
    assert.equal(compensationBatchReportMarkdown.body.success, true);
    assert.equal(compensationBatchReportMarkdown.body.data.format, 'markdown');
    assert.ok(compensationBatchReportMarkdown.body.data.fileName.endsWith('.md'));
    assert.ok(
      compensationBatchReportMarkdown.body.data.payload.includes(
        'Reconciliation Cutover Compensation Batch Report',
      ),
    );
    assert.ok(
      compensationBatchReportMarkdown.body.data.payload.includes(
        cutoverCompensateBatchExecute.body.data.batchId,
      ),
    );

    const envBackup = {
      enabled: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED,
      scope: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE,
      userId: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID,
      windowDays: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS,
      limit: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT,
      datasets: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS,
      maxConcurrency: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY,
      timeoutMs: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS,
      slot: process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES,
    };

    try {
      const originalCreateReconciliationCutoverDecisionForAutoSweep =
        marketDataService.createReconciliationCutoverDecision.bind(marketDataService);
      (
        marketDataService as {
          createReconciliationCutoverDecision: typeof originalCreateReconciliationCutoverDecisionForAutoSweep;
        }
      ).createReconciliationCutoverDecision = (async () => {
        throw new Error('forced_autosweep_scope_pending');
      }) as typeof originalCreateReconciliationCutoverDecisionForAutoSweep;

      try {
        await assert.rejects(
          marketDataService.executeReconciliationCutoverAutopilot('ops-user', {
            windowDays: 7,
            targetCoverageRate: 0.9,
            datasets: ['SPOT_PRICE'] as Array<'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT'>,
            reportFormat: 'markdown',
            onRejectedAction: 'ROLLBACK',
            disableReconciliationGate: true,
            dryRun: false,
            note: 'forced autosweep scope pending execution',
          }),
          /forced_autosweep_scope_pending/,
        );
      } finally {
        (
          marketDataService as {
            createReconciliationCutoverDecision: typeof originalCreateReconciliationCutoverDecisionForAutoSweep;
          }
        ).createReconciliationCutoverDecision =
          originalCreateReconciliationCutoverDecisionForAutoSweep;
      }

      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED = 'true';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE = 'USER';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID = 'nobody-user';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS = '7';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT = '5';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS = 'SPOT_PRICE';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY = '2';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS = '8000';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES = '60';

      const autoSweepUserScope =
        await marketDataService.runReconciliationCutoverCompensationSweep();
      assert.equal(autoSweepUserScope.enabled, true);
      assert.equal(autoSweepUserScope.scope, 'USER');
      assert.equal(autoSweepUserScope.triggered, false);
      assert.equal(autoSweepUserScope.reason, 'auto_compensation_user_scope_no_pending_execution');

      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE = 'GLOBAL';
      process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID = 'admin-user';

      const autoSweepGlobalFirst =
        await marketDataService.runReconciliationCutoverCompensationSweep();
      assert.equal(autoSweepGlobalFirst.enabled, true);
      assert.equal(autoSweepGlobalFirst.scope, 'GLOBAL');
      assert.equal(autoSweepGlobalFirst.triggered, true);
      assert.ok((autoSweepGlobalFirst.batchId ?? '').length > 0);
      assert.ok((autoSweepGlobalFirst.targetUserCount ?? 0) >= 1);
      assert.equal(autoSweepGlobalFirst.settings?.maxConcurrency, 2);
      assert.equal(autoSweepGlobalFirst.settings?.perExecutionTimeoutMs, 8000);
      assert.ok((autoSweepGlobalFirst.runs ?? []).some((item) => item.userId === 'ops-user'));

      const autoSweepGlobalSecond =
        await marketDataService.runReconciliationCutoverCompensationSweep();
      assert.equal(autoSweepGlobalSecond.enabled, true);
      assert.equal(autoSweepGlobalSecond.scope, 'GLOBAL');
      assert.ok(
        autoSweepGlobalSecond.reason === 'auto_compensation_no_pending_execution' ||
          autoSweepGlobalSecond.reason === 'auto_compensation_executed' ||
          autoSweepGlobalSecond.reason === 'auto_compensation_replayed',
      );
    } finally {
      if (envBackup.enabled === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED = envBackup.enabled;
      }
      if (envBackup.scope === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE = envBackup.scope;
      }
      if (envBackup.userId === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID = envBackup.userId;
      }
      if (envBackup.windowDays === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS = envBackup.windowDays;
      }
      if (envBackup.limit === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT = envBackup.limit;
      }
      if (envBackup.datasets === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS = envBackup.datasets;
      }
      if (envBackup.maxConcurrency === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY =
          envBackup.maxConcurrency;
      }
      if (envBackup.timeoutMs === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS = envBackup.timeoutMs;
      }
      if (envBackup.slot === undefined) {
        delete process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES;
      } else {
        process.env.MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES =
          envBackup.slot;
      }
    }

    const failedExecutionAfterBatchCompensation = await fetchJson<{
      success: boolean;
      data: {
        executionId: string;
        status: string;
        compensationApplied: boolean;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/executions/${failedExecutionForCompensationFailure.executionId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(failedExecutionAfterBatchCompensation.status, 200);
    assert.equal(failedExecutionAfterBatchCompensation.body.success, true);
    assert.equal(
      failedExecutionAfterBatchCompensation.body.data.executionId,
      failedExecutionForCompensationFailure.executionId,
    );
    assert.equal(failedExecutionAfterBatchCompensation.body.data.status, 'COMPENSATED');
    assert.equal(failedExecutionAfterBatchCompensation.body.data.compensationApplied, true);

    const cutoverDecisionList = await fetchJson<{
      success: boolean;
      data: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
        items: Array<{
          decisionId: string;
          status: string;
          reportSnapshotId: string;
        }>;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/cutover/decisions?page=1&pageSize=20`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(cutoverDecisionList.status, 200);
    assert.equal(cutoverDecisionList.body.success, true);
    assert.ok(cutoverDecisionList.body.data.total >= 1);
    assert.ok(
      cutoverDecisionList.body.data.items.some(
        (item) => item.decisionId === cutoverDecisionCreated.body.data.decisionId,
      ),
    );

    const cutoverDecisionDetail = await fetchJson<{
      success: boolean;
      data: {
        decisionId: string;
        status: string;
        reportSnapshotId: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/cutover/decisions/${cutoverDecisionCreated.body.data.decisionId}`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(cutoverDecisionDetail.status, 200);
    assert.equal(cutoverDecisionDetail.body.success, true);
    assert.equal(
      cutoverDecisionDetail.body.data.decisionId,
      cutoverDecisionCreated.body.data.decisionId,
    );

    const createdAtFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const createdAtTo = new Date().toISOString();

    const reconcileList = await fetchJson<{
      success: boolean;
      data: {
        items: Array<{
          jobId: string;
          status: string;
          dataset: string;
          retriedFromJobId: string | null;
          retryCount: number;
          summaryPass?: boolean;
        }>;
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        storage: string;
      };
      traceId: string;
      ts: string;
    }>(
      `${baseUrl}/market-data/reconciliation/jobs?page=1&pageSize=20&dataset=SPOT_PRICE&status=DONE&createdAtFrom=${encodeURIComponent(createdAtFrom)}&createdAtTo=${encodeURIComponent(createdAtTo)}&sortBy=createdAt&sortOrder=desc`,
      {
        method: 'GET',
        headers: {
          'x-virtual-user-id': 'admin-user',
        },
      },
    );
    assert.equal(reconcileList.status, 200);
    assert.equal(reconcileList.body.success, true);
    assert.equal(reconcileList.body.data.page, 1);
    assert.equal(reconcileList.body.data.pageSize, 20);
    assert.ok(reconcileList.body.data.total >= 1);
    const createdListItem = reconcileList.body.data.items.find(
      (item) => item.jobId === reconcileCreated.body.data.jobId,
    );
    assert.ok(createdListItem);
    if (createdListItem) {
      assert.equal(createdListItem.retryCount, 0);
    }

    const reconcileDetail = await fetchJson<{
      success: boolean;
      data: {
        jobId: string;
        status: string;
        retriedFromJobId: string | null;
        retryCount: number;
        summaryPass?: boolean;
        summary?: { pass?: boolean };
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${reconcileCreated.body.data.jobId}`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(reconcileDetail.status, 200);
    assert.equal(reconcileDetail.body.success, true);
    assert.equal(reconcileDetail.body.data.jobId, reconcileCreated.body.data.jobId);
    assert.equal(reconcileDetail.body.data.retriedFromJobId, null);
    assert.equal(reconcileDetail.body.data.retryCount, 0);
    if (
      typeof reconcileDetail.body.data.summaryPass === 'boolean' &&
      typeof reconcileDetail.body.data.summary?.pass === 'boolean'
    ) {
      assert.equal(reconcileDetail.body.data.summaryPass, reconcileDetail.body.data.summary.pass);
    }

    const cancelDone = await fetchJson<{
      statusCode: number;
      message: string | string[];
      error: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${reconcileCreated.body.data.jobId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-virtual-user-id': 'admin-user',
      },
      body: JSON.stringify({
        reason: 'manual-cancel-test',
      }),
    });
    assert.equal(cancelDone.status, 400);

    const retry = await fetchJson<{
      success: boolean;
      data: {
        jobId: string;
        status: string;
        dataset: string;
        retryCount: number;
        createdAt: string;
        retriedFromJobId: string;
      };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${reconcileCreated.body.data.jobId}/retry`, {
      method: 'POST',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });

    assert.equal(retry.status, 201);
    assert.equal(retry.body.success, true);
    assert.equal(retry.body.data.retryCount, 1);
    assert.equal(retry.body.data.retriedFromJobId, reconcileCreated.body.data.jobId);
    assert.notEqual(retry.body.data.jobId, reconcileCreated.body.data.jobId);

    const retryDetail = await fetchJson<{
      success: boolean;
      data: { jobId: string; retriedFromJobId: string | null; retryCount: number };
      traceId: string;
      ts: string;
    }>(`${baseUrl}/market-data/reconciliation/jobs/${retry.body.data.jobId}`, {
      method: 'GET',
      headers: {
        'x-virtual-user-id': 'admin-user',
      },
    });
    assert.equal(retryDetail.status, 200);
    assert.equal(retryDetail.body.success, true);
    assert.equal(retryDetail.body.data.retriedFromJobId, reconcileCreated.body.data.jobId);
    assert.equal(retryDetail.body.data.retryCount, 1);

    const pass = reconcileDetail.body.data.summary?.pass;
    if (typeof pass === 'boolean') {
      const reconcileListWithPass = await fetchJson<{
        success: boolean;
        data: {
          items: Array<{ jobId: string; retryCount: number; summaryPass?: boolean }>;
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
          storage: string;
        };
        traceId: string;
        ts: string;
      }>(
        `${baseUrl}/market-data/reconciliation/jobs?page=1&pageSize=20&pass=${pass ? 'true' : 'false'}`,
        {
          method: 'GET',
          headers: {
            'x-virtual-user-id': 'admin-user',
          },
        },
      );

      assert.equal(reconcileListWithPass.status, 200);
      assert.equal(reconcileListWithPass.body.success, true);
      for (const item of reconcileListWithPass.body.data.items) {
        if (typeof item.summaryPass === 'boolean') {
          assert.equal(item.summaryPass, pass);
        }
      }
      assert.ok(
        reconcileListWithPass.body.data.items.some(
          (item) => item.jobId === reconcileCreated.body.data.jobId,
        ),
      );
    }

    console.log('Market data e2e checks passed.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Market data e2e checks failed:', error);
  process.exitCode = 1;
});
