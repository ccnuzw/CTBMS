import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { RiskGateNodeExecutor } from '../../src/modules/workflow-execution/engine/node-executors/risk-gate.executor';
import { NodeExecutionContext } from '../../src/modules/workflow-execution/engine/node-executor.interface';

type ScenarioDefinition = {
    id: string;
    description: string;
    buildContext: () => NodeExecutionContext;
};

type ScenarioMetrics = {
    id: string;
    description: string;
    sampleSize: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
};

type PerfReport = {
    schemaVersion: string;
    generatedAt: string;
    environment: {
        nodeVersion: string;
        platform: string;
        arch: string;
    };
    iterations: number;
    warmupRuns: number;
    metrics: ScenarioMetrics[];
    thresholdCheck: {
        enabled: boolean;
        limits: Array<{ scenarioId: string; maxP95Ms: number }>;
        violations: Array<{ scenarioId: string; actualP95Ms: number; maxP95Ms: number }>;
    };
};

const DEFAULT_ITERATIONS = 2000;
const DEFAULT_WARMUP_RUNS = 200;
const PERF_REPORT_SCHEMA_VERSION = '1.0';

const args = process.argv.slice(2);

const parseNumberArg = (key: string, fallback: number): number => {
    const arg = args.find((item) => item.startsWith(`--${key}=`));
    if (!arg) {
        return fallback;
    }
    const value = Number(arg.split('=')[1]);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --${key} value: ${arg}`);
    }
    return Math.floor(value);
};

const parseStringArg = (key: string): string | undefined => {
    const arg = args.find((item) => item.startsWith(`--${key}=`));
    if (!arg) {
        return undefined;
    }
    const value = arg.split('=').slice(1).join('=').trim();
    return value || undefined;
};

const parseOptionalNumberArg = (key: string): number | undefined => {
    const arg = args.find((item) => item.startsWith(`--${key}=`));
    if (!arg) {
        return undefined;
    }
    const value = Number(arg.split('=').slice(1).join('='));
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --${key} value: ${arg}`);
    }
    return value;
};

const percentile = (sorted: number[], ratio: number): number => {
    if (sorted.length === 0) {
        return 0;
    }
    const position = Math.ceil(sorted.length * ratio) - 1;
    const index = Math.max(0, Math.min(sorted.length - 1, position));
    return sorted[index];
};

