#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_SMOKE_REPORT = 'logs/workflow-smoke-gate-report.json';
const DEFAULT_PERF_REPORT = 'apps/api/logs/workflow-perf-risk-gate-baseline.json';
const EXPECTED_SCENARIO_IDS = ['pass-low-risk', 'soft-block-high-risk', 'hard-block-by-rule'];

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

const isObjectRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ensure = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const readJsonFile = async (targetPath, options = { allowMissing: false }) => {
    const absolutePath = toAbsolutePath(targetPath);
    try {
        const content = await readFile(absolutePath, 'utf-8');
        return {
            absolutePath,
            data: JSON.parse(content),
            missing: false,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.allowMissing && /ENOENT/i.test(message)) {
            return {
                absolutePath,
                data: null,
                missing: true,
            };
        }
        throw new Error(`Failed to read ${absolutePath}: ${message}`);
    }
};

const validateSmokeReport = (report) => {
    ensure(isObjectRecord(report), 'Smoke report must be an object.');
    ensure(typeof report.schemaVersion === 'string' && report.schemaVersion.trim().length > 0, 'Smoke report schemaVersion is required.');
    ensure(typeof report.runId === 'string' && report.runId.trim().length > 0, 'Smoke report runId is required.');
    ensure(['base', 'extended', 'gate'].includes(report.mode), `Smoke report mode is invalid: ${report.mode}`);
    ensure(['SUCCESS', 'FAILED'].includes(report.status), `Smoke report status is invalid: ${report.status}`);
    ensure(Array.isArray(report.steps) && report.steps.length > 0, 'Smoke report steps must be a non-empty array.');
    ensure(isObjectRecord(report.summary), 'Smoke report summary is required.');

    const successCount = report.steps.filter((step) => step?.status === 'SUCCESS').length;
    const failedCount = report.steps.filter((step) => step?.status === 'FAILED').length;
    ensure(report.summary.totalSteps === report.steps.length, 'Smoke summary totalSteps does not match steps length.');
    ensure(report.summary.successfulSteps === successCount, 'Smoke summary successfulSteps does not match computed value.');
    ensure(report.summary.failedSteps === failedCount, 'Smoke summary failedSteps does not match computed value.');

    let retryTotal = 0;
    for (const step of report.steps) {
        ensure(isObjectRecord(step), 'Smoke step must be an object.');
        ensure(typeof step.id === 'string' && step.id.trim().length > 0, 'Smoke step id is required.');
        ensure(typeof step.name === 'string' && step.name.trim().length > 0, 'Smoke step name is required.');
        ensure(Array.isArray(step.args), `Smoke step args must be an array: ${step.name}`);
        ensure(['SUCCESS', 'FAILED'].includes(step.status), `Smoke step status is invalid: ${step.name}`);
        ensure(Array.isArray(step.attempts) && step.attempts.length > 0, `Smoke step attempts must be non-empty: ${step.name}`);
        retryTotal += Number(step.retryCount || 0);

        for (const attempt of step.attempts) {
            ensure(isObjectRecord(attempt), `Smoke attempt must be object: ${step.name}`);
            ensure(typeof attempt.attempt === 'number' && attempt.attempt >= 1, `Smoke attempt index invalid: ${step.name}`);
            ensure(typeof attempt.exitCode === 'number', `Smoke attempt exitCode invalid: ${step.name}`);
            ensure(typeof attempt.durationMs === 'number' && attempt.durationMs >= 0, `Smoke attempt duration invalid: ${step.name}`);
        }
    }

    ensure(report.summary.totalRetries === retryTotal, 'Smoke summary totalRetries does not match computed value.');

    return {
        mode: report.mode,
        status: report.status,
        durationMs: Number(report.durationMs || 0),
        totalSteps: report.summary.totalSteps,
        failedStepName: report.summary.failedStepName || null,
        totalRetries: report.summary.totalRetries,
    };
};

const validatePerfReport = (report) => {
    ensure(isObjectRecord(report), 'Perf report must be an object.');
    ensure(typeof report.generatedAt === 'string' && report.generatedAt.trim().length > 0, 'Perf report generatedAt is required.');
    ensure(typeof report.schemaVersion === 'string' && report.schemaVersion.trim().length > 0, 'Perf report schemaVersion is required.');
    ensure(Array.isArray(report.metrics) && report.metrics.length > 0, 'Perf report metrics must be a non-empty array.');
    ensure(isObjectRecord(report.thresholdCheck), 'Perf report thresholdCheck is required.');
    ensure(Array.isArray(report.thresholdCheck.limits), 'Perf report thresholdCheck.limits must be an array.');
    ensure(Array.isArray(report.thresholdCheck.violations), 'Perf report thresholdCheck.violations must be an array.');

    const scenarioIds = new Set();
    const p95ByScenario = {};

    for (const metric of report.metrics) {
        ensure(isObjectRecord(metric), 'Perf metric must be an object.');
        ensure(typeof metric.id === 'string' && metric.id.trim().length > 0, 'Perf metric id is required.');
        ensure(typeof metric.sampleSize === 'number' && metric.sampleSize > 0, `Perf sampleSize invalid: ${metric.id}`);
        ensure(typeof metric.p50Ms === 'number' && metric.p50Ms >= 0, `Perf p50 invalid: ${metric.id}`);
        ensure(typeof metric.p95Ms === 'number' && metric.p95Ms >= 0, `Perf p95 invalid: ${metric.id}`);
        ensure(typeof metric.p99Ms === 'number' && metric.p99Ms >= 0, `Perf p99 invalid: ${metric.id}`);
        ensure(metric.p50Ms <= metric.p95Ms, `Perf percentile order invalid (p50 > p95): ${metric.id}`);
        ensure(metric.p95Ms <= metric.p99Ms, `Perf percentile order invalid (p95 > p99): ${metric.id}`);
        scenarioIds.add(metric.id);
        p95ByScenario[metric.id] = metric.p95Ms;
    }

    for (const scenarioId of EXPECTED_SCENARIO_IDS) {
        ensure(scenarioIds.has(scenarioId), `Perf report missing scenario: ${scenarioId}`);
    }

    return {
        generatedAt: report.generatedAt,
        violations: report.thresholdCheck.violations.length,
        p95ByScenario,
    };
};

