#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWorkflowReportValidationSummaryMarkdown } from './workflow-summary-renderers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-reports-summary.json';
const DEFAULT_MAX_ITEMS = 3;
const args = process.argv.slice(2);

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
};

async function main() {
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const maxItems = parsePositiveInteger(
        readArgValue('--max-items', String(DEFAULT_MAX_ITEMS)),
        DEFAULT_MAX_ITEMS,
    );
    const absolutePath = path.resolve(repoRoot, summaryJsonFile);
    const content = await readFile(absolutePath, 'utf-8');
    const summary = JSON.parse(content);
    const markdown = renderWorkflowReportValidationSummaryMarkdown(summary, { maxItems });
    process.stdout.write(`${markdown}\n`);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-report-summary] failed: ${message}`);
    process.exitCode = 1;
});
