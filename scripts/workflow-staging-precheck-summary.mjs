#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    renderWorkflowExecutionBaselineMarkdown,
    renderWorkflowExecutionBaselineReferenceOperationMarkdown,
    renderWorkflowExecutionBaselineTrendMarkdown,
    renderWorkflowExecutionBaselineValidationMarkdown,
} from './workflow-summary-renderers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SCHEMA_VERSION = '1.0';
const DEFAULT_BASELINE_REPORT_FILE = 'logs/workflow-execution-baseline-staging-drill.json';
const DEFAULT_BASELINE_VALIDATION_FILE = 'logs/workflow-execution-baseline-staging-drill-validation.json';
const DEFAULT_REFERENCE_OPERATION_FILE = 'logs/workflow-execution-baseline-reference-operation.json';
const DEFAULT_TREND_FILE = 'logs/workflow-execution-baseline-staging-trend.json';
const DEFAULT_SUMMARY_MARKDOWN_FILE = 'logs/workflow-drill-staging-precheck-summary.md';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-drill-staging-precheck-summary.json';
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

const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : null);

const resolveBaselineReportStatus = (report) => {
    const gatePassed = report?.gate?.passed;
    if (typeof gatePassed !== 'boolean') {
        return 'UNKNOWN';
    }
    return gatePassed ? 'SUCCESS' : 'FAILED';
};

const resolveComponentStatus = (value) => {
    const normalized = normalizeStatus(value);
    if (!normalized) {
        return 'UNKNOWN';
    }
    if (['SUCCESS', 'FAILED', 'SKIPPED', 'PARTIAL'].includes(normalized)) {
        return normalized;
    }
    return normalized;
};

const isFailureStatus = (status) => ['FAILED', 'UNKNOWN'].includes(status);

