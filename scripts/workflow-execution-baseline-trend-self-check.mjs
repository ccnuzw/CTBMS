#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const trendScript = path.resolve(repoRoot, 'scripts/workflow-execution-baseline-trend.mjs');

const runNodeScript = (scriptFile, scriptArgs) => new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptFile, ...scriptArgs], {
        cwd: repoRoot,
        env: process.env,
        shell: false,
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
        output += chunk.toString();
        process.stderr.write(chunk);
    });
    child.on('close', (code) => {
        resolve({
            exitCode: code ?? 1,
            output,
        });
    });
    child.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        resolve({
            exitCode: 1,
            output: message,
        });
    });
});

const writeJson = async (targetPath, value) => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

const readJson = async (targetPath) => {
    const content = await readFile(targetPath, 'utf-8');
    return JSON.parse(content);
};

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

const createBaselineReport = ({
    runId,
    successRate,
    failedRate,
    timeoutRate,
    p95,
    executions,
} = {}) => ({
    schemaVersion: '1.0',
    runId: runId || 'wf-baseline-report',
    startedAt: '2026-02-12T00:00:00.000Z',
    finishedAt: '2026-02-12T00:00:30.000Z',
    durationMs: 30000,
    query: {
        since: '2026-02-05T00:00:00.000Z',
        days: 7,
        batchSize: 1000,
    },
    totals: {
        executions,
        completed: executions,
        running: 0,
        pending: 0,
        success: Math.round(executions * successRate),
        failed: Math.round(executions * failedRate),
        canceled: 0,
        timeoutFailures: Math.round(executions * timeoutRate),
    },
    rates: {
        successRate,
        failedRate,
        canceledRate: 0,
        timeoutRate,
        completedSuccessRate: successRate,
    },
    latencyMs: {
        sampleCount: executions,
        p50: Math.max(1, p95 * 0.5),
        p90: Math.max(1, p95 * 0.8),
        p95,
        p99: Math.max(1, p95 * 1.2),
    },
    gate: {
        passed: true,
        evaluated: true,
        thresholds: {
            minSuccessRate: 0.9,
            maxFailureRate: 0.1,
            maxCanceledRate: 0.1,
            maxTimeoutRate: 0.05,
            maxP95DurationMs: 60000,
        },
        violations: [],
        warnings: [],
    },
});

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-execution-baseline-trend-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('trend compare success when no regression', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const currentReportPath = path.join(caseDir, 'current.json');
            const referenceReportPath = path.join(caseDir, 'reference.json');
            const summaryPath = path.join(caseDir, 'trend.json');

            await writeJson(currentReportPath, createBaselineReport({
                runId: 'current',
                successRate: 0.95,
                failedRate: 0.05,
                timeoutRate: 0.01,
                p95: 10000,
                executions: 100,
            }));
            await writeJson(referenceReportPath, createBaselineReport({
                runId: 'reference',
                successRate: 0.93,
                failedRate: 0.07,
                timeoutRate: 0.02,
                p95: 12000,
                executions: 100,
            }));

            const result = await runNodeScript(trendScript, [
                `--current-report=${currentReportPath}`,
                `--reference-report=${referenceReportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--max-success-rate-drop=0.03',
                '--max-failed-rate-increase=0.03',
                '--max-timeout-rate-increase=0.02',
                '--max-p95-duration-increase-ms=5000',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.reference.exists, true);
            assert.equal(summary.regressionCount, 0);
            assert.equal(summary.delta.successRate, 0.02);
            assert.equal(summary.delta.failedRate, -0.02);
            assert.equal(summary.delta.timeoutRate, -0.01);
            assert.equal(summary.delta.p95DurationMs, -2000);
        });

        await runCase('trend compare reads thresholds from thresholds file', async () => {
            const caseDir = path.join(tempRoot, 'case-thresholds-file');
            const currentReportPath = path.join(caseDir, 'current.json');
            const referenceReportPath = path.join(caseDir, 'reference.json');
            const thresholdsPath = path.join(caseDir, 'thresholds.json');
            const summaryPath = path.join(caseDir, 'trend.json');

            await writeJson(currentReportPath, createBaselineReport({
                runId: 'current',
                successRate: 0.89,
                failedRate: 0.11,
                timeoutRate: 0.01,
                p95: 10000,
                executions: 100,
            }));
            await writeJson(referenceReportPath, createBaselineReport({
                runId: 'reference',
                successRate: 0.93,
                failedRate: 0.07,
                timeoutRate: 0.01,
                p95: 10000,
                executions: 100,
            }));
            await writeJson(thresholdsPath, {
                schemaVersion: '1.0',
                trend: {
                    maxSuccessRateDrop: 0.03,
                    maxFailedRateIncrease: 0.1,
                    maxTimeoutRateIncrease: 0.1,
                    maxP95DurationIncreaseMs: 100000,
                },
            });

            const result = await runNodeScript(trendScript, [
                `--current-report=${currentReportPath}`,
                `--reference-report=${referenceReportPath}`,
                `--thresholds-file=${thresholdsPath}`,
                `--summary-json-file=${summaryPath}`,
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.equal(summary.inputs.thresholdSources.maxSuccessRateDrop, 'THRESHOLDS_FILE');
            assert.ok(summary.regressions.some((item) => item.includes('successRate drop exceeds threshold')));
        });

        await runCase('trend compare CLI thresholds override thresholds file', async () => {
            const caseDir = path.join(tempRoot, 'case-thresholds-cli-override');
            const currentReportPath = path.join(caseDir, 'current.json');
            const referenceReportPath = path.join(caseDir, 'reference.json');
            const thresholdsPath = path.join(caseDir, 'thresholds.json');
            const summaryPath = path.join(caseDir, 'trend.json');

            await writeJson(currentReportPath, createBaselineReport({
                runId: 'current',
                successRate: 0.89,
                failedRate: 0.11,
                timeoutRate: 0.01,
                p95: 10000,
                executions: 100,
            }));
            await writeJson(referenceReportPath, createBaselineReport({
                runId: 'reference',
                successRate: 0.93,
                failedRate: 0.07,
                timeoutRate: 0.01,
                p95: 10000,
                executions: 100,
            }));
            await writeJson(thresholdsPath, {
                schemaVersion: '1.0',
                trend: {
                    maxSuccessRateDrop: 0.03,
                    maxFailedRateIncrease: 0.1,
                    maxTimeoutRateIncrease: 0.1,
                    maxP95DurationIncreaseMs: 100000,
                },
            });

            const result = await runNodeScript(trendScript, [
                `--current-report=${currentReportPath}`,
                `--reference-report=${referenceReportPath}`,
                `--thresholds-file=${thresholdsPath}`,
                `--summary-json-file=${summaryPath}`,
                '--max-success-rate-drop=0.05',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.inputs.maxSuccessRateDrop, 0.05);
            assert.equal(summary.inputs.thresholdSources.maxSuccessRateDrop, 'CLI_ARG');
        });

        await runCase('trend compare fails when regression exceeds thresholds', async () => {
            const caseDir = path.join(tempRoot, 'case-regression-failed');
            const currentReportPath = path.join(caseDir, 'current.json');
            const referenceReportPath = path.join(caseDir, 'reference.json');
            const summaryPath = path.join(caseDir, 'trend.json');

            await writeJson(currentReportPath, createBaselineReport({
                runId: 'current',
                successRate: 0.85,
                failedRate: 0.15,
                timeoutRate: 0.08,
                p95: 25000,
                executions: 100,
            }));
            await writeJson(referenceReportPath, createBaselineReport({
                runId: 'reference',
                successRate: 0.93,
                failedRate: 0.07,
                timeoutRate: 0.02,
                p95: 12000,
                executions: 100,
            }));

            const result = await runNodeScript(trendScript, [
                `--current-report=${currentReportPath}`,
                `--reference-report=${referenceReportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--max-success-rate-drop=0.03',
                '--max-failed-rate-increase=0.03',
                '--max-timeout-rate-increase=0.02',
                '--max-p95-duration-increase-ms=5000',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(summary.regressionCount >= 3);
            assert.ok(summary.regressions.some((item) => item.includes('successRate drop exceeds threshold')));
            assert.ok(summary.regressions.some((item) => item.includes('failedRate increase exceeds threshold')));
            assert.ok(summary.regressions.some((item) => item.includes('timeoutRate increase exceeds threshold')));
            assert.ok(summary.regressions.some((item) => item.includes('p95 duration increase exceeds threshold')));
        });

        await runCase('trend compare skipped when reference missing and allowed', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-reference-allowed');
            const currentReportPath = path.join(caseDir, 'current.json');
            const missingReferencePath = path.join(caseDir, 'reference-missing.json');
            const summaryPath = path.join(caseDir, 'trend.json');

            await writeJson(currentReportPath, createBaselineReport({
                runId: 'current',
                successRate: 0.92,
                failedRate: 0.08,
                timeoutRate: 0.03,
                p95: 15000,
                executions: 100,
            }));

            const result = await runNodeScript(trendScript, [
                `--current-report=${currentReportPath}`,
                `--reference-report=${missingReferencePath}`,
                `--summary-json-file=${summaryPath}`,
                '--allow-missing-reference',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SKIPPED');
            assert.equal(summary.reference.exists, false);
            assert.equal(summary.warningCount, 1);
            assert.equal(summary.regressionCount, 0);
        });

        await runCase('trend compare fails when reference missing but required', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-reference-required');
            const currentReportPath = path.join(caseDir, 'current.json');
            const missingReferencePath = path.join(caseDir, 'reference-missing.json');
            const summaryPath = path.join(caseDir, 'trend.json');

            await writeJson(currentReportPath, createBaselineReport({
                runId: 'current',
                successRate: 0.92,
                failedRate: 0.08,
                timeoutRate: 0.03,
                p95: 15000,
                executions: 100,
            }));

            const result = await runNodeScript(trendScript, [
                `--current-report=${currentReportPath}`,
                `--reference-report=${missingReferencePath}`,
                `--summary-json-file=${summaryPath}`,
                '--require-reference',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.equal(summary.reference.exists, false);
            assert.ok(summary.validationErrors.some((item) => item.includes('reference report is required but missing')));
        });

        process.stdout.write('\n[self-check] all workflow-execution-baseline-trend cases passed.\n');
    } catch (error) {
        shouldCleanup = false;
        process.stderr.write(`\n[self-check] failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.stderr.write(`[self-check] temp root preserved for debugging: ${tempRoot}\n`);
        process.exitCode = 1;
    } finally {
        if (shouldCleanup) {
            await rm(tempRoot, { recursive: true, force: true });
        }
    }
}

main();