const average = (values: number[]): number => {
    if (values.length === 0) {
        return 0;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
};

const toFixed = (value: number): number => Number(value.toFixed(4));

const scenarios: ScenarioDefinition[] = [
    {
        id: 'pass-low-risk',
        description: '低风险通过（无 blocker）',
        buildContext: () => ({
            executionId: 'perf_exec_pass',
            triggerUserId: 'perf_user',
            node: {
                id: 'risk_gate_pass',
                type: 'risk-gate',
                name: '风险闸门',
                enabled: true,
                config: {
                    riskProfileCode: 'PERF_BASE',
                    blockWhenRiskGte: 'HIGH',
                },
            },
            input: {
                riskLevel: 'LOW',
                score: 92,
            },
        }),
    },
    {
        id: 'soft-block-high-risk',
        description: '高风险阻断（soft block）',
        buildContext: () => ({
            executionId: 'perf_exec_soft_block',
            triggerUserId: 'perf_user',
            node: {
                id: 'risk_gate_soft_block',
                type: 'risk-gate',
                name: '风险闸门',
                enabled: true,
                config: {
                    riskProfileCode: 'PERF_BASE',
                    blockWhenRiskGte: 'HIGH',
                    degradeAction: 'HOLD',
                    hardBlock: false,
                },
            },
            input: {
                riskLevel: 'HIGH',
                confidence: 55,
            },
        }),
    },
    {
        id: 'hard-block-by-rule',
        description: '规则命中硬阻断（hard block）',
        buildContext: () => ({
            executionId: 'perf_exec_hard_block',
            triggerUserId: 'perf_user',
            node: {
                id: 'risk_gate_hard_block',
                type: 'risk-gate',
                name: '风险闸门',
                enabled: true,
                config: {
                    riskProfileCode: 'PERF_STRICT',
                    blockWhenRiskGte: 'EXTREME',
                    blockerRules: ['flags.forceBlock'],
                    degradeAction: 'REDUCE',
                    hardBlock: true,
                },
            },
            input: {
                riskLevel: 'MEDIUM',
                flags: {
                    forceBlock: true,
                },
            },
        }),
    },
];

const parseThresholdLimits = () => {
    const limits: Array<{ scenarioId: string; maxP95Ms: number }> = [];
    for (const scenario of scenarios) {
        const argKey = `max-p95-${scenario.id}`;
        const value = parseOptionalNumberArg(argKey);
        if (value !== undefined) {
            limits.push({
                scenarioId: scenario.id,
                maxP95Ms: value,
            });
        }
    }
    return limits;
};

const findMetric = (metrics: ScenarioMetrics[], scenarioId: string) =>
    metrics.find((metric) => metric.id === scenarioId);

const checkThresholdViolations = (
    metrics: ScenarioMetrics[],
    limits: Array<{ scenarioId: string; maxP95Ms: number }>,
) => {
    const violations: Array<{ scenarioId: string; actualP95Ms: number; maxP95Ms: number }> = [];
    for (const limit of limits) {
        const metric = findMetric(metrics, limit.scenarioId);
        if (!metric) {
            throw new Error(`Metric not found for scenario: ${limit.scenarioId}`);
        }
        if (metric.p95Ms > limit.maxP95Ms) {
            violations.push({
                scenarioId: limit.scenarioId,
                actualP95Ms: metric.p95Ms,
                maxP95Ms: limit.maxP95Ms,
            });
        }
    }
    return violations;
};

const benchmarkScenario = async (
    executor: RiskGateNodeExecutor,
    scenario: ScenarioDefinition,
    iterations: number,
    warmupRuns: number,
): Promise<ScenarioMetrics> => {
    for (let i = 0; i < warmupRuns; i += 1) {
        await executor.execute(scenario.buildContext());
    }

    const samples: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
        const start = process.hrtime.bigint();
        await executor.execute(scenario.buildContext());
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        samples.push(durationMs);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    return {
        id: scenario.id,
        description: scenario.description,
        sampleSize: samples.length,
        p50Ms: toFixed(percentile(sorted, 0.5)),
        p95Ms: toFixed(percentile(sorted, 0.95)),
        p99Ms: toFixed(percentile(sorted, 0.99)),
        avgMs: toFixed(average(samples)),
        minMs: toFixed(sorted[0]),
        maxMs: toFixed(sorted[sorted.length - 1]),
    };
};

const printReport = (report: PerfReport) => {
    console.log('\nRiskGate performance baseline:');
    console.table(
        report.metrics.map((metric) => ({
            scenario: metric.id,
            p50Ms: metric.p50Ms,
            p95Ms: metric.p95Ms,
            p99Ms: metric.p99Ms,
            avgMs: metric.avgMs,
            minMs: metric.minMs,
            maxMs: metric.maxMs,
            samples: metric.sampleSize,
        })),
    );
};

const maybeWriteReportFile = async (reportFile: string | undefined, report: PerfReport) => {
    if (!reportFile) {
        return;
    }

    const absolutePath = resolve(reportFile);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`\nReport file written to: ${absolutePath}`);
};

async function main() {
    const iterations = parseNumberArg('iterations', DEFAULT_ITERATIONS);
    const warmupRuns = parseNumberArg('warmup', DEFAULT_WARMUP_RUNS);
    const reportFile = parseStringArg('report-file');
    const thresholdLimits = parseThresholdLimits();

    const executor = new RiskGateNodeExecutor();
    const metrics: ScenarioMetrics[] = [];

    for (const scenario of scenarios) {
        const scenarioMetrics = await benchmarkScenario(executor, scenario, iterations, warmupRuns);
        metrics.push(scenarioMetrics);
    }

    const report: PerfReport = {
        schemaVersion: PERF_REPORT_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
        },
        iterations,
        warmupRuns,
        metrics,
        thresholdCheck: {
            enabled: thresholdLimits.length > 0,
            limits: thresholdLimits,
            violations: checkThresholdViolations(metrics, thresholdLimits),
        },
    };

    printReport(report);
    await maybeWriteReportFile(reportFile, report);

    if (report.thresholdCheck.violations.length > 0) {
        const violationDetails = report.thresholdCheck.violations
            .map((item) => `${item.scenarioId}: p95=${item.actualP95Ms}ms > ${item.maxP95Ms}ms`)
            .join('; ');
        throw new Error(`RiskGate perf threshold exceeded: ${violationDetails}`);
    }
}

main().catch((error) => {
    console.error('RiskGate performance baseline failed:', error);
    process.exitCode = 1;
});
