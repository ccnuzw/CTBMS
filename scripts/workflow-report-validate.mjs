#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_SMOKE_REPORT = 'logs/workflow-smoke-gate-report.json';
const DEFAULT_PERF_REPORT = 'apps/api/logs/workflow-perf-risk-gate-baseline.json';
const EXPECTED_SCENARIO_IDS = ['pass-low-risk', 'soft-block-high-risk', 'hard-block-by-rule'];
const SUMMARY_JSON_SCHEMA_VERSION = '1.0';

const args = process.argv.slice(2);

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const hasFlag = (name) => args.includes(name);
const parseOptionalPositiveNumber = (name) => {
    const raw = readArgValue(name, '').trim();
    if (!raw) {
        return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid ${name} value: ${raw}`);
    }
    return parsed;
};

const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ensure = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const readJsonFile = async (targetPath, options = { allowMissing: false }) => {
    const absolutePath = toAbsolutePath(targetPath);
    try {
        const content = await readFile(absolutePath, 'utf-8');
        return {
            absolutePath,
            data: JSON.parse(content),
            missing: false,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.allowMissing && /ENOENT/i.test(message)) {
            return {
                absolutePath,
                data: null,
                missing: true,
            };
        }
        throw new Error(`Failed to read ${absolutePath}: ${message}`);
    }
};

const normalizePathForCompare = (targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
        return null;
    }
    return path.resolve(repoRoot, targetPath);
};

const validateSmokeReport = (report) => {
    ensure(isObjectRecord(report), 'Smoke report must be an object.');
    ensure(typeof report.schemaVersion === 'string' && report.schemaVersion.trim().length > 0, 'Smoke report schemaVersion is required.');
    ensure(typeof report.runId === 'string' && report.runId.trim().length > 0, 'Smoke report runId is required.');
    ensure(['base', 'extended', 'gate'].includes(report.mode), `Smoke report mode is invalid: ${report.mode}`);
    ensure(['SUCCESS', 'FAILED'].includes(report.status), `Smoke report status is invalid: ${report.status}`);
    ensure(Array.isArray(report.steps) && report.steps.length > 0, 'Smoke report steps must be a non-empty array.');
    ensure(isObjectRecord(report.summary), 'Smoke report summary is required.');

    const successCount = report.steps.filter((step) => step?.status === 'SUCCESS').length;
    const failedCount = report.steps.filter((step) => step?.status === 'FAILED').length;
    ensure(report.summary.totalSteps === report.steps.length, 'Smoke summary totalSteps does not match steps length.');
    ensure(report.summary.successfulSteps === successCount, 'Smoke summary successfulSteps does not match computed value.');
    ensure(report.summary.failedSteps === failedCount, 'Smoke summary failedSteps does not match computed value.');

    let retryTotal = 0;
    for (const step of report.steps) {
        ensure(isObjectRecord(step), 'Smoke step must be an object.');
        ensure(typeof step.id === 'string' && step.id.trim().length > 0, 'Smoke step id is required.');
        ensure(typeof step.name === 'string' && step.name.trim().length > 0, 'Smoke step name is required.');
        ensure(Array.isArray(step.args), `Smoke step args must be an array: ${step.name}`);
        ensure(['SUCCESS', 'FAILED'].includes(step.status), `Smoke step status is invalid: ${step.name}`);
        ensure(Array.isArray(step.attempts) && step.attempts.length > 0, `Smoke step attempts must be non-empty: ${step.name}`);
        retryTotal += Number(step.retryCount || 0);

        for (const attempt of step.attempts) {
            ensure(isObjectRecord(attempt), `Smoke attempt must be object: ${step.name}`);
            ensure(typeof attempt.attempt === 'number' && attempt.attempt >= 1, `Smoke attempt index invalid: ${step.name}`);
            ensure(typeof attempt.exitCode === 'number', `Smoke attempt exitCode invalid: ${step.name}`);
            ensure(typeof attempt.durationMs === 'number' && attempt.durationMs >= 0, `Smoke attempt duration invalid: ${step.name}`);
        }
    }

    ensure(report.summary.totalRetries === retryTotal, 'Smoke summary totalRetries does not match computed value.');

    return {
        mode: report.mode,
        status: report.status,
        durationMs: Number(report.durationMs || 0),
        totalSteps: report.summary.totalSteps,
        failedStepName: report.summary.failedStepName || null,
        totalRetries: report.summary.totalRetries,
        startedAt: typeof report.startedAt === 'string' ? report.startedAt : null,
        finishedAt: typeof report.finishedAt === 'string' ? report.finishedAt : null,
    };
};

const validatePerfReport = (report) => {
    ensure(isObjectRecord(report), 'Perf report must be an object.');
    ensure(typeof report.generatedAt === 'string' && report.generatedAt.trim().length > 0, 'Perf report generatedAt is required.');
    ensure(typeof report.schemaVersion === 'string' && report.schemaVersion.trim().length > 0, 'Perf report schemaVersion is required.');
    ensure(Array.isArray(report.metrics) && report.metrics.length > 0, 'Perf report metrics must be a non-empty array.');
    ensure(isObjectRecord(report.thresholdCheck), 'Perf report thresholdCheck is required.');
    ensure(Array.isArray(report.thresholdCheck.limits), 'Perf report thresholdCheck.limits must be an array.');
    ensure(Array.isArray(report.thresholdCheck.violations), 'Perf report thresholdCheck.violations must be an array.');

    const scenarioIds = new Set();
    const p95ByScenario = {};

    for (const metric of report.metrics) {
        ensure(isObjectRecord(metric), 'Perf metric must be an object.');
        ensure(typeof metric.id === 'string' && metric.id.trim().length > 0, 'Perf metric id is required.');
        ensure(typeof metric.sampleSize === 'number' && metric.sampleSize > 0, `Perf sampleSize invalid: ${metric.id}`);
        ensure(typeof metric.p50Ms === 'number' && metric.p50Ms >= 0, `Perf p50 invalid: ${metric.id}`);
        ensure(typeof metric.p95Ms === 'number' && metric.p95Ms >= 0, `Perf p95 invalid: ${metric.id}`);
        ensure(typeof metric.p99Ms === 'number' && metric.p99Ms >= 0, `Perf p99 invalid: ${metric.id}`);
        ensure(metric.p50Ms <= metric.p95Ms, `Perf percentile order invalid (p50 > p95): ${metric.id}`);
        ensure(metric.p95Ms <= metric.p99Ms, `Perf percentile order invalid (p95 > p99): ${metric.id}`);
        scenarioIds.add(metric.id);
        p95ByScenario[metric.id] = metric.p95Ms;
    }

    for (const scenarioId of EXPECTED_SCENARIO_IDS) {
        ensure(scenarioIds.has(scenarioId), `Perf report missing scenario: ${scenarioId}`);
    }

    return {
        generatedAt: report.generatedAt,
        violations: report.thresholdCheck.violations.length,
        p95ByScenario,
    };
};

const formatDuration = (durationMs) => `${Number(durationMs || 0).toFixed(2)}ms`;
const parseIsoTimestamp = (value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
};

const toMarkdownSummary = ({ smoke, perf, qualityGate, warnings, validationErrors }) => {
    const lines = [
        '# Workflow Report Summary',
        '',
        `- Smoke report: ${smoke ? 'loaded' : 'missing'}`,
        `- Perf report: ${perf ? 'loaded' : 'missing'}`,
        `- Quality gate report: ${qualityGate ? 'loaded' : 'missing'}`,
        '',
    ];

    if (smoke) {
        lines.push('## Smoke');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|---|---|');
        lines.push(`| Mode | \`${smoke.mode}\` |`);
        lines.push(`| Status | \`${smoke.status}\` |`);
        lines.push(`| Duration | \`${formatDuration(smoke.durationMs)}\` |`);
        lines.push(`| Steps | \`${smoke.totalSteps}\` |`);
        lines.push(`| Retries | \`${smoke.totalRetries}\` |`);
        lines.push(`| Failed Step | \`${smoke.failedStepName ?? 'N/A'}\` |`);
        lines.push('');
    }

    if (perf) {
        lines.push('## Perf (P95)');
        lines.push('');
        lines.push('| Scenario | P95(ms) |');
        lines.push('|---|---:|');
        for (const scenarioId of EXPECTED_SCENARIO_IDS) {
            const p95 = perf.p95ByScenario[scenarioId];
            lines.push(`| \`${scenarioId}\` | ${typeof p95 === 'number' ? p95.toFixed(4) : 'N/A'} |`);
        }
        lines.push('');
        lines.push(`- Threshold violations: \`${perf.violations}\``);
        lines.push('');
    }

    if (qualityGate) {
        lines.push('## Quality Gate');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|---|---|');
        lines.push(`| Status | \`${qualityGate.status}\` |`);
        lines.push(`| Run ID | \`${qualityGate.runId ?? 'N/A'}\` |`);
        lines.push(`| Failed Steps | \`${qualityGate.failedSteps.join(', ') || 'N/A'}\` |`);
        lines.push(`| Smoke Report | \`${qualityGate.smokeReportFile ?? 'N/A'}\` |`);
        lines.push(`| Perf Report | \`${qualityGate.perfReportFile ?? 'N/A'}\` |`);
        lines.push(`| Summary Markdown | \`${qualityGate.summaryMarkdownFile ?? 'N/A'}\` |`);
        lines.push(`| Summary JSON | \`${qualityGate.summaryJsonFile ?? 'N/A'}\` |`);
        lines.push('');
    }

    if (warnings.length > 0) {
        lines.push('## Warnings');
        lines.push('');
        for (const warning of warnings) {
            lines.push(`- ${warning}`);
        }
        lines.push('');
    }

    if (validationErrors.length > 0) {
        lines.push('## Validation Errors');
        lines.push('');
        for (const error of validationErrors) {
            lines.push(`- ${error}`);
        }
        lines.push('');
    }

    return lines.join('\n');
};

