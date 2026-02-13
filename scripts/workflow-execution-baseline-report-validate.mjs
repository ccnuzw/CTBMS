#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const VALIDATION_SCHEMA_VERSION = '1.0';
const DEFAULT_REPORT_FILE = 'logs/workflow-execution-baseline-report.json';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-execution-baseline-validation.json';
const DEFAULT_EXPECTED_REPORT_SCHEMA_VERSION = '1.0';
const RATE_TOLERANCE = 1e-6;
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
const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const parseIsoToMs = (value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const toRate = (value, denominator) => {
    if (!Number.isFinite(value) || !Number.isFinite(denominator) || denominator <= 0) {
        return 0;
    }
    return Number((value / denominator).toFixed(6));
};

const readNonNegativeInteger = (container, key, label, validationErrors) => {
    const value = container?.[key];
    if (!Number.isInteger(value) || value < 0) {
        validationErrors.push(`${label} must be a non-negative integer.`);
        return null;
    }
    return value;
};

const readRate = (container, key, label, validationErrors) => {
    const value = container?.[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        validationErrors.push(`${label} must be a number between 0 and 1.`);
        return null;
    }
    return value;
};

const readNonNegativeNumber = (container, key, label, validationErrors) => {
    const value = container?.[key];
    if (!Number.isFinite(value) || value < 0) {
        validationErrors.push(`${label} must be a non-negative number.`);
        return null;
    }
    return value;
};

const validateThresholdRate = (thresholds, key, label, validationErrors) => {
    const value = thresholds?.[key];
    if (value === undefined || value === null) {
        return null;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        validationErrors.push(`${label} must be a number between 0 and 1 when provided.`);
        return null;
    }
    return value;
};

const validateThresholdDuration = (thresholds, key, label, validationErrors) => {
    const value = thresholds?.[key];
    if (value === undefined || value === null) {
        return null;
    }
    if (!Number.isFinite(value) || value <= 0) {
        validationErrors.push(`${label} must be a positive number when provided.`);
        return null;
    }
    return value;
};

const validateStringArray = (value, label, validationErrors) => {
    if (!Array.isArray(value)) {
        validationErrors.push(`${label} must be an array.`);
        return [];
    }

    const normalized = [];
    for (const item of value) {
        if (typeof item !== 'string' || item.trim().length === 0) {
            validationErrors.push(`${label} must contain non-empty strings.`);
            return [];
        }
        normalized.push(item.trim());
    }
    return normalized;
};

const validateReport = (report, options, validationErrors, warnings) => {
    if (!isRecord(report)) {
        validationErrors.push('Execution baseline report must be an object.');
        return {
            schemaVersion: null,
            runId: null,
            gatePassed: null,
            gateEvaluated: null,
            violationsCount: null,
            warningsCount: null,
            totalExecutions: null,
            completedExecutions: null,
            successRate: null,
            failedRate: null,
            canceledRate: null,
            timeoutRate: null,
            p95DurationMs: null,
            querySince: null,
            queryDays: null,
        };
    }

    if (typeof report.schemaVersion !== 'string' || report.schemaVersion.trim().length === 0) {
        validationErrors.push('Execution baseline report schemaVersion is required.');
    } else if (report.schemaVersion !== options.expectedReportSchemaVersion) {
        validationErrors.push(
            `Execution baseline report schema version mismatch: expected ${options.expectedReportSchemaVersion}, actual ${report.schemaVersion}.`,
        );
    }

    if (typeof report.runId !== 'string' || report.runId.trim().length === 0) {
        validationErrors.push('Execution baseline report runId is required.');
    }

    const startedAtMs = parseIsoToMs(report.startedAt);
    const finishedAtMs = parseIsoToMs(report.finishedAt);
    if (startedAtMs === null) {
        validationErrors.push('Execution baseline report startedAt must be a valid ISO datetime string.');
    }
    if (finishedAtMs === null) {
        validationErrors.push('Execution baseline report finishedAt must be a valid ISO datetime string.');
    }
    if (startedAtMs !== null && finishedAtMs !== null && finishedAtMs < startedAtMs) {
        validationErrors.push('Execution baseline report finishedAt must be greater than or equal to startedAt.');
    }
    readNonNegativeNumber(report, 'durationMs', 'Execution baseline report durationMs', validationErrors);

    const query = isRecord(report.query) ? report.query : null;
    if (!query) {
        validationErrors.push('Execution baseline report query must be an object.');
    }
    const querySinceMs = parseIsoToMs(query?.since);
    if (querySinceMs === null) {
        validationErrors.push('Execution baseline report query.since must be a valid ISO datetime string.');
    }
    const queryDays = query?.days;
    if (!Number.isInteger(queryDays) || queryDays <= 0) {
        validationErrors.push('Execution baseline report query.days must be a positive integer.');
    }
    const queryBatchSize = query?.batchSize;
    if (!Number.isInteger(queryBatchSize) || queryBatchSize <= 0) {
        validationErrors.push('Execution baseline report query.batchSize must be a positive integer.');
    }

    const totals = isRecord(report.totals) ? report.totals : null;
    if (!totals) {
        validationErrors.push('Execution baseline report totals must be an object.');
    }

    const totalExecutions = readNonNegativeInteger(totals, 'executions', 'Execution baseline report totals.executions', validationErrors);
    const completedExecutions = readNonNegativeInteger(totals, 'completed', 'Execution baseline report totals.completed', validationErrors);
    const runningExecutions = readNonNegativeInteger(totals, 'running', 'Execution baseline report totals.running', validationErrors);
    const pendingExecutions = readNonNegativeInteger(totals, 'pending', 'Execution baseline report totals.pending', validationErrors);
    const successExecutions = readNonNegativeInteger(totals, 'success', 'Execution baseline report totals.success', validationErrors);
    const failedExecutions = readNonNegativeInteger(totals, 'failed', 'Execution baseline report totals.failed', validationErrors);
    const canceledExecutions = readNonNegativeInteger(totals, 'canceled', 'Execution baseline report totals.canceled', validationErrors);
    const timeoutFailures = readNonNegativeInteger(totals, 'timeoutFailures', 'Execution baseline report totals.timeoutFailures', validationErrors);

    if (
        completedExecutions !== null
        && successExecutions !== null
        && failedExecutions !== null
        && canceledExecutions !== null
    ) {
        const expectedCompleted = successExecutions + failedExecutions + canceledExecutions;
        if (completedExecutions !== expectedCompleted) {
            validationErrors.push(
                `Execution baseline report totals.completed mismatch: expected ${expectedCompleted}, actual ${completedExecutions}.`,
            );
        }
    }

    if (
        totalExecutions !== null
        && completedExecutions !== null
        && runningExecutions !== null
        && pendingExecutions !== null
    ) {
        const expectedExecutions = completedExecutions + runningExecutions + pendingExecutions;
        if (totalExecutions !== expectedExecutions) {
            validationErrors.push(
                `Execution baseline report totals.executions mismatch: expected ${expectedExecutions}, actual ${totalExecutions}.`,
            );
        }
    }

    if (timeoutFailures !== null && failedExecutions !== null && timeoutFailures > failedExecutions) {
        validationErrors.push(
            `Execution baseline report totals.timeoutFailures cannot exceed totals.failed: timeoutFailures=${timeoutFailures}, failed=${failedExecutions}.`,
        );
    }

    const rates = isRecord(report.rates) ? report.rates : null;
    if (!rates) {
        validationErrors.push('Execution baseline report rates must be an object.');
    }

    const successRate = readRate(rates, 'successRate', 'Execution baseline report rates.successRate', validationErrors);
    const failedRate = readRate(rates, 'failedRate', 'Execution baseline report rates.failedRate', validationErrors);
    const canceledRate = readRate(rates, 'canceledRate', 'Execution baseline report rates.canceledRate', validationErrors);
    const timeoutRate = readRate(rates, 'timeoutRate', 'Execution baseline report rates.timeoutRate', validationErrors);
    const completedSuccessRate = readRate(
        rates,
        'completedSuccessRate',
        'Execution baseline report rates.completedSuccessRate',
        validationErrors,
    );

    if (totalExecutions !== null && successExecutions !== null && successRate !== null) {
        const expected = toRate(successExecutions, totalExecutions);
        if (Math.abs(successRate - expected) > RATE_TOLERANCE) {
            validationErrors.push(
                `Execution baseline report rates.successRate mismatch: expected ${expected}, actual ${successRate}.`,
            );
        }
    }
    if (totalExecutions !== null && failedExecutions !== null && failedRate !== null) {
        const expected = toRate(failedExecutions, totalExecutions);
        if (Math.abs(failedRate - expected) > RATE_TOLERANCE) {
            validationErrors.push(
                `Execution baseline report rates.failedRate mismatch: expected ${expected}, actual ${failedRate}.`,
            );
        }
    }
    if (totalExecutions !== null && canceledExecutions !== null && canceledRate !== null) {
        const expected = toRate(canceledExecutions, totalExecutions);
        if (Math.abs(canceledRate - expected) > RATE_TOLERANCE) {
            validationErrors.push(
                `Execution baseline report rates.canceledRate mismatch: expected ${expected}, actual ${canceledRate}.`,
            );
        }
    }
    if (totalExecutions !== null && timeoutFailures !== null && timeoutRate !== null) {
        const expected = toRate(timeoutFailures, totalExecutions);
        if (Math.abs(timeoutRate - expected) > RATE_TOLERANCE) {
            validationErrors.push(
                `Execution baseline report rates.timeoutRate mismatch: expected ${expected}, actual ${timeoutRate}.`,
            );
        }
    }
    if (completedExecutions !== null && successExecutions !== null && completedSuccessRate !== null) {
        const expected = toRate(successExecutions, completedExecutions);
        if (Math.abs(completedSuccessRate - expected) > RATE_TOLERANCE) {
            validationErrors.push(
                `Execution baseline report rates.completedSuccessRate mismatch: expected ${expected}, actual ${completedSuccessRate}.`,
            );
        }
    }

    const latencyMs = isRecord(report.latencyMs) ? report.latencyMs : null;
    if (!latencyMs) {
        validationErrors.push('Execution baseline report latencyMs must be an object.');
    }

    const latencySampleCount = readNonNegativeInteger(latencyMs, 'sampleCount', 'Execution baseline report latencyMs.sampleCount', validationErrors);
    const latencyP50 = readNonNegativeNumber(latencyMs, 'p50', 'Execution baseline report latencyMs.p50', validationErrors);
    const latencyP90 = readNonNegativeNumber(latencyMs, 'p90', 'Execution baseline report latencyMs.p90', validationErrors);
    const latencyP95 = readNonNegativeNumber(latencyMs, 'p95', 'Execution baseline report latencyMs.p95', validationErrors);
    const latencyP99 = readNonNegativeNumber(latencyMs, 'p99', 'Execution baseline report latencyMs.p99', validationErrors);

    if (
        latencyP50 !== null
        && latencyP90 !== null
        && latencyP95 !== null
        && latencyP99 !== null
        && (latencyP50 > latencyP90 || latencyP90 > latencyP95 || latencyP95 > latencyP99)
    ) {
        validationErrors.push('Execution baseline report latencyMs percentile order is invalid: p50 <= p90 <= p95 <= p99 is required.');
    }

    if (
        latencySampleCount === 0
        && (latencyP50 !== 0 || latencyP90 !== 0 || latencyP95 !== 0 || latencyP99 !== 0)
    ) {
        warnings.push('Execution baseline report latencyMs sampleCount=0 but percentile values are non-zero.');
    }

    const gate = isRecord(report.gate) ? report.gate : null;
    if (!gate) {
        validationErrors.push('Execution baseline report gate must be an object.');
    }

    const gatePassed = typeof gate?.passed === 'boolean' ? gate.passed : null;
    if (gatePassed === null) {
        validationErrors.push('Execution baseline report gate.passed must be a boolean.');
    }
    const gateEvaluated = typeof gate?.evaluated === 'boolean' ? gate.evaluated : null;
    if (gateEvaluated === null) {
        validationErrors.push('Execution baseline report gate.evaluated must be a boolean.');
    }

    const thresholds = isRecord(gate?.thresholds) ? gate.thresholds : null;
    if (!thresholds) {
        validationErrors.push('Execution baseline report gate.thresholds must be an object.');
    }

    validateThresholdRate(thresholds, 'minSuccessRate', 'Execution baseline report gate.thresholds.minSuccessRate', validationErrors);
    validateThresholdRate(thresholds, 'maxFailureRate', 'Execution baseline report gate.thresholds.maxFailureRate', validationErrors);
    validateThresholdRate(thresholds, 'maxCanceledRate', 'Execution baseline report gate.thresholds.maxCanceledRate', validationErrors);
    validateThresholdRate(thresholds, 'maxTimeoutRate', 'Execution baseline report gate.thresholds.maxTimeoutRate', validationErrors);
    validateThresholdDuration(thresholds, 'maxP95DurationMs', 'Execution baseline report gate.thresholds.maxP95DurationMs', validationErrors);

    const violations = validateStringArray(gate?.violations, 'Execution baseline report gate.violations', validationErrors);
    const gateWarnings = validateStringArray(gate?.warnings, 'Execution baseline report gate.warnings', validationErrors);

    if (gatePassed === true && violations.length > 0) {
        validationErrors.push('Execution baseline report gate.passed cannot be true when gate.violations is non-empty.');
    }
    if (gatePassed === false && violations.length === 0) {
        warnings.push('Execution baseline report gate.passed=false but gate.violations is empty.');
    }

    if (options.requireGatePass && gatePassed !== true) {
        validationErrors.push('Execution baseline report gate.passed must be true when --require-gate-pass is enabled.');
    }
    if (options.requireGateEvaluated && gateEvaluated !== true) {
        validationErrors.push('Execution baseline report gate.evaluated must be true when --require-gate-evaluated is enabled.');
    }
    if (options.requireNoWarnings && gateWarnings.length > 0) {
        validationErrors.push(
            `Execution baseline report gate.warnings must be empty when --require-no-warnings is enabled (actual=${gateWarnings.length}).`,
        );
    }

    return {
        schemaVersion: typeof report.schemaVersion === 'string' ? report.schemaVersion : null,
        runId: typeof report.runId === 'string' ? report.runId : null,
        gatePassed,
        gateEvaluated,
        violationsCount: violations.length,
        warningsCount: gateWarnings.length,
        totalExecutions,
        completedExecutions,
        successRate,
        failedRate,
        canceledRate,
        timeoutRate,
        p95DurationMs: latencyP95,
        querySince: typeof query?.since === 'string' ? query.since : null,
        queryDays: Number.isInteger(query?.days) ? query.days : null,
    };
};

async function main() {
    const reportFile = readArgValue('--report-file', DEFAULT_REPORT_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const expectedReportSchemaVersion = readArgValue('--expected-report-schema-version', DEFAULT_EXPECTED_REPORT_SCHEMA_VERSION);
    const requireGatePass = hasFlag('--require-gate-pass');
    const requireGateEvaluated = hasFlag('--require-gate-evaluated');
    const requireNoWarnings = hasFlag('--require-no-warnings');

    const reportFileAbsolute = toAbsolutePath(reportFile);
    const summaryJsonFileAbsolute = toAbsolutePath(summaryJsonFile);

    const warnings = [];
    const validationErrors = [];

    let report = null;
    try {
        const reportContent = await readFile(reportFileAbsolute, 'utf-8');
        report = JSON.parse(reportContent);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        validationErrors.push(`Failed to read execution baseline report file (${reportFileAbsolute}): ${message}`);
    }

    const reportSummary = validateReport(
        report,
        {
            expectedReportSchemaVersion,
            requireGatePass,
            requireGateEvaluated,
            requireNoWarnings,
        },
        validationErrors,
        warnings,
    );

    const generatedAt = new Date().toISOString();
    const summary = {
        schemaVersion: VALIDATION_SCHEMA_VERSION,
        generatedAt,
        status: validationErrors.length > 0 ? 'FAILED' : 'SUCCESS',
        inputs: {
            reportFile,
            summaryJsonFile,
            expectedReportSchemaVersion,
            requireGatePass,
            requireGateEvaluated,
            requireNoWarnings,
        },
        report: reportSummary,
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        warnings,
        validationErrors,
    };

    await mkdir(path.dirname(summaryJsonFileAbsolute), { recursive: true });
    await writeFile(summaryJsonFileAbsolute, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-execution-baseline-report-validate] status=${summary.status} errors=${validationErrors.length} warnings=${warnings.length} summary=${summaryJsonFileAbsolute}\n`,
    );

    if (validationErrors.length > 0) {
        process.stderr.write(
            `[workflow-execution-baseline-report-validate] validation failed: ${validationErrors.join(' | ')}\n`,
        );
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-execution-baseline-report-validate] fatal: ${message}\n`);
    process.exitCode = 1;
});
