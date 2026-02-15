import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type BackfillOptions = {
    limit: number;
    batchSize: number;
    dryRun: boolean;
    overwrite: boolean;
    confirmOverwrite: boolean;
    reportFile?: string;
    maxFailureLog: number;
    ownerUserId?: string;
};

type BackfillReport = {
    runId: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    mode: 'overwrite' | 'only-missing';
    options: {
        limit: number;
        batchSize: number;
        dryRun: boolean;
        overwrite: boolean;
        ownerUserId?: string;
        reportFile?: string;
        maxFailureLog: number;
    };
    stats: {
        scanned: number;
        eligible: number;
        updated: number;
        skippedNoNodeOutput: number;
        skippedNoSummary: number;
        failed: number;
        batchCount: number;
    };
    samples: {
        updatedExecutionIds: string[];
        failures: Array<{ executionId: string; reason: string }>;
    };
    failuresTruncated: boolean;
};

const toObjectRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

const readString = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
};

const readBoolean = (value: unknown): boolean | null => {
    if (typeof value === 'boolean') {
        return value;
    }
    return null;
};

const readNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return null;
};

const readStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => readString(item))
        .filter((item): item is string => Boolean(item));
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue => {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

const extractRiskGateSummary = (nodeOutputSnapshot: Record<string, unknown> | null): Record<string, unknown> | null => {
    if (!nodeOutputSnapshot) {
        return null;
    }

    const meta = toObjectRecord(nodeOutputSnapshot._meta);
    const riskGateMeta = toObjectRecord(meta?.riskGate);
    const blockers = readStringArray(nodeOutputSnapshot.blockers);
    const blockerCount = readNumber(nodeOutputSnapshot.blockerCount);

    return {
        summarySchemaVersion: readString(nodeOutputSnapshot.summarySchemaVersion) ?? '1.0',
        riskLevel: readString(nodeOutputSnapshot.riskLevel),
        riskGatePassed: readBoolean(nodeOutputSnapshot.riskGatePassed),
        riskGateBlocked: readBoolean(nodeOutputSnapshot.riskGateBlocked),
        blockReason: readString(nodeOutputSnapshot.blockReason),
        degradeAction: readString(nodeOutputSnapshot.degradeAction),
        blockers,
        blockerCount: blockerCount ?? blockers.length,
        riskProfileCode: readString(nodeOutputSnapshot.riskProfileCode) ?? readString(riskGateMeta?.riskProfileCode),
        threshold: readString(nodeOutputSnapshot.threshold) ?? readString(riskGateMeta?.threshold),
        blockedByRiskLevel:
            readBoolean(nodeOutputSnapshot.blockedByRiskLevel) ?? readBoolean(riskGateMeta?.blockedByRiskLevel),
        hardBlock: readBoolean(nodeOutputSnapshot.hardBlock) ?? readBoolean(riskGateMeta?.hardBlock),
        riskEvaluatedAt: readString(nodeOutputSnapshot.riskEvaluatedAt),
    };
};

const parseOptions = (): BackfillOptions => {
    const args = process.argv.slice(2);
    const readArgValue = (name: string): string | null => {
        const matchedWithEqual = args.find((arg) => arg.startsWith(`${name}=`));
        if (matchedWithEqual) {
            return matchedWithEqual.slice(name.length + 1);
        }

        const index = args.findIndex((arg) => arg === name);
        if (index === -1) {
            return null;
        }
        const next = args[index + 1];
        if (!next || next.startsWith('--')) {
            return null;
        }
        return next;
    };

    const readNumberArg = (name: string, fallback: number) => {
        const rawValue = readArgValue(name);
        if (rawValue === null) {
            return fallback;
        }
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    };

    const ownerUserIdRaw = readArgValue('--owner-user-id');
    const ownerUserId = ownerUserIdRaw?.trim();
    const reportFileRaw = readArgValue('--report-file');
    const reportFile = reportFileRaw?.trim();

    return {
        limit: readNumberArg('--limit', 2000),
        batchSize: readNumberArg('--batch-size', 200),
        dryRun: args.includes('--dry-run'),
        overwrite: args.includes('--overwrite'),
        confirmOverwrite: args.includes('--confirm-overwrite'),
        reportFile: reportFile || undefined,
        maxFailureLog: readNumberArg('--max-failure-log', 20),
        ownerUserId: ownerUserId || undefined,
    };
};

async function main() {
    const options = parseOptions();
    if (options.overwrite && !options.confirmOverwrite) {
        throw new Error('检测到 --overwrite，但缺少 --confirm-overwrite。请确认后再执行覆盖回填。');
    }
    const startedAt = new Date();
    const runId = `wf-risk-summary-backfill-${startedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;

    const where: Prisma.WorkflowExecutionWhereInput = {
        nodeExecutions: {
            some: {
                nodeType: 'risk-gate',
            },
        },
    };

    if (options.ownerUserId) {
        where.workflowVersion = {
            workflowDefinition: {
                ownerUserId: options.ownerUserId,
            },
        };
    }

    if (!options.overwrite) {
        where.outputSnapshot = {
            path: ['riskGate'],
            equals: Prisma.AnyNull,
        };
    }

    let cursorId: string | undefined;
    let scanned = 0;
    let eligible = 0;
    let updated = 0;
    let skippedNoNodeOutput = 0;
    let skippedNoSummary = 0;
    let failed = 0;
    let batchCount = 0;
    const failures: Array<{ executionId: string; reason: string }> = [];
    const updatedExecutionIds: string[] = [];

    while (scanned < options.limit) {
        const batchStartedAt = Date.now();
        const executions = await prisma.workflowExecution.findMany({
            where,
            orderBy: { id: 'asc' },
            take: Math.min(options.batchSize, options.limit - scanned),
            ...(cursorId
                ? {
                    cursor: { id: cursorId },
                    skip: 1,
                }
                : {}),
            select: {
                id: true,
                outputSnapshot: true,
                nodeExecutions: {
                    where: {
                        nodeType: 'risk-gate',
                    },
                    orderBy: [{ createdAt: 'desc' }],
                    take: 1,
                    select: {
                        outputSnapshot: true,
                    },
                },
            },
        });

        if (executions.length === 0) {
            break;
        }
        batchCount += 1;

        cursorId = executions[executions.length - 1]?.id;
        let scannedInBatch = 0;
        let eligibleInBatch = 0;
        let updatedInBatch = 0;
        let failedInBatch = 0;
        for (const execution of executions) {
            scanned += 1;
            scannedInBatch += 1;
            const latestRiskGateNode = execution.nodeExecutions[0];
            const latestNodeOutput = toObjectRecord(latestRiskGateNode?.outputSnapshot);
            if (!latestNodeOutput) {
                skippedNoNodeOutput += 1;
                continue;
            }

            const summary = extractRiskGateSummary(latestNodeOutput);
            if (!summary) {
                skippedNoSummary += 1;
                continue;
            }

            eligible += 1;
            eligibleInBatch += 1;
            if (options.dryRun) {
                continue;
            }

            try {
                const executionOutput = toObjectRecord(execution.outputSnapshot) ?? {};
                const nextOutput = {
                    ...executionOutput,
                    riskGate: summary,
                };
                await prisma.workflowExecution.update({
                    where: { id: execution.id },
                    data: {
                        outputSnapshot: toJsonValue(nextOutput),
                    },
                });
                updated += 1;
                updatedInBatch += 1;
                if (updatedExecutionIds.length < 20) {
                    updatedExecutionIds.push(execution.id);
                }
            } catch (error) {
                failed += 1;
                failedInBatch += 1;
                failures.push({
                    executionId: execution.id,
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
        }

        console.log('[Workflow Risk Summary Backfill] batch', {
            runId,
            batch: batchCount,
            batchSize: executions.length,
            scannedInBatch,
            eligibleInBatch,
            updatedInBatch,
            failedInBatch,
            scanned,
            eligible,
            updated,
            failed,
            cursorId,
            elapsedMs: Date.now() - batchStartedAt,
        });
    }

    const finishedAt = new Date();
    const report: BackfillReport = {
        runId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        mode: options.overwrite ? 'overwrite' : 'only-missing',
        options: {
            limit: options.limit,
            batchSize: options.batchSize,
            dryRun: options.dryRun,
            overwrite: options.overwrite,
            ownerUserId: options.ownerUserId,
            reportFile: options.reportFile,
            maxFailureLog: options.maxFailureLog,
        },
        stats: {
            scanned,
            eligible,
            updated,
            skippedNoNodeOutput,
            skippedNoSummary,
            failed,
            batchCount,
        },
        samples: {
            updatedExecutionIds,
            failures: failures.slice(0, options.maxFailureLog),
        },
        failuresTruncated: failures.length > options.maxFailureLog,
    };

    const auditStatus = failures.length > 0 ? 'FAILED' : 'SUCCESS';
    let auditPersisted = false;
    try {
        await prisma.workflowBackfillAudit.create({
            data: {
                runId,
                taskType: 'RISK_GATE_SUMMARY',
                status: auditStatus,
                mode: report.mode,
                dryRun: options.dryRun,
                ownerUserId: options.ownerUserId,
                maxScanLimit: options.limit,
                batchSize: options.batchSize,
                scanned,
                eligible,
                updated,
                skippedNoNodeOutput,
                skippedNoSummary,
                failed,
                batchCount,
                optionsSnapshot: toJsonValue(report.options),
                statsSnapshot: toJsonValue(report.stats),
                samplesSnapshot: toJsonValue(report.samples),
                failuresTruncated: report.failuresTruncated,
                errorMessage: failures[0]?.reason ?? null,
                startedAt: new Date(report.startedAt),
                finishedAt: new Date(report.finishedAt),
                durationMs: report.durationMs,
            },
        });
        auditPersisted = true;
    } catch (error) {
        console.warn('[Workflow Risk Summary Backfill] persist audit failed', {
            runId,
            reason: error instanceof Error ? error.message : String(error),
        });
    }

    console.log('[Workflow Risk Summary Backfill] done', {
        ...report,
        auditPersisted,
    });

    if (options.reportFile) {
        const absoluteReportPath = path.resolve(options.reportFile);
        await mkdir(path.dirname(absoluteReportPath), { recursive: true });
        await writeFile(absoluteReportPath, JSON.stringify(report, null, 2), 'utf8');
        console.log('[Workflow Risk Summary Backfill] report written', {
            runId,
            reportFile: absoluteReportPath,
        });
    }

    if (failures.length > 0) {
        console.log('[Workflow Risk Summary Backfill] failures', failures.slice(0, options.maxFailureLog));
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error('[Workflow Risk Summary Backfill] fatal error:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
