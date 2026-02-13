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
const scriptFile = path.resolve(repoRoot, 'scripts/workflow-staging-precheck-summary.mjs');

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
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-staging-precheck-summary-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('staging precheck summary succeeds with complete reports', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const baselinePath = path.join(caseDir, 'baseline.json');
            const baselineValidationPath = path.join(caseDir, 'baseline-validation.json');
            const referenceOperationPath = path.join(caseDir, 'reference-operation.json');
            const trendPath = path.join(caseDir, 'trend.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            await writeJson(baselinePath, {
                schemaVersion: '1.0',
                runId: 'run-1',
                startedAt: '2026-02-12T00:00:00.000Z',
                finishedAt: '2026-02-12T00:00:10.000Z',
                query: {
                    since: '2026-02-11T00:00:00.000Z',
                },
                totals: {
                    executions: 10,
                    completed: 10,
                    success: 9,
                    failed: 1,
                    canceled: 0,
                    timeoutFailures: 0,
                },
                rates: {
                    successRate: 0.9,
                    failedRate: 0.1,
                    canceledRate: 0,
                    timeoutRate: 0,
                    completedSuccessRate: 0.9,
                },
                latencyMs: {
                    p50: 1000,
                    p90: 2000,
                    p95: 3000,
                    p99: 4000,
                },
                gate: {
                    evaluated: true,
                    passed: true,
                    violations: [],
                    warnings: [],
                },
            });
            await writeJson(baselineValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:00:20.000Z',
                status: 'SUCCESS',
                inputs: {
                    reportFile: 'baseline.json',
                },
                report: {
                    schemaVersion: '1.0',
                    runId: 'run-1',
                    gatePassed: true,
                    gateEvaluated: true,
                    violationsCount: 0,
                    warningsCount: 0,
                },
                warnings: [],
                validationErrors: [],
            });
            await writeJson(referenceOperationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:00:30.000Z',
                status: 'SUCCESS',
                mode: 'ensure',
                action: 'PRESERVED',
                inputs: {
                    currentReportFile: 'baseline.json',
                    referenceReportFile: 'reference.json',
                },
                current: {
                    exists: true,
                    runId: 'run-1',
                },
                referenceBefore: {
                    exists: true,
                    runId: 'run-0',
                },
                referenceAfter: {
                    exists: true,
                    runId: 'run-0',
                },
                warnings: [],
                validationErrors: [],
            });
            await writeJson(trendPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:00:40.000Z',
                status: 'SUCCESS',
                inputs: {
                    currentReportFile: 'baseline.json',
                    referenceReportFile: 'reference.json',
                },
                current: {
                    exists: true,
                    runId: 'run-1',
                },
                reference: {
                    exists: true,
                    runId: 'run-0',
                },
                delta: {
                    successRate: 0.01,
                },
                regressions: [],
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(scriptFile, [
                `--baseline-report-file=${baselinePath}`,
                `--baseline-validation-file=${baselineValidationPath}`,
                `--reference-operation-file=${referenceOperationPath}`,
                `--trend-file=${trendPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryJsonPath);
            const markdown = await readFile(summaryMarkdownPath, 'utf-8');
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.components.baselineReport.status, 'SUCCESS');
            assert.equal(summary.components.baselineValidation.status, 'SUCCESS');
            assert.equal(summary.components.referenceOperation.status, 'SUCCESS');
            assert.equal(summary.components.trend.status, 'SUCCESS');
            assert.ok(markdown.includes('## Workflow Staging Precheck Summary'));
            assert.ok(markdown.includes('## Workflow Execution Baseline'));
            assert.ok(markdown.includes('## Workflow Execution Baseline Validation'));
            assert.ok(markdown.includes('## Workflow Execution Baseline Reference Operation'));
            assert.ok(markdown.includes('## Workflow Execution Baseline Trend'));
        });

        await runCase('staging precheck summary fails when trend report missing', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-trend');
            const baselinePath = path.join(caseDir, 'baseline.json');
            const baselineValidationPath = path.join(caseDir, 'baseline-validation.json');
            const referenceOperationPath = path.join(caseDir, 'reference-operation.json');
            const trendPath = path.join(caseDir, 'trend.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            await writeJson(baselinePath, {
                schemaVersion: '1.0',
                runId: 'run-2',
                startedAt: '2026-02-12T00:00:00.000Z',
                finishedAt: '2026-02-12T00:00:10.000Z',
                query: {
                    since: '2026-02-11T00:00:00.000Z',
                },
                totals: {
                    executions: 10,
                    completed: 10,
                    success: 10,
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
                    p99: 2500,
                },
                gate: {
                    evaluated: true,
                    passed: true,
                    violations: [],
                    warnings: [],
                },
            });
            await writeJson(baselineValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:00:20.000Z',
                status: 'SUCCESS',
                warnings: [],
                validationErrors: [],
            });
            await writeJson(referenceOperationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:00:30.000Z',
                status: 'SUCCESS',
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(scriptFile, [
                `--baseline-report-file=${baselinePath}`,
                `--baseline-validation-file=${baselineValidationPath}`,
                `--reference-operation-file=${referenceOperationPath}`,
                `--trend-file=${trendPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryJsonPath);
            const markdown = await readFile(summaryMarkdownPath, 'utf-8');
            assert.equal(summary.status, 'FAILED');
            assert.equal(summary.components.trend.exists, false);
            assert.ok(summary.validationErrors.some((item) => item.includes('trend report missing')));
            assert.ok(markdown.includes('workflow execution baseline trend file not found'));
        });

        process.stdout.write('\n[self-check] all workflow-staging-precheck-summary cases passed.\n');
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
