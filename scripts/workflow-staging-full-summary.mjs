#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    renderWorkflowExecutionBaselineMarkdown,
    renderWorkflowExecutionBaselineTrendMarkdown,
    renderWorkflowExecutionBaselineValidationMarkdown,
} from './workflow-summary-renderers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SCHEMA_VERSION = '1.0';
const DEFAULT_PRECHECK_SUMMARY_FILE = 'logs/workflow-drill-staging-precheck-summary.json';
const DEFAULT_ROLLBACK_SMOKE_REPORT_FILE = 'logs/workflow-smoke-gate-report.json';
const DEFAULT_ROLLBACK_BASELINE_REPORT_FILE = 'logs/workflow-execution-baseline-post-rollback.json';
const DEFAULT_ROLLBACK_BASELINE_VALIDATION_FILE = 'logs/workflow-execution-baseline-post-rollback-validation.json';
const DEFAULT_ROLLBACK_BASELINE_TREND_FILE = 'logs/workflow-execution-baseline-post-rollback-trend.json';
const DEFAULT_CI_STEP_SUMMARY_FILE = 'logs/workflow-ci-step-summary.md';
const DEFAULT_CI_STEP_SUMMARY_VALIDATION_FILE = 'logs/workflow-ci-step-summary-validation.json';
const DEFAULT_SUMMARY_MARKDOWN_FILE = 'logs/workflow-drill-staging-full-summary.md';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-drill-staging-full-summary.json';
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
const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : null);

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

