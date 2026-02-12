#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderQualityGateSummaryMarkdown } from './workflow-summary-renderers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_REPORT_FILE = 'logs/workflow-quality-gate-report.json';
const DEFAULT_MAX_REASON_CHARS = 300;
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
    const reportFile = readArgValue('--report-file', DEFAULT_REPORT_FILE);
    const maxReasonChars = parsePositiveInteger(
        readArgValue('--max-reason-chars', String(DEFAULT_MAX_REASON_CHARS)),
        DEFAULT_MAX_REASON_CHARS,
    );
    const absolutePath = path.resolve(repoRoot, reportFile);
    const content = await readFile(absolutePath, 'utf-8');
    const report = JSON.parse(content);
    const markdown = renderQualityGateSummaryMarkdown(report, { maxReasonChars });
    process.stdout.write(`${markdown}\n`);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-quality-gate-report-summary] failed: ${message}`);
    process.exitCode = 1;
});