const formatDuration = (durationMs) => `${Number(durationMs || 0).toFixed(2)}ms`;

const toMarkdownSummary = ({ smoke, perf, warnings }) => {
    const lines = [
        '# Workflow Report Summary',
        '',
        `- Smoke report: ${smoke ? 'loaded' : 'missing'}`,
        `- Perf report: ${perf ? 'loaded' : 'missing'}`,
        '',
    ];

    if (smoke) {
        lines.push('## Smoke');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|---|---|');
        lines.push(`| Mode | \`${smoke.mode}\` |`);
        lines.push(`| Status | \`${smoke.status}\` |`);
        lines.push(`| Duration | \`${formatDuration(smoke.durationMs)}\` |`);
        lines.push(`| Steps | \`${smoke.totalSteps}\` |`);
        lines.push(`| Retries | \`${smoke.totalRetries}\` |`);
        lines.push(`| Failed Step | \`${smoke.failedStepName ?? 'N/A'}\` |`);
        lines.push('');
    }

    if (perf) {
        lines.push('## Perf (P95)');
        lines.push('');
        lines.push('| Scenario | P95(ms) |');
        lines.push('|---|---:|');
        for (const scenarioId of EXPECTED_SCENARIO_IDS) {
            const p95 = perf.p95ByScenario[scenarioId];
            lines.push(`| \`${scenarioId}\` | ${typeof p95 === 'number' ? p95.toFixed(4) : 'N/A'} |`);
        }
        lines.push('');
        lines.push(`- Threshold violations: \`${perf.violations}\``);
        lines.push('');
    }

    if (warnings.length > 0) {
        lines.push('## Warnings');
        lines.push('');
        for (const warning of warnings) {
            lines.push(`- ${warning}`);
        }
        lines.push('');
    }

    return lines.join('\n');
};

async function main() {
    const smokeReportPath = readArgValue('--smoke-report', DEFAULT_SMOKE_REPORT);
    const perfReportPath = readArgValue('--perf-report', DEFAULT_PERF_REPORT);
    const summaryMarkdownFile = readArgValue('--summary-markdown-file', '');
    const allowMissingPerfReport = hasFlag('--allow-missing-perf-report');
    const allowMissingSmokeReport = hasFlag('--allow-missing-smoke-report');

    const warnings = [];
    const smokeFile = await readJsonFile(smokeReportPath, { allowMissing: allowMissingSmokeReport });
    const perfFile = await readJsonFile(perfReportPath, { allowMissing: allowMissingPerfReport });

    let smokeSummary = null;
    let perfSummary = null;

    if (smokeFile.missing) {
        warnings.push(`Smoke report missing: ${smokeFile.absolutePath}`);
    } else {
        smokeSummary = validateSmokeReport(smokeFile.data);
        console.log(
            `[workflow-report-validate] smoke mode=${smokeSummary.mode} status=${smokeSummary.status} steps=${smokeSummary.totalSteps} retries=${smokeSummary.totalRetries} duration=${formatDuration(smokeSummary.durationMs)}`,
        );
    }

    if (perfFile.missing) {
        warnings.push(`Perf report missing: ${perfFile.absolutePath}`);
    } else {
        perfSummary = validatePerfReport(perfFile.data);
        console.log(
            `[workflow-report-validate] perf generatedAt=${perfSummary.generatedAt} thresholdViolations=${perfSummary.violations}`,
        );
    }

    if (summaryMarkdownFile) {
        const markdown = toMarkdownSummary({
            smoke: smokeSummary,
            perf: perfSummary,
            warnings,
        });
        const summaryAbsolutePath = toAbsolutePath(summaryMarkdownFile);
        await mkdir(path.dirname(summaryAbsolutePath), { recursive: true });
        await writeFile(summaryAbsolutePath, `${markdown}\n`, 'utf-8');
        console.log(`[workflow-report-validate] summary markdown written to ${summaryAbsolutePath}`);
    }
}

main().catch((error) => {
    console.error(`[workflow-report-validate] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
