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
const scriptFile = path.resolve(repoRoot, 'scripts/workflow-staging-full-summary.mjs');

const runNodeScript = (targetScript, scriptArgs) => new Promise((resolve) => {
    const child = spawn(process.execPath, [targetScript, ...scriptArgs], {
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

const readJson = async (targetPath) => JSON.parse(await readFile(targetPath, 'utf-8'));

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-staging-full-summary-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('staging full summary succeeds with complete reports', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const precheckSummaryPath = path.join(caseDir, 'precheck-summary.json');
            const smokeReportPath = path.join(caseDir, 'smoke-report.json');
            const rollbackBaselinePath = path.join(caseDir, 'rollback-baseline.json');
            const rollbackValidationPath = path.join(caseDir, 'rollback-validation.json');
            const rollbackTrendPath = path.join(caseDir, 'rollback-trend.json');
            const ciSummaryPath = path.join(caseDir, 'ci-step-summary.md');
            const ciSummaryValidationPath = path.join(caseDir, 'ci-step-summary-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            await writeJson(precheckSummaryPath, { schemaVersion: '1.0', status: 'SUCCESS' });
            await writeJson(smokeReportPath, { schemaVersion: '1.1', status: 'SUCCESS' });
            await writeJson(rollbackBaselinePath, {
                schemaVersion: '1.0',
                runId: 'run-rollback',
                startedAt: '2026-02-12T00:00:00.000Z',
                finishedAt: '2026-02-12T00:00:10.000Z',
                query: {
                    since: '2026-02-11T00:00:00.000Z',
                },
                totals: {
                    executions: 4,
                    completed: 4,
                    success: 4,
                    failed: 0,
                    canceled: 0,
                    timeoutFailures: 0,
                },
                rates: {
                    successRate: 1,
                    failedRate: 0,
                    canceledRate: 0,
                    timeoutRate: 0,
                    completedSuccessRate: 1,
                },
                latencyMs: {
                    p50: 1000,
                    p90: 1500,
                    p95: 2000,
                    p99: 2200,
                },
                gate: {
                    evaluated: true,
                    passed: true,
                    violations: [],
                    warnings: [],
                },
            });
            await writeJson(rollbackValidationPath, {
                schemaVersion: '1.0',
                status: 'SUCCESS',
                report: {
                    gatePassed: true,
                    gateEvaluated: true,
                    runId: 'run-rollback',
                    warningsCount: 0,
                    violationsCount: 0,
                },
            });
            await writeJson(rollbackTrendPath, {
                schemaVersion: '1.0',
                status: 'SUCCESS',
                current: {
                    exists: true,
                    runId: 'run-rollback',
                },
                reference: {
                    exists: true,
                    runId: 'run-reference',
                },
                delta: {
                    successRate: 0,
                    failedRate: 0,
                    timeoutRate: 0,
                    p95DurationMs: 0,
                },
                regressions: [],
            });
            await writeFile(ciSummaryPath, '## Workflow Execution Baseline\n\n- ok\n', 'utf-8');
            await writeJson(ciSummaryValidationPath, {
                schemaVersion: '1.0',
                status: 'SUCCESS',
                report: {
                    missingSections: [],
                },
            });

            const result = await runNodeScript(scriptFile, [
                `--precheck-summary-file=${precheckSummaryPath}`,
                `--rollback-smoke-report-file=${smokeReportPath}`,
                `--rollback-baseline-report-file=${rollbackBaselinePath}`,
                `--rollback-baseline-validation-file=${rollbackValidationPath}`,
                `--rollback-baseline-trend-file=${rollbackTrendPath}`,
                `--ci-step-summary-file=${ciSummaryPath}`,
                `--ci-step-summary-validation-file=${ciSummaryValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryJsonPath);
            const markdown = await readFile(summaryMarkdownPath, 'utf-8');
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.components.precheckSummary.status, 'SUCCESS');
            assert.equal(summary.components.rollbackSmoke.status, 'SUCCESS');
            assert.equal(summary.components.rollbackBaselineReport.status, 'SUCCESS');
            assert.equal(summary.components.rollbackBaselineValidation.status, 'SUCCESS');
            assert.equal(summary.components.rollbackBaselineTrend.status, 'SUCCESS');
            assert.equal(summary.components.ciStepSummaryValidation.status, 'SUCCESS');
            assert.equal(summary.validationErrorCount, 0);
            assert.ok(markdown.includes('## Workflow Staging Full Drill Summary'));
            assert.ok(markdown.includes('## Workflow CI Step Summary Snapshot'));
        });

        await runCase('staging full summary fails when ci summary validation missing', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-ci-validation');
            const precheckSummaryPath = path.join(caseDir, 'precheck-summary.json');
            const smokeReportPath = path.join(caseDir, 'smoke-report.json');
            const rollbackBaselinePath = path.join(caseDir, 'rollback-baseline.json');
            const rollbackValidationPath = path.join(caseDir, 'rollback-validation.json');
            const rollbackTrendPath = path.join(caseDir, 'rollback-trend.json');
            const ciSummaryPath = path.join(caseDir, 'ci-step-summary.md');
            const ciSummaryValidationPath = path.join(caseDir, 'ci-step-summary-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            await writeJson(precheckSummaryPath, { schemaVersion: '1.0', status: 'SUCCESS' });
            await writeJson(smokeReportPath, { schemaVersion: '1.1', status: 'SUCCESS' });
            await writeJson(rollbackBaselinePath, {
                schemaVersion: '1.0',
                gate: { evaluated: true, passed: true, violations: [], warnings: [] },
                totals: { executions: 0, completed: 0, success: 0, failed: 0, canceled: 0, timeoutFailures: 0 },
                rates: { successRate: 0, failedRate: 0, canceledRate: 0, timeoutRate: 0, completedSuccessRate: 0 },
                latencyMs: { p50: 0, p90: 0, p95: 0, p99: 0 },
                query: { since: '2026-02-11T00:00:00.000Z' },
            });
            await writeJson(rollbackValidationPath, { schemaVersion: '1.0', status: 'SUCCESS', report: { gatePassed: true, gateEvaluated: true } });
            await writeJson(rollbackTrendPath, { schemaVersion: '1.0', status: 'SUCCESS', regressions: [] });
            await writeFile(ciSummaryPath, '## Workflow Execution Baseline\n\n- ok\n', 'utf-8');

            const result = await runNodeScript(scriptFile, [
                `--precheck-summary-file=${precheckSummaryPath}`,
                `--rollback-smoke-report-file=${smokeReportPath}`,
                `--rollback-baseline-report-file=${rollbackBaselinePath}`,
                `--rollback-baseline-validation-file=${rollbackValidationPath}`,
                `--rollback-baseline-trend-file=${rollbackTrendPath}`,
                `--ci-step-summary-file=${ciSummaryPath}`,
                `--ci-step-summary-validation-file=${ciSummaryValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryJsonPath);
            assert.equal(summary.status, 'FAILED');
            assert.equal(summary.components.ciStepSummaryValidation.exists, false);
            assert.ok(
                summary.validationErrors.some((item) => item.includes('CI step summary validation missing')),
            );
        });

        process.stdout.write('\n[self-check] all workflow-staging-full-summary cases passed.\n');
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
