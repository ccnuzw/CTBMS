#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TREND_SCHEMA_VERSION = '1.0';
const DEFAULT_CURRENT_REPORT = 'logs/workflow-execution-baseline-report.json';
const DEFAULT_REFERENCE_REPORT = 'logs/workflow-execution-baseline-reference.json';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-execution-baseline-trend.json';
const DEFAULT_THRESHOLDS_FILE = 'config/workflow-execution-baseline-thresholds.json';
const DEFAULT_TREND_THRESHOLDS = Object.freeze({
    maxSuccessRateDrop: 0.05,
    maxFailedRateIncrease: 0.05,
    maxTimeoutRateIncrease: 0.02,
    maxP95DurationIncreaseMs: 10000,
});
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
const hasArgValue = (name) => args.some((item) => item.startsWith(`${name}=`) || item === name);
const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toFixedNumber = (value, digits = 6) => Number(Number(value).toFixed(digits));

const parseNonNegativeNumberArg = (name) => {
    const raw = readArgValue(name, '').trim();
    if (!raw) {
        return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative number.`);
    }
    return parsed;
};

const readConfigThreshold = (container, key, label, validationErrors) => {
    if (!isRecord(container) || container[key] === undefined || container[key] === null) {
        return null;
    }
    const value = container[key];
    if (!Number.isFinite(value) || value < 0) {
        validationErrors.push(`${label} must be a non-negative number.`);
        return null;
    }
    return value;
};

const readJsonFile = async (targetPath, { allowMissing = false } = {}) => {
    try {
        const content = await readFile(targetPath, 'utf-8');
        return {
            exists: true,
            data: JSON.parse(content),
            error: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (allowMissing && /ENOENT/i.test(message)) {
            return {
                exists: false,
                data: null,
                error: null,
            };
        }
        return {
            exists: false,
            data: null,
            error: `failed to read file ${targetPath}: ${message}`,
        };
    }
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

const readNonNegativeInteger = (container, key, label, validationErrors) => {
    const value = container?.[key];
    if (!Number.isInteger(value) || value < 0) {
        validationErrors.push(`${label} must be a non-negative integer.`);
        return null;
    }
    return value;
};

const validateBaselineReport = (report, reportName, validationErrors) => {
    if (!isRecord(report)) {
        validationErrors.push(`${reportName} report must be an object.`);
        return {
            runId: null,
            finishedAt: null,
            successRate: null,
            failedRate: null,
            timeoutRate: null,
            p95DurationMs: null,
            executions: null,
            gatePassed: null,
        };
    }

    if (typeof report.schemaVersion !== 'string' || report.schemaVersion.trim().length === 0) {
        validationErrors.push(`${reportName} report schemaVersion is required.`);
    }
    if (typeof report.runId !== 'string' || report.runId.trim().length === 0) {
        validationErrors.push(`${reportName} report runId is required.`);
    }

    const rates = isRecord(report.rates) ? report.rates : null;
    if (!rates) {
        validationErrors.push(`${reportName} report rates must be an object.`);
    }

    const latencyMs = isRecord(report.latencyMs) ? report.latencyMs : null;
    if (!latencyMs) {
        validationErrors.push(`${reportName} report latencyMs must be an object.`);
    }

    const totals = isRecord(report.totals) ? report.totals : null;
    if (!totals) {
        validationErrors.push(`${reportName} report totals must be an object.`);
    }

    const gate = isRecord(report.gate) ? report.gate : null;
    if (!gate) {
        validationErrors.push(`${reportName} report gate must be an object.`);
    }

    const successRate = readRate(rates, 'successRate', `${reportName} report rates.successRate`, validationErrors);
    const failedRate = readRate(rates, 'failedRate', `${reportName} report rates.failedRate`, validationErrors);
    const timeoutRate = readRate(rates, 'timeoutRate', `${reportName} report rates.timeoutRate`, validationErrors);
    const p95DurationMs = readNonNegativeNumber(latencyMs, 'p95', `${reportName} report latencyMs.p95`, validationErrors);
    const executions = readNonNegativeInteger(totals, 'executions', `${reportName} report totals.executions`, validationErrors);

    if (gate?.passed !== undefined && typeof gate.passed !== 'boolean') {
        validationErrors.push(`${reportName} report gate.passed must be a boolean when provided.`);
    }

    return {
        runId: typeof report.runId === 'string' ? report.runId : null,
        finishedAt: typeof report.finishedAt === 'string' ? report.finishedAt : null,
        successRate,
        failedRate,
        timeoutRate,
        p95DurationMs,
        executions,
        gatePassed: typeof gate?.passed === 'boolean' ? gate.passed : null,
    };
};

async function main() {
    const currentReportFile = readArgValue('--current-report', DEFAULT_CURRENT_REPORT);
    const referenceReportFile = readArgValue('--reference-report', DEFAULT_REFERENCE_REPORT);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const thresholdsFile = readArgValue('--thresholds-file', DEFAULT_THRESHOLDS_FILE);

    const allowMissingReference = hasFlag('--allow-missing-reference');
    const requireReference = hasFlag('--require-reference');

    const maxSuccessRateDropArg = parseNonNegativeNumberArg('--max-success-rate-drop');
    const maxFailedRateIncreaseArg = parseNonNegativeNumberArg('--max-failed-rate-increase');
    const maxTimeoutRateIncreaseArg = parseNonNegativeNumberArg('--max-timeout-rate-increase');
    const maxP95DurationIncreaseMsArg = parseNonNegativeNumberArg('--max-p95-duration-increase-ms');

    const currentReportAbsolutePath = toAbsolutePath(currentReportFile);
    const referenceReportAbsolutePath = toAbsolutePath(referenceReportFile);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);
    const thresholdsAbsolutePath = toAbsolutePath(thresholdsFile);

    const warnings = [];
    const validationErrors = [];
    const regressions = [];

    const thresholdsFileData = await readJsonFile(thresholdsAbsolutePath, {
        allowMissing: true,
    });
    if (thresholdsFileData.error) {
        validationErrors.push(thresholdsFileData.error);
    }
    if (!thresholdsFileData.exists) {
        if (hasArgValue('--thresholds-file')) {
            validationErrors.push(`thresholds file missing: ${thresholdsAbsolutePath}`);
        } else {
            warnings.push(
                `thresholds file missing, using default trend thresholds: ${thresholdsAbsolutePath}`,
            );
        }
    }

    let thresholdsContainer = null;
    if (thresholdsFileData.exists) {
        if (!isRecord(thresholdsFileData.data)) {
            validationErrors.push('thresholds file content must be an object.');
        } else {
            const trendContainer = thresholdsFileData.data.trend;
            if (trendContainer !== undefined && trendContainer !== null && !isRecord(trendContainer)) {
                validationErrors.push('thresholds file trend must be an object when provided.');
            } else if (isRecord(trendContainer)) {
                thresholdsContainer = trendContainer;
            } else {
                thresholdsContainer = thresholdsFileData.data;
            }
        }
    }

    const maxSuccessRateDropFromFile = readConfigThreshold(
        thresholdsContainer,
        'maxSuccessRateDrop',
        'thresholds maxSuccessRateDrop',
        validationErrors,
    );
    const maxFailedRateIncreaseFromFile = readConfigThreshold(
        thresholdsContainer,
        'maxFailedRateIncrease',
        'thresholds maxFailedRateIncrease',
        validationErrors,
    );
    const maxTimeoutRateIncreaseFromFile = readConfigThreshold(
        thresholdsContainer,
        'maxTimeoutRateIncrease',
        'thresholds maxTimeoutRateIncrease',
        validationErrors,
    );
    const maxP95DurationIncreaseMsFromFile = readConfigThreshold(
        thresholdsContainer,
        'maxP95DurationIncreaseMs',
        'thresholds maxP95DurationIncreaseMs',
        validationErrors,
    );

    const maxSuccessRateDrop = maxSuccessRateDropArg
        ?? maxSuccessRateDropFromFile
        ?? DEFAULT_TREND_THRESHOLDS.maxSuccessRateDrop;
    const maxFailedRateIncrease = maxFailedRateIncreaseArg
        ?? maxFailedRateIncreaseFromFile
        ?? DEFAULT_TREND_THRESHOLDS.maxFailedRateIncrease;
    const maxTimeoutRateIncrease = maxTimeoutRateIncreaseArg
        ?? maxTimeoutRateIncreaseFromFile
        ?? DEFAULT_TREND_THRESHOLDS.maxTimeoutRateIncrease;
    const maxP95DurationIncreaseMs = maxP95DurationIncreaseMsArg
        ?? maxP95DurationIncreaseMsFromFile
        ?? DEFAULT_TREND_THRESHOLDS.maxP95DurationIncreaseMs;

    const resolveThresholdSource = (argValue, fileValue) => {
        if (argValue !== null) {
            return 'CLI_ARG';
        }
        if (fileValue !== null) {
            return 'THRESHOLDS_FILE';
        }
        return 'DEFAULT';
    };

    const currentReportFileData = await readJsonFile(currentReportAbsolutePath);
    if (currentReportFileData.error) {
        validationErrors.push(currentReportFileData.error);
    }
    const currentSummary = validateBaselineReport(
        currentReportFileData.data,
        'current',
        validationErrors,
    );

    const referenceReportFileData = await readJsonFile(referenceReportAbsolutePath, {
        allowMissing: allowMissingReference && !requireReference,
    });
    if (referenceReportFileData.error) {
        validationErrors.push(referenceReportFileData.error);
    }

    let referenceSummary = {
        runId: null,
        finishedAt: null,
        successRate: null,
        failedRate: null,
        timeoutRate: null,
        p95DurationMs: null,
        executions: null,
        gatePassed: null,
    };

    if (!referenceReportFileData.exists) {
        if (requireReference) {
            validationErrors.push(`reference report is required but missing: ${referenceReportAbsolutePath}`);
        } else {
            if (!referenceReportFileData.error) {
                warnings.push(`reference report missing: ${referenceReportAbsolutePath}`);
            }
        }
    } else {
        referenceSummary = validateBaselineReport(
            referenceReportFileData.data,
            'reference',
            validationErrors,
        );
    }

    const hasReference = referenceReportFileData.exists;

    const delta = {
        successRate: null,
        failedRate: null,
        timeoutRate: null,
        p95DurationMs: null,
        executions: null,
    };

    if (hasReference) {
        if (currentSummary.successRate !== null && referenceSummary.successRate !== null) {
            delta.successRate = toFixedNumber(currentSummary.successRate - referenceSummary.successRate, 6);
        }
        if (currentSummary.failedRate !== null && referenceSummary.failedRate !== null) {
            delta.failedRate = toFixedNumber(currentSummary.failedRate - referenceSummary.failedRate, 6);
        }
        if (currentSummary.timeoutRate !== null && referenceSummary.timeoutRate !== null) {
            delta.timeoutRate = toFixedNumber(currentSummary.timeoutRate - referenceSummary.timeoutRate, 6);
        }
        if (currentSummary.p95DurationMs !== null && referenceSummary.p95DurationMs !== null) {
            delta.p95DurationMs = toFixedNumber(currentSummary.p95DurationMs - referenceSummary.p95DurationMs, 3);
        }
        if (currentSummary.executions !== null && referenceSummary.executions !== null) {
            delta.executions = currentSummary.executions - referenceSummary.executions;
        }

        if (maxSuccessRateDrop !== null && delta.successRate !== null && delta.successRate < -maxSuccessRateDrop) {
            regressions.push(
                `successRate drop exceeds threshold: delta=${delta.successRate}, limit=-${maxSuccessRateDrop}`,
            );
        }
        if (maxFailedRateIncrease !== null && delta.failedRate !== null && delta.failedRate > maxFailedRateIncrease) {
            regressions.push(
                `failedRate increase exceeds threshold: delta=${delta.failedRate}, limit=${maxFailedRateIncrease}`,
            );
        }
        if (maxTimeoutRateIncrease !== null && delta.timeoutRate !== null && delta.timeoutRate > maxTimeoutRateIncrease) {
            regressions.push(
                `timeoutRate increase exceeds threshold: delta=${delta.timeoutRate}, limit=${maxTimeoutRateIncrease}`,
            );
        }
        if (
            maxP95DurationIncreaseMs !== null
            && delta.p95DurationMs !== null
            && delta.p95DurationMs > maxP95DurationIncreaseMs
        ) {
            regressions.push(
                `p95 duration increase exceeds threshold: deltaMs=${delta.p95DurationMs}, limitMs=${maxP95DurationIncreaseMs}`,
            );
        }
    }

    let status = 'SUCCESS';
    if (!hasReference) {
        status = requireReference ? 'FAILED' : 'SKIPPED';
    }
    if (validationErrors.length > 0) {
        status = 'FAILED';
    }
    if (regressions.length > 0) {
        status = 'FAILED';
    }

    const summary = {
        schemaVersion: TREND_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status,
        inputs: {
            currentReportFile,
            referenceReportFile,
            summaryJsonFile,
            thresholdsFile,
            thresholdsFileExists: thresholdsFileData.exists,
            allowMissingReference,
            requireReference,
            maxSuccessRateDrop,
            maxFailedRateIncrease,
            maxTimeoutRateIncrease,
            maxP95DurationIncreaseMs,
            thresholdSources: {
                maxSuccessRateDrop: resolveThresholdSource(
                    maxSuccessRateDropArg,
                    maxSuccessRateDropFromFile,
                ),
                maxFailedRateIncrease: resolveThresholdSource(
                    maxFailedRateIncreaseArg,
                    maxFailedRateIncreaseFromFile,
                ),
                maxTimeoutRateIncrease: resolveThresholdSource(
                    maxTimeoutRateIncreaseArg,
                    maxTimeoutRateIncreaseFromFile,
                ),
                maxP95DurationIncreaseMs: resolveThresholdSource(
                    maxP95DurationIncreaseMsArg,
                    maxP95DurationIncreaseMsFromFile,
                ),
            },
        },
        current: {
            exists: true,
            ...currentSummary,
        },
        reference: {
            exists: hasReference,
            ...referenceSummary,
        },
        delta,
        regressionCount: regressions.length,
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        regressions,
        warnings,
        validationErrors,
    };

    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-execution-baseline-trend] status=${status} regressions=${regressions.length} errors=${validationErrors.length} summary=${summaryJsonAbsolutePath}\n`,
    );

    if (warnings.length > 0) {
        process.stdout.write(`[workflow-execution-baseline-trend] warnings: ${warnings.join(' | ')}\n`);
    }

    if (status === 'FAILED') {
        const reasons = [...validationErrors, ...regressions];
        process.stderr.write(`[workflow-execution-baseline-trend] failed: ${reasons.join(' | ')}\n`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-execution-baseline-trend] fatal: ${message}\n`);
    process.exitCode = 1;
});