const toJsonSummary = ({
    smokeReportPath,
    perfReportPath,
    qualityGateReportPath,
    summaryMarkdownFile,
    summaryJsonFile,
    expectedSummaryJsonSchemaVersion,
    smoke,
    perf,
    qualityGate,
    warnings,
    validationErrors,
}) => ({
    schemaVersion: SUMMARY_JSON_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status: validationErrors.length > 0 ? 'FAILED' : 'SUCCESS',
    inputs: {
        smokeReportPath,
        perfReportPath,
        qualityGateReportPath: qualityGateReportPath || null,
        summaryMarkdownFile: summaryMarkdownFile || null,
        summaryJsonFile: summaryJsonFile || null,
        expectedSummaryJsonSchemaVersion: expectedSummaryJsonSchemaVersion || null,
    },
    smoke,
    perf,
    qualityGate,
    warnings,
    validationErrors,
});

async function main() {
    const smokeReportPath = readArgValue('--smoke-report', DEFAULT_SMOKE_REPORT);
    const perfReportPath = readArgValue('--perf-report', DEFAULT_PERF_REPORT);
    const qualityGateReportPath = readArgValue('--quality-gate-report', '').trim();
    const summaryMarkdownFile = readArgValue('--summary-markdown-file', '');
    const summaryJsonFile = readArgValue('--summary-json-file', '');
    const allowMissingPerfReport = hasFlag('--allow-missing-perf-report');
    const allowMissingSmokeReport = hasFlag('--allow-missing-smoke-report');
    const requireSmokeSuccess = hasFlag('--require-smoke-success');
    const requirePerfNoViolations = hasFlag('--require-perf-no-violations');
    const requireQualityGateSuccess = hasFlag('--require-quality-gate-success');
    const requireSmokeMode = readArgValue('--require-smoke-mode', '').trim();
    const requireReportsGeneratedAfter = readArgValue('--require-reports-generated-after', '').trim();
    const expectedSummaryJsonSchemaVersion = readArgValue('--summary-json-schema-version', '').trim();
    const maxReportAgeMs = parseOptionalPositiveNumber('--max-report-age-ms');

    const warnings = [];
    const validationErrors = [];
    const smokeFile = await readJsonFile(smokeReportPath, { allowMissing: allowMissingSmokeReport });
    const perfFile = await readJsonFile(perfReportPath, { allowMissing: allowMissingPerfReport });
    const qualityGateFile = qualityGateReportPath
        ? await readJsonFile(qualityGateReportPath)
        : null;

    let smokeSummary = null;
    let perfSummary = null;
    let qualityGateSummary = null;

    if (smokeFile.missing) {
        warnings.push(`Smoke report missing: ${smokeFile.absolutePath}`);
    } else {
        try {
            smokeSummary = validateSmokeReport(smokeFile.data);
            console.log(
                `[workflow-report-validate] smoke mode=${smokeSummary.mode} status=${smokeSummary.status} steps=${smokeSummary.totalSteps} retries=${smokeSummary.totalRetries} duration=${formatDuration(smokeSummary.durationMs)}`,
            );
        } catch (error) {
            validationErrors.push(
                `Smoke report structure invalid: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    if (perfFile.missing) {
        warnings.push(`Perf report missing: ${perfFile.absolutePath}`);
    } else {
        try {
            perfSummary = validatePerfReport(perfFile.data);
            console.log(
                `[workflow-report-validate] perf generatedAt=${perfSummary.generatedAt} thresholdViolations=${perfSummary.violations}`,
            );
        } catch (error) {
            validationErrors.push(
                `Perf report structure invalid: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    if (requireSmokeSuccess) {
        if (!smokeSummary) {
            validationErrors.push('Smoke report is required to enforce success status.');
        } else if (smokeSummary.status !== 'SUCCESS') {
            validationErrors.push(`Smoke report status must be SUCCESS, got ${smokeSummary.status}.`);
        }
    }

    if (requireSmokeMode) {
        if (!['base', 'extended', 'gate'].includes(requireSmokeMode)) {
            validationErrors.push(`Invalid --require-smoke-mode value: ${requireSmokeMode}`);
        } else if (!smokeSummary) {
            validationErrors.push('Smoke report is required to enforce smoke mode.');
        } else if (smokeSummary.mode !== requireSmokeMode) {
            validationErrors.push(
                `Smoke report mode must be ${requireSmokeMode}, got ${smokeSummary.mode}.`,
            );
        }
    }

    if (requirePerfNoViolations) {
        if (!perfSummary) {
            validationErrors.push('Perf report is required to enforce threshold violations check.');
        } else if (perfSummary.violations > 0) {
            validationErrors.push(`Perf report has threshold violations: ${perfSummary.violations}.`);
        }
    }

    if (qualityGateFile) {
        const qualityReport = qualityGateFile.data;
        if (!isObjectRecord(qualityReport)) {
            validationErrors.push('Quality gate report must be an object.');
        } else {
            const status = qualityReport.status;
            if (!['SUCCESS', 'FAILED'].includes(status)) {
                validationErrors.push(`Quality gate report status is invalid: ${status}`);
            }
            const artifacts = isObjectRecord(qualityReport.artifacts)
                ? qualityReport.artifacts
                : null;
            if (!artifacts) {
                validationErrors.push('Quality gate report artifacts is required.');
            } else {
                const expectedSmokePath = normalizePathForCompare(smokeReportPath);
                const qualitySmokePath = normalizePathForCompare(artifacts.smokeReportFile);
                if (expectedSmokePath && qualitySmokePath && expectedSmokePath !== qualitySmokePath) {
                    validationErrors.push(
                        `Quality gate smoke report path mismatch: ${artifacts.smokeReportFile} vs ${smokeReportPath}.`,
                    );
                }

                const expectedPerfPath = normalizePathForCompare(perfReportPath);
                const qualityPerfPath = normalizePathForCompare(artifacts.perfReportFile);
                if (expectedPerfPath && qualityPerfPath && expectedPerfPath !== qualityPerfPath) {
                    validationErrors.push(
                        `Quality gate perf report path mismatch: ${artifacts.perfReportFile} vs ${perfReportPath}.`,
                    );
                }

                if (summaryMarkdownFile) {
                    const expectedSummaryPath = normalizePathForCompare(summaryMarkdownFile);
                    const qualitySummaryPath = normalizePathForCompare(artifacts.summaryMarkdownFile);
                    if (expectedSummaryPath && qualitySummaryPath && expectedSummaryPath !== qualitySummaryPath) {
                        validationErrors.push(
                            `Quality gate summary path mismatch: ${artifacts.summaryMarkdownFile} vs ${summaryMarkdownFile}.`,
                        );
                    }
                }

                if (summaryJsonFile) {
                    const expectedSummaryJsonPath = normalizePathForCompare(summaryJsonFile);
                    const qualitySummaryJsonPath = normalizePathForCompare(artifacts.summaryJsonFile);
                    if (
                        expectedSummaryJsonPath
                        && qualitySummaryJsonPath
                        && expectedSummaryJsonPath !== qualitySummaryJsonPath
                    ) {
                        validationErrors.push(
                            `Quality gate summary json path mismatch: ${artifacts.summaryJsonFile} vs ${summaryJsonFile}.`,
                        );
                    }
                }
            }
            qualityGateSummary = {
                status,
                runId: typeof qualityReport.runId === 'string' ? qualityReport.runId : null,
                failedSteps:
                    Array.isArray(qualityReport.summary?.failedStepIds)
                        ? qualityReport.summary.failedStepIds
                        : [],
                smokeReportFile:
                    typeof qualityReport.artifacts?.smokeReportFile === 'string'
                        ? qualityReport.artifacts.smokeReportFile
                        : null,
                perfReportFile:
                    typeof qualityReport.artifacts?.perfReportFile === 'string'
                        ? qualityReport.artifacts.perfReportFile
                        : null,
                summaryMarkdownFile:
                    typeof qualityReport.artifacts?.summaryMarkdownFile === 'string'
                        ? qualityReport.artifacts.summaryMarkdownFile
                        : null,
                summaryJsonFile:
                    typeof qualityReport.artifacts?.summaryJsonFile === 'string'
                        ? qualityReport.artifacts.summaryJsonFile
                        : null,
            };
        }
    }

    if (requireQualityGateSuccess) {
        if (!qualityGateSummary) {
            validationErrors.push('Quality gate report is required to enforce success status.');
        } else if (qualityGateSummary.status !== 'SUCCESS') {
            validationErrors.push(
                `Quality gate report status must be SUCCESS, got ${qualityGateSummary.status}.`,
            );
        }
    }

    if (requireReportsGeneratedAfter) {
        const baselineTimestamp = parseIsoTimestamp(requireReportsGeneratedAfter);
        if (baselineTimestamp === null) {
            validationErrors.push(
                `Invalid --require-reports-generated-after value: ${requireReportsGeneratedAfter}`,
            );
        } else {
            if (smokeSummary) {
                const smokeTimeValue = smokeSummary.finishedAt || smokeSummary.startedAt;
                if (!smokeTimeValue) {
                    validationErrors.push('Smoke report missing startedAt/finishedAt for freshness check.');
                } else {
                    const smokeTimestamp = parseIsoTimestamp(smokeTimeValue);
                    if (smokeTimestamp === null) {
                        validationErrors.push(
                            `Smoke report timestamp is invalid: ${smokeTimeValue}`,
                        );
                    } else if (smokeTimestamp < baselineTimestamp) {
                        validationErrors.push(
                            `Smoke report is stale: ${smokeTimeValue} < ${requireReportsGeneratedAfter}.`,
                        );
                    }
                }
            }

            if (perfSummary) {
                const perfTimestamp = parseIsoTimestamp(perfSummary.generatedAt);
                if (perfTimestamp === null) {
                    validationErrors.push(
                        `Perf report generatedAt is invalid: ${perfSummary.generatedAt}`,
                    );
                } else if (perfTimestamp < baselineTimestamp) {
                    validationErrors.push(
                        `Perf report is stale: ${perfSummary.generatedAt} < ${requireReportsGeneratedAfter}.`,
                    );
                }
            }
        }
    }

    if (maxReportAgeMs !== null) {
        const nowTimestamp = Date.now();

        if (smokeSummary) {
            const smokeTimeValue = smokeSummary.finishedAt || smokeSummary.startedAt;
            if (!smokeTimeValue) {
                validationErrors.push('Smoke report missing startedAt/finishedAt for age check.');
            } else {
                const smokeTimestamp = parseIsoTimestamp(smokeTimeValue);
                if (smokeTimestamp === null) {
                    validationErrors.push(`Smoke report timestamp is invalid: ${smokeTimeValue}`);
                } else if (nowTimestamp - smokeTimestamp > maxReportAgeMs) {
                    validationErrors.push(
                        `Smoke report age exceeded ${maxReportAgeMs}ms.`,
                    );
                }
            }
        }

        if (perfSummary) {
            const perfTimestamp = parseIsoTimestamp(perfSummary.generatedAt);
            if (perfTimestamp === null) {
                validationErrors.push(`Perf report generatedAt is invalid: ${perfSummary.generatedAt}`);
            } else if (nowTimestamp - perfTimestamp > maxReportAgeMs) {
                validationErrors.push(
                    `Perf report age exceeded ${maxReportAgeMs}ms.`,
                );
            }
        }
    }

    if (
        expectedSummaryJsonSchemaVersion
        && expectedSummaryJsonSchemaVersion !== SUMMARY_JSON_SCHEMA_VERSION
    ) {
        validationErrors.push(
            `Summary json schema version mismatch: expected ${expectedSummaryJsonSchemaVersion}, actual ${SUMMARY_JSON_SCHEMA_VERSION}.`,
        );
    }

    if (summaryMarkdownFile) {
        const markdown = toMarkdownSummary({
            smoke: smokeSummary,
            perf: perfSummary,
            qualityGate: qualityGateSummary,
            warnings,
            validationErrors,
        });
        const summaryAbsolutePath = toAbsolutePath(summaryMarkdownFile);
        await mkdir(path.dirname(summaryAbsolutePath), { recursive: true });
        await writeFile(summaryAbsolutePath, `${markdown}\n`, 'utf-8');
        console.log(`[workflow-report-validate] summary markdown written to ${summaryAbsolutePath}`);
    }

    if (summaryJsonFile) {
        const summary = toJsonSummary({
            smokeReportPath,
            perfReportPath,
            qualityGateReportPath,
            summaryMarkdownFile,
            summaryJsonFile,
            expectedSummaryJsonSchemaVersion,
            smoke: smokeSummary,
            perf: perfSummary,
            qualityGate: qualityGateSummary,
            warnings,
            validationErrors,
        });
        const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);
        await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
        await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
        console.log(`[workflow-report-validate] summary json written to ${summaryJsonAbsolutePath}`);
    }

    if (validationErrors.length > 0) {
        throw new Error(`validation failed: ${validationErrors.join(' | ')}`);
    }
}

main().catch((error) => {
    console.error(`[workflow-report-validate] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
