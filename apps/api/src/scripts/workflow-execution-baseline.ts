import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

type BaselineOptions = {
    days: number;
    batchSize: number;
    ownerUserId?: string;
    workflowDefinitionId?: string;
    reportFile: string;
    minSuccessRate?: number;
    maxFailureRate?: number;
    maxCanceledRate?: number;
    maxTimeoutRate?: number;
    maxP95DurationMs?: number;
    thresholdsFile?: string;
    useDefaultGateThresholds: boolean;
};

type GateThresholds = {
    minSuccessRate?: number;
    maxFailureRate?: number;
    maxCanceledRate?: number;
    maxTimeoutRate?: number;
    maxP95DurationMs?: number;
};

type BaselineReport = {
    schemaVersion: '1.0';
    runId: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    query: {
        since: string;
        days: number;
        batchSize: number;
        ownerUserId?: string;
        workflowDefinitionId?: string;
    };
    totals: {
        executions: number;
        completed: number;
        running: number;
        pending: number;
        success: number;
        failed: number;
        canceled: number;
        timeoutFailures: number;
    };
    rates: {
        successRate: number;
        failedRate: number;
        canceledRate: number;
        timeoutRate: number;
        completedSuccessRate: number;
    };
    latencyMs: {
        sampleCount: number;
        p50: number;
        p90: number;
        p95: number;
        p99: number;
    };
    gate: {
        passed: boolean;
        evaluated: boolean;
        thresholds: {
            minSuccessRate?: number;
            maxFailureRate?: number;
            maxCanceledRate?: number;
            maxTimeoutRate?: number;
            maxP95DurationMs?: number;
        };
        thresholdsFile?: string;
        thresholdSources?: {
            minSuccessRate: 'CLI_ARG' | 'THRESHOLDS_FILE' | 'DEFAULT' | 'NOT_SET';
            maxFailureRate: 'CLI_ARG' | 'THRESHOLDS_FILE' | 'DEFAULT' | 'NOT_SET';
            maxCanceledRate: 'CLI_ARG' | 'THRESHOLDS_FILE' | 'DEFAULT' | 'NOT_SET';
            maxTimeoutRate: 'CLI_ARG' | 'THRESHOLDS_FILE' | 'DEFAULT' | 'NOT_SET';
            maxP95DurationMs: 'CLI_ARG' | 'THRESHOLDS_FILE' | 'DEFAULT' | 'NOT_SET';
        };
        violations: string[];
        warnings: string[];
    };
};

const prisma = new PrismaClient();
const DEFAULT_GATE_THRESHOLDS: Required<GateThresholds> = {
    minSuccessRate: 0.9,
    maxFailureRate: 0.1,
    maxCanceledRate: 0.1,
    maxTimeoutRate: 0.05,
    maxP95DurationMs: 60000,
};

const readArgValue = (args: string[], name: string): string | null => {
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

const parsePositiveNumberArg = (args: string[], name: string, fallback: number): number => {
    const raw = readArgValue(args, name);
    if (raw === null) {
        return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
};

const parseRateArg = (args: string[], name: string): number | undefined => {
    const raw = readArgValue(args, name);
    if (raw === null) {
        return undefined;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`${name} 必须是 0~1 之间的小数`);
    }
    return parsed;
};

const parsePositiveThresholdArg = (args: string[], name: string): number | undefined => {
    const raw = readArgValue(args, name);
    if (raw === null) {
        return undefined;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${name} 必须是正数`);
    }
    return parsed;
};

const parseThresholdRate = (value: unknown, label: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`${label} 必须是 0~1 之间的小数`);
    }
    return parsed;
};

const parseThresholdDuration = (value: unknown, label: string): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} 必须是正数`);
    }
    return Math.floor(parsed);
};

const parseOptions = (): BaselineOptions => {
    const args = process.argv.slice(2);
    const ownerUserId = readArgValue(args, '--owner-user-id')?.trim();
    const workflowDefinitionId = readArgValue(args, '--workflow-definition-id')?.trim();
    const reportFileRaw = readArgValue(args, '--report-file')?.trim();
    const thresholdsFileRaw = readArgValue(args, '--thresholds-file')?.trim();

    return {
        days: Math.floor(parsePositiveNumberArg(args, '--days', 7)),
        batchSize: Math.floor(parsePositiveNumberArg(args, '--batch-size', 1000)),
        ownerUserId: ownerUserId || undefined,
        workflowDefinitionId: workflowDefinitionId || undefined,
        reportFile: reportFileRaw || 'logs/workflow-execution-baseline-report.json',
        minSuccessRate: parseRateArg(args, '--min-success-rate'),
        maxFailureRate: parseRateArg(args, '--max-failure-rate'),
        maxCanceledRate: parseRateArg(args, '--max-canceled-rate'),
        maxTimeoutRate: parseRateArg(args, '--max-timeout-rate'),
        maxP95DurationMs: parsePositiveThresholdArg(args, '--max-p95-duration-ms'),
        thresholdsFile: thresholdsFileRaw || undefined,
        useDefaultGateThresholds: args.includes('--use-default-gate-thresholds'),
    };
};

