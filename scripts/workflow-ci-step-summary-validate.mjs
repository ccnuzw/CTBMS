#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const REPORT_SCHEMA_VERSION = '1.0';
const DEFAULT_SUMMARY_FILE = 'logs/workflow-ci-step-summary.md';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-ci-step-summary-validation.json';
const DEFAULT_REQUIRED_SECTIONS = Object.freeze([
    '## Workflow Quick Locate Index',
    '## Workflow Quality Gate',
    '## Workflow Quality Gate Report Validation',
    '## Workflow Execution Baseline',
    '## Workflow Execution Baseline Validation',
    '## Workflow Execution Baseline Reference Operation',
    '## Workflow Execution Baseline Trend',
    '## Workflow Summary Self-Check Suite',
    '## Workflow Summary Self-Check Report Validation',
]);

const args = process.argv.slice(2);

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const readArgValues = (name) => args
    .filter((item) => item.startsWith(`${name}=`))
    .map((item) => item.split('=').slice(1).join('=').trim())
    .filter((item) => item.length > 0);

const nowIso = () => new Date().toISOString();

const writeJsonFile = async (filePath, value) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

async function main() {
    const summaryFile = readArgValue('--summary-file', DEFAULT_SUMMARY_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const requiredSections = readArgValues('--require-section');
    const expectedSections = requiredSections.length > 0
        ? requiredSections
        : DEFAULT_REQUIRED_SECTIONS.slice();
    const summaryAbsolutePath = path.resolve(repoRoot, summaryFile);
    const summaryJsonAbsolutePath = path.resolve(repoRoot, summaryJsonFile);

    const report = {
        schemaVersion: REPORT_SCHEMA_VERSION,
        generatedAt: nowIso(),
        status: 'FAILED',
        inputs: {
            summaryFile,
            summaryJsonFile,
            requiredSectionCount: expectedSections.length,
            requiredSections: expectedSections,
        },
        report: {
            summaryFile,
            summaryFileExists: false,
            summaryLength: 0,
            foundSections: [],
            missingSections: [],
        },
        warningCount: 0,
        validationErrorCount: 0,
        warnings: [],
        validationErrors: [],
    };

    try {
        const summaryMarkdown = await readFile(summaryAbsolutePath, 'utf-8');
        report.report.summaryFileExists = true;
        report.report.summaryLength = summaryMarkdown.length;

        for (const section of expectedSections) {
            if (summaryMarkdown.includes(section)) {
                report.report.foundSections.push(section);
            } else {
                report.report.missingSections.push(section);
            }
        }

        if (report.report.missingSections.length > 0) {
            report.validationErrors.push(
                `workflow CI step summary missing required sections: ${report.report.missingSections.join(' | ')}`,
            );
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.validationErrors.push(`failed to read summary file ${summaryAbsolutePath}: ${message}`);
    } finally {
        report.validationErrorCount = report.validationErrors.length;
        report.warningCount = report.warnings.length;
        report.status = report.validationErrorCount === 0 ? 'SUCCESS' : 'FAILED';

        await writeJsonFile(summaryJsonAbsolutePath, report);
        console.log(
            `[workflow-ci-step-summary-validate] status=${report.status} missing=${report.report.missingSections.length} summary=${summaryJsonAbsolutePath}`,
        );

        if (report.status !== 'SUCCESS') {
            console.error(`[workflow-ci-step-summary-validate] validation failed: ${report.validationErrors.join(' | ')}`);
            process.exitCode = 1;
        }
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-ci-step-summary-validate] failed: ${message}`);
    process.exitCode = 1;
});