const readTextFile = async (targetPath) => {
    try {
        const content = await readFile(targetPath, 'utf-8');
        return {
            exists: true,
            data: content,
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

const resolveStatus = (value) => {
    const normalized = normalizeStatus(value);
    if (!normalized) {
        return 'UNKNOWN';
    }
    return normalized;
};

const resolveBaselineStatus = (report) => {
    const gatePassed = report?.gate?.passed;
    if (typeof gatePassed !== 'boolean') {
        return 'UNKNOWN';
    }
    return gatePassed ? 'SUCCESS' : 'FAILED';
};

const isFailureStatus = (status) => ['FAILED', 'UNKNOWN', 'MISSING'].includes(status);

async function main() {
    const precheckSummaryFile = readArgValue('--precheck-summary-file', DEFAULT_PRECHECK_SUMMARY_FILE);
    const rollbackSmokeReportFile = readArgValue('--rollback-smoke-report-file', DEFAULT_ROLLBACK_SMOKE_REPORT_FILE);
    const rollbackBaselineReportFile = readArgValue('--rollback-baseline-report-file', DEFAULT_ROLLBACK_BASELINE_REPORT_FILE);
    const rollbackBaselineValidationFile = readArgValue(
        '--rollback-baseline-validation-file',
        DEFAULT_ROLLBACK_BASELINE_VALIDATION_FILE,
    );
    const rollbackBaselineTrendFile = readArgValue(
        '--rollback-baseline-trend-file',
        DEFAULT_ROLLBACK_BASELINE_TREND_FILE,
    );
    const ciStepSummaryFile = readArgValue('--ci-step-summary-file', DEFAULT_CI_STEP_SUMMARY_FILE);
    const ciStepSummaryValidationFile = readArgValue(
        '--ci-step-summary-validation-file',
        DEFAULT_CI_STEP_SUMMARY_VALIDATION_FILE,
    );
    const summaryMarkdownFile = readArgValue('--summary-markdown-file', DEFAULT_SUMMARY_MARKDOWN_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);

    const precheckSummaryAbsolutePath = toAbsolutePath(precheckSummaryFile);
    const rollbackSmokeReportAbsolutePath = toAbsolutePath(rollbackSmokeReportFile);
    const rollbackBaselineReportAbsolutePath = toAbsolutePath(rollbackBaselineReportFile);
    const rollbackBaselineValidationAbsolutePath = toAbsolutePath(rollbackBaselineValidationFile);
    const rollbackBaselineTrendAbsolutePath = toAbsolutePath(rollbackBaselineTrendFile);
    const ciStepSummaryAbsolutePath = toAbsolutePath(ciStepSummaryFile);
    const ciStepSummaryValidationAbsolutePath = toAbsolutePath(ciStepSummaryValidationFile);
    const summaryMarkdownAbsolutePath = toAbsolutePath(summaryMarkdownFile);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);

    const warnings = [];
    const validationErrors = [];

    const precheckSummaryResult = await readJsonFile(precheckSummaryAbsolutePath);
    const rollbackSmokeReportResult = await readJsonFile(rollbackSmokeReportAbsolutePath);
    const rollbackBaselineReportResult = await readJsonFile(rollbackBaselineReportAbsolutePath);
    const rollbackBaselineValidationResult = await readJsonFile(rollbackBaselineValidationAbsolutePath);
    const rollbackBaselineTrendResult = await readJsonFile(rollbackBaselineTrendAbsolutePath);
    const ciStepSummaryResult = await readTextFile(ciStepSummaryAbsolutePath);
    const ciStepSummaryValidationResult = await readJsonFile(ciStepSummaryValidationAbsolutePath);

    const checkFile = (label, fileInfo, absolutePath) => {
        if (fileInfo.error) {
            validationErrors.push(`${label} read failed: ${fileInfo.error}`);
            return;
        }
        if (!fileInfo.exists) {
            validationErrors.push(`${label} missing: ${absolutePath}`);
        }
    };

    checkFile('precheck summary', precheckSummaryResult, precheckSummaryAbsolutePath);
    checkFile('rollback smoke report', rollbackSmokeReportResult, rollbackSmokeReportAbsolutePath);
    checkFile('rollback baseline report', rollbackBaselineReportResult, rollbackBaselineReportAbsolutePath);
    checkFile('rollback baseline validation', rollbackBaselineValidationResult, rollbackBaselineValidationAbsolutePath);
    checkFile('rollback baseline trend', rollbackBaselineTrendResult, rollbackBaselineTrendAbsolutePath);
    checkFile('CI step summary markdown', ciStepSummaryResult, ciStepSummaryAbsolutePath);
    checkFile('CI step summary validation', ciStepSummaryValidationResult, ciStepSummaryValidationAbsolutePath);

    const precheckStatus = precheckSummaryResult.exists
        ? resolveStatus(precheckSummaryResult.data?.status)
        : 'MISSING';
    const rollbackSmokeStatus = rollbackSmokeReportResult.exists
        ? resolveStatus(rollbackSmokeReportResult.data?.status)
        : 'MISSING';
    const rollbackBaselineStatus = rollbackBaselineReportResult.exists
        ? resolveBaselineStatus(rollbackBaselineReportResult.data)
        : 'MISSING';
    const rollbackBaselineValidationStatus = rollbackBaselineValidationResult.exists
        ? resolveStatus(rollbackBaselineValidationResult.data?.status)
        : 'MISSING';
    const rollbackBaselineTrendStatus = rollbackBaselineTrendResult.exists
        ? resolveStatus(rollbackBaselineTrendResult.data?.status)
        : 'MISSING';
    const ciStepSummaryValidationStatus = ciStepSummaryValidationResult.exists
        ? resolveStatus(ciStepSummaryValidationResult.data?.status)
        : 'MISSING';

    if (isFailureStatus(precheckStatus)) {
        validationErrors.push(`precheck status is ${precheckStatus}.`);
    }
    if (isFailureStatus(rollbackSmokeStatus)) {
        validationErrors.push(`rollback smoke status is ${rollbackSmokeStatus}.`);
    }
    if (isFailureStatus(rollbackBaselineStatus)) {
        validationErrors.push(`rollback baseline report status is ${rollbackBaselineStatus}.`);
    }
    if (isFailureStatus(rollbackBaselineValidationStatus)) {
        validationErrors.push(`rollback baseline validation status is ${rollbackBaselineValidationStatus}.`);
    }
    if (isFailureStatus(rollbackBaselineTrendStatus)) {
        validationErrors.push(`rollback baseline trend status is ${rollbackBaselineTrendStatus}.`);
    }
    if (isFailureStatus(ciStepSummaryValidationStatus)) {
        validationErrors.push(`CI step summary validation status is ${ciStepSummaryValidationStatus}.`);
    }

    if (ciStepSummaryResult.exists && ciStepSummaryResult.data && ciStepSummaryResult.data.length < 200) {
        warnings.push('CI step summary markdown seems too short; verify sections are complete.');
    }

    const status = validationErrors.length > 0 ? 'FAILED' : 'SUCCESS';

    const summary = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status,
        inputs: {
            precheckSummaryFile,
            rollbackSmokeReportFile,
            rollbackBaselineReportFile,
            rollbackBaselineValidationFile,
            rollbackBaselineTrendFile,
            ciStepSummaryFile,
            ciStepSummaryValidationFile,
            summaryMarkdownFile,
            summaryJsonFile,
        },
        components: {
            precheckSummary: {
                exists: precheckSummaryResult.exists,
                status: precheckStatus,
            },
            rollbackSmoke: {
                exists: rollbackSmokeReportResult.exists,
                status: rollbackSmokeStatus,
            },
            rollbackBaselineReport: {
                exists: rollbackBaselineReportResult.exists,
                status: rollbackBaselineStatus,
            },
            rollbackBaselineValidation: {
                exists: rollbackBaselineValidationResult.exists,
                status: rollbackBaselineValidationStatus,
            },
            rollbackBaselineTrend: {
                exists: rollbackBaselineTrendResult.exists,
                status: rollbackBaselineTrendStatus,
            },
            ciStepSummary: {
                exists: ciStepSummaryResult.exists,
                status: ciStepSummaryResult.exists ? 'SUCCESS' : 'MISSING',
            },
            ciStepSummaryValidation: {
                exists: ciStepSummaryValidationResult.exists,
                status: ciStepSummaryValidationStatus,
                missingSections: Array.isArray(ciStepSummaryValidationResult.data?.report?.missingSections)
                    ? ciStepSummaryValidationResult.data.report.missingSections
                    : [],
            },
        },
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        warnings,
        validationErrors,
    };

    const markdownBlocks = [
        '## Workflow Staging Full Drill Summary',
        '',
        `- Status: \`${status}\``,
        `- Generated At: \`${summary.generatedAt}\``,
        `- Precheck Summary: \`${precheckStatus}\``,
        `- Rollback Smoke: \`${rollbackSmokeStatus}\``,
        `- Rollback Baseline Report: \`${rollbackBaselineStatus}\``,
        `- Rollback Baseline Validation: \`${rollbackBaselineValidationStatus}\``,
        `- Rollback Baseline Trend: \`${rollbackBaselineTrendStatus}\``,
        `- CI Step Summary Validation: \`${ciStepSummaryValidationStatus}\``,
        `- Validation Error Count: \`${validationErrors.length}\``,
        `- Warning Count: \`${warnings.length}\``,
    ];

    if (validationErrors.length > 0) {
        markdownBlocks.push('');
        markdownBlocks.push('### Validation Errors');
        markdownBlocks.push('');
        for (const item of validationErrors.slice(0, 8)) {
            markdownBlocks.push(`- ${item}`);
        }
    }

    if (warnings.length > 0) {
        markdownBlocks.push('');
        markdownBlocks.push('### Warnings');
        markdownBlocks.push('');
        for (const item of warnings.slice(0, 5)) {
            markdownBlocks.push(`- ${item}`);
        }
    }

    if (rollbackBaselineReportResult.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(renderWorkflowExecutionBaselineMarkdown(rollbackBaselineReportResult.data));
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline report file not found');
    }

    if (rollbackBaselineValidationResult.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(
            renderWorkflowExecutionBaselineValidationMarkdown(rollbackBaselineValidationResult.data),
        );
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline validation file not found');
    }

    if (rollbackBaselineTrendResult.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(renderWorkflowExecutionBaselineTrendMarkdown(rollbackBaselineTrendResult.data));
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline trend file not found');
    }

    if (ciStepSummaryResult.exists && ciStepSummaryResult.data) {
        markdownBlocks.push('');
        markdownBlocks.push('## Workflow CI Step Summary Snapshot');
        markdownBlocks.push('');
        markdownBlocks.push(ciStepSummaryResult.data.trimEnd());
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow CI step summary markdown file not found');
    }

    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    await mkdir(path.dirname(summaryMarkdownAbsolutePath), { recursive: true });
    await writeFile(summaryMarkdownAbsolutePath, `${markdownBlocks.join('\n')}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-staging-full-summary] status=${status} warnings=${warnings.length} errors=${validationErrors.length} markdown=${summaryMarkdownAbsolutePath} summary=${summaryJsonAbsolutePath}\n`,
    );

    if (status === 'FAILED') {
        process.stderr.write(`[workflow-staging-full-summary] failed: ${validationErrors.join(' | ')}\n`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-staging-full-summary] fatal: ${message}\n`);
    process.exitCode = 1;
});