const loadThresholdsFromFile = async (thresholdsFile: string): Promise<GateThresholds> => {
    const absolutePath = path.resolve(thresholdsFile);
    const content = await readFile(absolutePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const container = (parsed?.gate && typeof parsed.gate === 'object')
        ? (parsed.gate as Record<string, unknown>)
        : parsed;

    return {
        minSuccessRate: container.minSuccessRate === undefined
            ? undefined
            : parseThresholdRate(container.minSuccessRate, 'gate.minSuccessRate'),
        maxFailureRate: container.maxFailureRate === undefined
            ? undefined
            : parseThresholdRate(container.maxFailureRate, 'gate.maxFailureRate'),
        maxCanceledRate: container.maxCanceledRate === undefined
            ? undefined
            : parseThresholdRate(container.maxCanceledRate, 'gate.maxCanceledRate'),
        maxTimeoutRate: container.maxTimeoutRate === undefined
            ? undefined
            : parseThresholdRate(container.maxTimeoutRate, 'gate.maxTimeoutRate'),
        maxP95DurationMs: container.maxP95DurationMs === undefined
            ? undefined
            : parseThresholdDuration(container.maxP95DurationMs, 'gate.maxP95DurationMs'),
    };
};

const toRate = (value: number, denominator: number): number => {
    if (denominator <= 0) {
        return 0;
    }
    return Number((value / denominator).toFixed(6));
};

const calculatePercentile = (sortedValues: number[], percentile: number): number => {
    if (sortedValues.length === 0) {
        return 0;
    }
    if (sortedValues.length === 1) {
        return sortedValues[0];
    }
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    const boundedIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
    return sortedValues[boundedIndex];
};

const buildWhere = (options: BaselineOptions, since: Date): Prisma.WorkflowExecutionWhereInput => {
    const where: Prisma.WorkflowExecutionWhereInput = {
        createdAt: {
            gte: since,
        },
    };

    if (options.ownerUserId || options.workflowDefinitionId) {
        where.workflowVersion = {
            workflowDefinition: {
                ...(options.ownerUserId ? { ownerUserId: options.ownerUserId } : {}),
                ...(options.workflowDefinitionId ? { id: options.workflowDefinitionId } : {}),
            },
        };
    }

    return where;
};

async function main() {
    const options = parseOptions();
    const thresholdsFromFile: GateThresholds = {};
    const thresholdWarnings: string[] = [];

    if (options.thresholdsFile) {
        try {
            const loaded = await loadThresholdsFromFile(options.thresholdsFile);
            thresholdsFromFile.minSuccessRate = loaded.minSuccessRate;
            thresholdsFromFile.maxFailureRate = loaded.maxFailureRate;
            thresholdsFromFile.maxCanceledRate = loaded.maxCanceledRate;
            thresholdsFromFile.maxTimeoutRate = loaded.maxTimeoutRate;
            thresholdsFromFile.maxP95DurationMs = loaded.maxP95DurationMs;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (options.useDefaultGateThresholds) {
                thresholdWarnings.push(
                    `thresholds-file-unavailable: ${options.thresholdsFile}, reason=${message}, fallback=DEFAULT`,
                );
            } else {
                throw new Error(`读取阈值配置失败: ${options.thresholdsFile}; ${message}`);
            }
        }
    }

    const resolveThresholdSource = (
        cliValue: number | undefined,
        fileValue: number | undefined,
        useDefault: boolean,
    ): 'CLI_ARG' | 'THRESHOLDS_FILE' | 'DEFAULT' | 'NOT_SET' => {
        if (cliValue !== undefined) {
            return 'CLI_ARG';
        }
        if (fileValue !== undefined) {
            return 'THRESHOLDS_FILE';
        }
        if (useDefault) {
            return 'DEFAULT';
        }
        return 'NOT_SET';
    };

    const resolvedThresholds: GateThresholds = {
        minSuccessRate: options.minSuccessRate
            ?? thresholdsFromFile.minSuccessRate
            ?? (options.useDefaultGateThresholds ? DEFAULT_GATE_THRESHOLDS.minSuccessRate : undefined),
        maxFailureRate: options.maxFailureRate
            ?? thresholdsFromFile.maxFailureRate
            ?? (options.useDefaultGateThresholds ? DEFAULT_GATE_THRESHOLDS.maxFailureRate : undefined),
        maxCanceledRate: options.maxCanceledRate
            ?? thresholdsFromFile.maxCanceledRate
            ?? (options.useDefaultGateThresholds ? DEFAULT_GATE_THRESHOLDS.maxCanceledRate : undefined),
        maxTimeoutRate: options.maxTimeoutRate
            ?? thresholdsFromFile.maxTimeoutRate
            ?? (options.useDefaultGateThresholds ? DEFAULT_GATE_THRESHOLDS.maxTimeoutRate : undefined),
        maxP95DurationMs: options.maxP95DurationMs
            ?? thresholdsFromFile.maxP95DurationMs
            ?? (options.useDefaultGateThresholds ? DEFAULT_GATE_THRESHOLDS.maxP95DurationMs : undefined),
    };

    const thresholdSources = {
        minSuccessRate: resolveThresholdSource(
            options.minSuccessRate,
            thresholdsFromFile.minSuccessRate,
            options.useDefaultGateThresholds,
        ),
        maxFailureRate: resolveThresholdSource(
            options.maxFailureRate,
            thresholdsFromFile.maxFailureRate,
            options.useDefaultGateThresholds,
        ),
        maxCanceledRate: resolveThresholdSource(
            options.maxCanceledRate,
            thresholdsFromFile.maxCanceledRate,
            options.useDefaultGateThresholds,
        ),
        maxTimeoutRate: resolveThresholdSource(
            options.maxTimeoutRate,
            thresholdsFromFile.maxTimeoutRate,
            options.useDefaultGateThresholds,
        ),
        maxP95DurationMs: resolveThresholdSource(
            options.maxP95DurationMs,
            thresholdsFromFile.maxP95DurationMs,
            options.useDefaultGateThresholds,
        ),
    };

    const startedAt = new Date();
    const runId = `wf-execution-baseline-${startedAt.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;
    const since = new Date(startedAt.getTime() - options.days * 24 * 60 * 60 * 1000);

    const where = buildWhere(options, since);
    let cursorId: string | undefined;

    let totalExecutions = 0;
    let runningExecutions = 0;
    let pendingExecutions = 0;
    let successExecutions = 0;
    let failedExecutions = 0;
    let canceledExecutions = 0;
    let timeoutFailures = 0;
    const durationValues: number[] = [];

    while (true) {
        const batch = await prisma.workflowExecution.findMany({
            where,
            orderBy: { id: 'asc' },
            take: options.batchSize,
            ...(cursorId
                ? {
                    cursor: { id: cursorId },
                    skip: 1,
                }
                : {}),
            select: {
                id: true,
                status: true,
                failureCategory: true,
                startedAt: true,
                completedAt: true,
            },
        });

        if (batch.length === 0) {
            break;
        }

        for (const execution of batch) {
            totalExecutions += 1;

            if (execution.status === 'PENDING') {
                pendingExecutions += 1;
            } else if (execution.status === 'RUNNING') {
                runningExecutions += 1;
            } else if (execution.status === 'SUCCESS') {
                successExecutions += 1;
            } else if (execution.status === 'FAILED') {
                failedExecutions += 1;
            } else if (execution.status === 'CANCELED') {
                canceledExecutions += 1;
            }

            if (execution.failureCategory === 'TIMEOUT') {
                timeoutFailures += 1;
            }

            if (execution.startedAt && execution.completedAt) {
                const durationMs = execution.completedAt.getTime() - execution.startedAt.getTime();
                if (Number.isFinite(durationMs) && durationMs >= 0) {
                    durationValues.push(durationMs);
                }
            }
        }

        cursorId = batch[batch.length - 1]?.id;
    }

    durationValues.sort((a, b) => a - b);
    const completedExecutions = successExecutions + failedExecutions + canceledExecutions;

    const successRate = toRate(successExecutions, totalExecutions);
    const failedRate = toRate(failedExecutions, totalExecutions);
    const canceledRate = toRate(canceledExecutions, totalExecutions);
    const timeoutRate = toRate(timeoutFailures, totalExecutions);
    const completedSuccessRate = toRate(successExecutions, completedExecutions);

    const p50 = calculatePercentile(durationValues, 50);
    const p90 = calculatePercentile(durationValues, 90);
    const p95 = calculatePercentile(durationValues, 95);
    const p99 = calculatePercentile(durationValues, 99);

    const violations: string[] = [];
    const warnings: string[] = [...thresholdWarnings];
    const hasRateThresholds = resolvedThresholds.minSuccessRate !== undefined
        || resolvedThresholds.maxFailureRate !== undefined
        || resolvedThresholds.maxCanceledRate !== undefined
        || resolvedThresholds.maxTimeoutRate !== undefined;
    const hasLatencyThreshold = resolvedThresholds.maxP95DurationMs !== undefined;
    const gateEvaluated = hasRateThresholds || hasLatencyThreshold;

    if (totalExecutions > 0) {
        if (resolvedThresholds.minSuccessRate !== undefined && successRate < resolvedThresholds.minSuccessRate) {
            violations.push(`successRate=${successRate} < minSuccessRate=${resolvedThresholds.minSuccessRate}`);
        }
        if (resolvedThresholds.maxFailureRate !== undefined && failedRate > resolvedThresholds.maxFailureRate) {
            violations.push(`failedRate=${failedRate} > maxFailureRate=${resolvedThresholds.maxFailureRate}`);
        }
        if (resolvedThresholds.maxCanceledRate !== undefined && canceledRate > resolvedThresholds.maxCanceledRate) {
            violations.push(`canceledRate=${canceledRate} > maxCanceledRate=${resolvedThresholds.maxCanceledRate}`);
        }
        if (resolvedThresholds.maxTimeoutRate !== undefined && timeoutRate > resolvedThresholds.maxTimeoutRate) {
            violations.push(`timeoutRate=${timeoutRate} > maxTimeoutRate=${resolvedThresholds.maxTimeoutRate}`);
        }
    } else if (hasRateThresholds) {
        warnings.push('rate-thresholds-skipped: no execution samples in selected window');
    }

    if (durationValues.length > 0) {
        if (resolvedThresholds.maxP95DurationMs !== undefined && p95 > resolvedThresholds.maxP95DurationMs) {
            violations.push(`p95DurationMs=${p95} > maxP95DurationMs=${resolvedThresholds.maxP95DurationMs}`);
        }
    } else if (hasLatencyThreshold) {
        warnings.push('latency-threshold-skipped: no duration samples in selected window');
    }

    const finishedAt = new Date();
    const report: BaselineReport = {
        schemaVersion: '1.0',
        runId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        query: {
            since: since.toISOString(),
            days: options.days,
            batchSize: options.batchSize,
            ownerUserId: options.ownerUserId,
            workflowDefinitionId: options.workflowDefinitionId,
        },
        totals: {
            executions: totalExecutions,
            completed: completedExecutions,
            running: runningExecutions,
            pending: pendingExecutions,
            success: successExecutions,
            failed: failedExecutions,
            canceled: canceledExecutions,
            timeoutFailures,
        },
        rates: {
            successRate,
            failedRate,
            canceledRate,
            timeoutRate,
            completedSuccessRate,
        },
        latencyMs: {
            sampleCount: durationValues.length,
            p50,
            p90,
            p95,
            p99,
        },
        gate: {
            passed: violations.length === 0,
            evaluated: gateEvaluated,
            thresholds: {
                minSuccessRate: resolvedThresholds.minSuccessRate,
                maxFailureRate: resolvedThresholds.maxFailureRate,
                maxCanceledRate: resolvedThresholds.maxCanceledRate,
                maxTimeoutRate: resolvedThresholds.maxTimeoutRate,
                maxP95DurationMs: resolvedThresholds.maxP95DurationMs,
            },
            thresholdsFile: options.thresholdsFile,
            thresholdSources,
            violations,
            warnings,
        },
    };

    const reportPath = path.resolve(options.reportFile);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-execution-baseline] report=${reportPath} executions=${totalExecutions} passed=${report.gate.passed}\n`,
    );
    process.stdout.write(
        `[workflow-execution-baseline] rates success=${successRate} failed=${failedRate} canceled=${canceledRate} timeout=${timeoutRate} p95=${p95}\n`,
    );
    if (warnings.length > 0) {
        process.stdout.write(`[workflow-execution-baseline] warnings: ${warnings.join('; ')}\n`);
    }

    if (!report.gate.passed) {
        process.stderr.write(`[workflow-execution-baseline] gate failed: ${violations.join('; ')}\n`);
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        if (error instanceof Error) {
            process.stderr.write(`[workflow-execution-baseline] fatal: ${error.message}\n${error.stack ?? ''}\n`);
        } else {
            process.stderr.write(`[workflow-execution-baseline] fatal: ${String(error)}\n`);
        }
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