async function main() {
    const baselineReportFile = readArgValue('--baseline-report-file', DEFAULT_BASELINE_REPORT_FILE);
    const baselineValidationFile = readArgValue('--baseline-validation-file', DEFAULT_BASELINE_VALIDATION_FILE);
    const referenceOperationFile = readArgValue('--reference-operation-file', DEFAULT_REFERENCE_OPERATION_FILE);
    const trendFile = readArgValue('--trend-file', DEFAULT_TREND_FILE);
    const summaryMarkdownFile = readArgValue('--summary-markdown-file', DEFAULT_SUMMARY_MARKDOWN_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);

    const baselineReportAbsolutePath = toAbsolutePath(baselineReportFile);
    const baselineValidationAbsolutePath = toAbsolutePath(baselineValidationFile);
    const referenceOperationAbsolutePath = toAbsolutePath(referenceOperationFile);
    const trendAbsolutePath = toAbsolutePath(trendFile);
    const summaryMarkdownAbsolutePath = toAbsolutePath(summaryMarkdownFile);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);

    const warnings = [];
    const validationErrors = [];

    const baselineReportFileData = await readJsonFile(baselineReportAbsolutePath);
    const baselineValidationFileData = await readJsonFile(baselineValidationAbsolutePath);
    const referenceOperationFileData = await readJsonFile(referenceOperationAbsolutePath);
    const trendFileData = await readJsonFile(trendAbsolutePath);

    const checkFileResult = (label, fileInfo, absolutePath) => {
        if (fileInfo.error) {
            validationErrors.push(`${label} read failed: ${fileInfo.error}`);
            return;
        }
        if (!fileInfo.exists) {
            validationErrors.push(`${label} missing: ${absolutePath}`);
        }
    };

    checkFileResult('baseline report', baselineReportFileData, baselineReportAbsolutePath);
    checkFileResult('baseline validation', baselineValidationFileData, baselineValidationAbsolutePath);
    checkFileResult('reference operation', referenceOperationFileData, referenceOperationAbsolutePath);
    checkFileResult('trend report', trendFileData, trendAbsolutePath);

    const baselineReportStatus = baselineReportFileData.exists
        ? resolveBaselineReportStatus(baselineReportFileData.data)
        : 'MISSING';
    const baselineValidationStatus = baselineValidationFileData.exists
        ? resolveComponentStatus(baselineValidationFileData.data?.status)
        : 'MISSING';
    const referenceOperationStatus = referenceOperationFileData.exists
        ? resolveComponentStatus(referenceOperationFileData.data?.status)
        : 'MISSING';
    const trendStatus = trendFileData.exists
        ? resolveComponentStatus(trendFileData.data?.status)
        : 'MISSING';

    if (isFailureStatus(baselineReportStatus)) {
        validationErrors.push(`baseline report status is ${baselineReportStatus}.`);
    }
    if (isFailureStatus(baselineValidationStatus)) {
        validationErrors.push(`baseline validation status is ${baselineValidationStatus}.`);
    }
    if (isFailureStatus(referenceOperationStatus)) {
        validationErrors.push(`reference operation status is ${referenceOperationStatus}.`);
    }
    if (trendStatus === 'SKIPPED') {
        warnings.push('trend status is SKIPPED; staging precheck requires reference and should normally be SUCCESS.');
    } else if (isFailureStatus(trendStatus)) {
        validationErrors.push(`trend status is ${trendStatus}.`);
    }

    const status = validationErrors.length > 0 ? 'FAILED' : 'SUCCESS';

    const summary = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status,
        inputs: {
            baselineReportFile,
            baselineValidationFile,
            referenceOperationFile,
            trendFile,
            summaryMarkdownFile,
            summaryJsonFile,
        },
        components: {
            baselineReport: {
                exists: baselineReportFileData.exists,
                status: baselineReportStatus,
            },
            baselineValidation: {
                exists: baselineValidationFileData.exists,
                status: baselineValidationStatus,
            },
            referenceOperation: {
                exists: referenceOperationFileData.exists,
                status: referenceOperationStatus,
            },
            trend: {
                exists: trendFileData.exists,
                status: trendStatus,
            },
        },
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        warnings,
        validationErrors,
    };

    const markdownBlocks = [
        '## Workflow Staging Precheck Summary',
        '',
        `- Status: \`${status}\``,
        `- Generated At: \`${summary.generatedAt}\``,
        `- Baseline Report: \`${baselineReportStatus}\``,
        `- Baseline Validation: \`${baselineValidationStatus}\``,
        `- Reference Operation: \`${referenceOperationStatus}\``,
        `- Trend: \`${trendStatus}\``,
        `- Validation Error Count: \`${validationErrors.length}\``,
        `- Warning Count: \`${warnings.length}\``,
    ];

    if (validationErrors.length > 0) {
        markdownBlocks.push('');
        markdownBlocks.push('### Validation Errors');
        markdownBlocks.push('');
        for (const item of validationErrors.slice(0, 5)) {
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

    if (baselineReportFileData.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(renderWorkflowExecutionBaselineMarkdown(baselineReportFileData.data));
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline report file not found');
    }

    if (baselineValidationFileData.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(
            renderWorkflowExecutionBaselineValidationMarkdown(baselineValidationFileData.data),
        );
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline validation file not found');
    }

    if (referenceOperationFileData.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(
            renderWorkflowExecutionBaselineReferenceOperationMarkdown(referenceOperationFileData.data),
        );
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline reference operation file not found');
    }

    if (trendFileData.exists) {
        markdownBlocks.push('');
        markdownBlocks.push(renderWorkflowExecutionBaselineTrendMarkdown(trendFileData.data));
    } else {
        markdownBlocks.push('');
        markdownBlocks.push('workflow execution baseline trend file not found');
    }

    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    await mkdir(path.dirname(summaryMarkdownAbsolutePath), { recursive: true });
    await writeFile(summaryMarkdownAbsolutePath, `${markdownBlocks.join('\n')}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-staging-precheck-summary] status=${status} warnings=${warnings.length} errors=${validationErrors.length} markdown=${summaryMarkdownAbsolutePath} summary=${summaryJsonAbsolutePath}\n`,
    );

    if (status === 'FAILED') {
        process.stderr.write(
            `[workflow-staging-precheck-summary] failed: ${validationErrors.join(' | ')}\n`,
        );
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-staging-precheck-summary] fatal: ${message}\n`);
    process.exitCode = 1;
});
