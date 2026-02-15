#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SCHEMA_VERSION = '1.0';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-execution-baseline-reference-ci-state.json';
const args = process.argv.slice(2);

const readArgValue = (name, fallback = null) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value.length > 0 ? value : fallback;
};

const parseBooleanArg = (raw) => {
    if (typeof raw !== 'string') {
        return null;
    }
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    return null;
};

const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);
const toOptionalString = (value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null);

const isFailureOutcome = (value) => value === 'failure';
const isSuccessOutcome = (value) => value === 'success';

async function main() {
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);

    const cacheRestoreOutcome = toOptionalString(readArgValue('--cache-restore-outcome', null));
    const cacheSaveOutcome = toOptionalString(readArgValue('--cache-save-outcome', null));
    const cacheHitRaw = readArgValue('--cache-hit', null);
    const cacheHit = parseBooleanArg(cacheHitRaw);

    const executionBaselineGateOutcome = toOptionalString(
        readArgValue('--execution-baseline-gate-outcome', null),
    );
    const executionBaselineReportValidateOutcome = toOptionalString(
        readArgValue('--execution-baseline-report-validate-outcome', null),
    );
    const referenceEnsureOutcome = toOptionalString(readArgValue('--reference-ensure-outcome', null));
    const trendOutcome = toOptionalString(readArgValue('--trend-outcome', null));
    const referencePromoteOutcome = toOptionalString(readArgValue('--reference-promote-outcome', null));

    const workflowRunId = toOptionalString(readArgValue('--workflow-run-id', null));
    const workflowRunAttempt = toOptionalString(readArgValue('--workflow-run-attempt', null));
    const repository = toOptionalString(readArgValue('--repository', null));
    const refName = toOptionalString(readArgValue('--ref-name', null));
    const sha = toOptionalString(readArgValue('--sha', null));

    const warnings = [];
    const validationErrors = [];

    if (!executionBaselineGateOutcome) {
        validationErrors.push('execution baseline gate outcome is required.');
    }
    if (!executionBaselineReportValidateOutcome) {
        validationErrors.push('execution baseline report validate outcome is required.');
    }
    if (!referenceEnsureOutcome) {
        validationErrors.push('reference ensure outcome is required.');
    }
    if (!trendOutcome) {
        validationErrors.push('trend outcome is required.');
    }
    if (!referencePromoteOutcome) {
        validationErrors.push('reference promote outcome is required.');
    }

    if (cacheHit === false) {
        warnings.push('reference baseline cache miss: fallback to ensure seeding or existing workspace file.');
    }
    if (referencePromoteOutcome === 'skipped') {
        warnings.push('reference baseline promote skipped: upstream gate or trend condition not met.');
    }
    if (cacheSaveOutcome === 'skipped') {
        warnings.push('reference baseline cache save skipped: reference file may not be persisted for next run.');
    }

    let status = 'SUCCESS';
    if (
        isFailureOutcome(executionBaselineGateOutcome)
        || isFailureOutcome(executionBaselineReportValidateOutcome)
        || isFailureOutcome(referenceEnsureOutcome)
        || isFailureOutcome(trendOutcome)
        || isFailureOutcome(referencePromoteOutcome)
    ) {
        status = 'FAILED';
    } else if (
        !(
            isSuccessOutcome(executionBaselineGateOutcome)
            && isSuccessOutcome(executionBaselineReportValidateOutcome)
            && isSuccessOutcome(referenceEnsureOutcome)
            && isSuccessOutcome(trendOutcome)
            && (isSuccessOutcome(referencePromoteOutcome) || referencePromoteOutcome === 'skipped')
        )
    ) {
        status = 'PARTIAL';
    }

    if (status === 'PARTIAL') {
        warnings.push('reference baseline CI state is partial: check skipped/cancelled outcomes before promotion.');
    }
    if (validationErrors.length > 0) {
        status = 'FAILED';
    }

    const summary = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status,
        ci: {
            workflowRunId,
            workflowRunAttempt,
            repository,
            refName,
            sha,
        },
        referenceLifecycle: {
            cacheRestoreOutcome,
            cacheSaveOutcome,
            cacheHit,
            referenceEnsureOutcome,
            trendOutcome,
            referencePromoteOutcome,
        },
        upstream: {
            executionBaselineGateOutcome,
            executionBaselineReportValidateOutcome,
        },
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        warnings,
        validationErrors,
    };

    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-execution-baseline-reference-ci-state] status=${status} warnings=${warnings.length} errors=${validationErrors.length} summary=${summaryJsonAbsolutePath}\n`,
    );

    if (warnings.length > 0) {
        process.stdout.write(
            `[workflow-execution-baseline-reference-ci-state] warnings: ${warnings.join(' | ')}\n`,
        );
    }

    if (status === 'FAILED') {
        process.stderr.write(
            `[workflow-execution-baseline-reference-ci-state] failed: ${validationErrors.join(' | ')}\n`,
        );
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-execution-baseline-reference-ci-state] fatal: ${message}\n`);
    process.exitCode = 1;
});
