#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SCHEMA_VERSION = '1.0';
const DEFAULT_MODE = 'ensure';
const DEFAULT_CURRENT_REPORT = 'logs/workflow-execution-baseline-report.json';
const DEFAULT_REFERENCE_REPORT = 'logs/workflow-execution-baseline-reference.json';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-execution-baseline-reference-operation.json';
const args = process.argv.slice(2);

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);

const readJsonFile = async (targetPath) => {
    try {
        const content = await readFile(targetPath, 'utf-8');
        return {
            exists: true,
            data: JSON.parse(content),
            error: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ENOENT/i.test(message)) {
            return {
                exists: false,
                data: null,
                error: null,
            };
        }
        return {
            exists: false,
            data: null,
            error: message,
        };
    }
};

const validateMode = (mode) => {
    if (mode === 'ensure' || mode === 'promote') {
        return mode;
    }
    throw new Error(`invalid mode: ${mode}. supported modes: ensure, promote`);
};

const extractReportMeta = (report) => ({
    runId: typeof report?.runId === 'string' ? report.runId : null,
    finishedAt: typeof report?.finishedAt === 'string' ? report.finishedAt : null,
    successRate: Number.isFinite(report?.rates?.successRate) ? report.rates.successRate : null,
    failedRate: Number.isFinite(report?.rates?.failedRate) ? report.rates.failedRate : null,
    timeoutRate: Number.isFinite(report?.rates?.timeoutRate) ? report.rates.timeoutRate : null,
    p95DurationMs: Number.isFinite(report?.latencyMs?.p95) ? report.latencyMs.p95 : null,
    executions: Number.isInteger(report?.totals?.executions) ? report.totals.executions : null,
});

async function main() {
    const mode = validateMode(readArgValue('--mode', DEFAULT_MODE));
    const currentReportFile = readArgValue('--current-report', DEFAULT_CURRENT_REPORT);
    const referenceReportFile = readArgValue('--reference-report', DEFAULT_REFERENCE_REPORT);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);

    const currentReportAbsolutePath = toAbsolutePath(currentReportFile);
    const referenceReportAbsolutePath = toAbsolutePath(referenceReportFile);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);

    const warnings = [];
    const validationErrors = [];

    const currentFile = await readJsonFile(currentReportAbsolutePath);
    const referenceFile = await readJsonFile(referenceReportAbsolutePath);

    if (currentFile.error) {
        validationErrors.push(`failed to read current report: ${currentFile.error}`);
    }
    if (referenceFile.error) {
        validationErrors.push(`failed to read reference report: ${referenceFile.error}`);
    }

    const currentMeta = extractReportMeta(currentFile.data);
    const referenceMetaBefore = extractReportMeta(referenceFile.data);
    let action = 'NONE';

    if (!currentFile.exists && !currentFile.error) {
        validationErrors.push(`current report missing: ${currentReportAbsolutePath}`);
    }

    if (validationErrors.length === 0) {
        if (mode === 'ensure') {
            if (referenceFile.exists) {
                action = 'PRESERVED';
            } else {
                await mkdir(path.dirname(referenceReportAbsolutePath), { recursive: true });
                await copyFile(currentReportAbsolutePath, referenceReportAbsolutePath);
                action = 'SEEDED_FROM_CURRENT';
            }
        }

        if (mode === 'promote') {
            await mkdir(path.dirname(referenceReportAbsolutePath), { recursive: true });
            await copyFile(currentReportAbsolutePath, referenceReportAbsolutePath);
            action = 'PROMOTED_FROM_CURRENT';
        }
    }

    const referenceFileAfter = await readJsonFile(referenceReportAbsolutePath);
    const referenceMetaAfter = extractReportMeta(referenceFileAfter.data);
    if (referenceFileAfter.error) {
        validationErrors.push(`failed to read reference report after ${mode}: ${referenceFileAfter.error}`);
    }

    const status = validationErrors.length > 0 ? 'FAILED' : 'SUCCESS';
    const summary = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status,
        mode,
        action,
        inputs: {
            mode,
            currentReportFile,
            referenceReportFile,
            summaryJsonFile,
        },
        current: {
            exists: currentFile.exists,
            ...currentMeta,
        },
        referenceBefore: {
            exists: referenceFile.exists,
            ...referenceMetaBefore,
        },
        referenceAfter: {
            exists: referenceFileAfter.exists,
            ...referenceMetaAfter,
        },
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        warnings,
        validationErrors,
    };

    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-execution-baseline-reference] mode=${mode} status=${status} action=${action} errors=${validationErrors.length} summary=${summaryJsonAbsolutePath}\n`,
    );

    if (warnings.length > 0) {
        process.stdout.write(`[workflow-execution-baseline-reference] warnings: ${warnings.join(' | ')}\n`);
    }

    if (status === 'FAILED') {
        process.stderr.write(`[workflow-execution-baseline-reference] failed: ${validationErrors.join(' | ')}\n`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-execution-baseline-reference] fatal: ${message}\n`);
    process.exitCode = 1;
});
