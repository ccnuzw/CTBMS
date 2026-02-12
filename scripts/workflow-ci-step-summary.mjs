#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    renderQualityGateSummaryMarkdown,
    renderWorkflowQuickLocateIndexMarkdown,
    renderWorkflowQualityGateReportValidationMarkdown,
    renderWorkflowReportValidationSummaryMarkdown,
    renderWorkflowSummarySelfCheckValidationMarkdown,
    renderWorkflowSummarySelfCheckMarkdown,
} from './workflow-summary-renderers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_QUALITY_REPORT_FILE = 'logs/workflow-quality-gate-report.json';
const DEFAULT_SUMMARY_MARKDOWN_FILE = 'logs/workflow-reports-summary.md';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-reports-summary.json';
const DEFAULT_QUALITY_REPORT_VALIDATION_FILE = 'logs/workflow-quality-gate-report-validation.json';
const DEFAULT_SELF_CHECK_REPORT_FILE = 'logs/workflow-summary-self-check-report.json';
const DEFAULT_SELF_CHECK_VALIDATION_FILE = 'logs/workflow-summary-self-check-validation.json';
const args = process.argv.slice(2);

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const fileExists = async (filePath) => {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
};

const readTextFile = async (filePath) => readFile(filePath, 'utf-8');

async function main() {
    const qualityReportFile = readArgValue('--quality-report-file', DEFAULT_QUALITY_REPORT_FILE);
    const summaryMarkdownFile = readArgValue('--summary-markdown-file', DEFAULT_SUMMARY_MARKDOWN_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const qualityReportValidationFile = readArgValue(
        '--quality-report-validation-file',
        DEFAULT_QUALITY_REPORT_VALIDATION_FILE,
    );
    const selfCheckReportFile = readArgValue('--self-check-report-file', DEFAULT_SELF_CHECK_REPORT_FILE);
    const selfCheckValidationFile = readArgValue(
        '--self-check-validation-file',
        DEFAULT_SELF_CHECK_VALIDATION_FILE,
    );
    const failureIndexSnapshotMaxCharsRaw = readArgValue('--failure-index-snapshot-max-chars', '');
    const failureIndexSnapshotMaxChars = Number.parseInt(failureIndexSnapshotMaxCharsRaw, 10);
    const qualityReportValidationRenderOptions = Number.isFinite(failureIndexSnapshotMaxChars)
        && failureIndexSnapshotMaxChars > 0
        ? { failureIndexSnapshotMaxChars }
        : {};

    const qualityReportAbsolutePath = path.resolve(repoRoot, qualityReportFile);
    const summaryMarkdownAbsolutePath = path.resolve(repoRoot, summaryMarkdownFile);
    const summaryJsonAbsolutePath = path.resolve(repoRoot, summaryJsonFile);
    const qualityReportValidationAbsolutePath = path.resolve(repoRoot, qualityReportValidationFile);
    const selfCheckReportAbsolutePath = path.resolve(repoRoot, selfCheckReportFile);
    const selfCheckValidationAbsolutePath = path.resolve(repoRoot, selfCheckValidationFile);

    let qualityReport = null;
    let qualityReportValidation = null;
    let summaryMarkdownText = null;
    let summaryJson = null;
    let selfCheckReport = null;
    let selfCheckValidation = null;

    if (await fileExists(qualityReportAbsolutePath)) {
        qualityReport = JSON.parse(await readTextFile(qualityReportAbsolutePath));
    }
    if (await fileExists(qualityReportValidationAbsolutePath)) {
        qualityReportValidation = JSON.parse(await readTextFile(qualityReportValidationAbsolutePath));
    }
    if (await fileExists(summaryMarkdownAbsolutePath)) {
        summaryMarkdownText = (await readTextFile(summaryMarkdownAbsolutePath)).trimEnd();
    }
    if (await fileExists(summaryJsonAbsolutePath)) {
        summaryJson = JSON.parse(await readTextFile(summaryJsonAbsolutePath));
    }
    if (await fileExists(selfCheckReportAbsolutePath)) {
        selfCheckReport = JSON.parse(await readTextFile(selfCheckReportAbsolutePath));
    }
    if (await fileExists(selfCheckValidationAbsolutePath)) {
        selfCheckValidation = JSON.parse(await readTextFile(selfCheckValidationAbsolutePath));
    }

    const blocks = [];
    blocks.push(
        renderWorkflowQuickLocateIndexMarkdown({
            qualityReport,
            qualityReportValidation,
            selfCheckReport,
            selfCheckValidation,
        }),
    );

    if (qualityReport) {
        blocks.push(renderQualityGateSummaryMarkdown(qualityReport));
    } else {
        blocks.push('workflow quality gate report file not found');
    }

    if (qualityReportValidation) {
        blocks.push(
            renderWorkflowQualityGateReportValidationMarkdown(
                qualityReportValidation,
                qualityReportValidationRenderOptions,
            ),
        );
    } else {
        blocks.push('workflow quality gate report validation file not found');
    }

    if (summaryMarkdownText !== null) {
        blocks.push(summaryMarkdownText);
    } else {
        blocks.push('workflow report summary file not found');
    }

    if (summaryJson) {
        blocks.push(renderWorkflowReportValidationSummaryMarkdown(summaryJson));
    } else {
        blocks.push('workflow report summary json file not found');
    }

    if (selfCheckReport) {
        blocks.push(renderWorkflowSummarySelfCheckMarkdown(selfCheckReport));
    } else {
        blocks.push('workflow summary self-check report file not found');
    }

    if (selfCheckValidation) {
        blocks.push(renderWorkflowSummarySelfCheckValidationMarkdown(selfCheckValidation));
    } else {
        blocks.push('workflow summary self-check validation file not found');
    }

    process.stdout.write(`${blocks.filter(Boolean).join('\n\n')}\n`);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-ci-step-summary] failed: ${message}`);
    process.exitCode = 1;
});
