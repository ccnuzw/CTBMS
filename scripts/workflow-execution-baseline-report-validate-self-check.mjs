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
const validateScript = path.resolve(repoRoot, 'scripts/workflow-execution-baseline-report-validate.mjs');

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

const createReport = ({
    schemaVersion = '1.0',
    gatePassed = true,
    gateWarnings = [],
    violations = [],
} = {}) => ({
    schemaVersion,
    runId: 'execution-baseline-self-check',
    startedAt: '2026-02-12T00:00:00.000Z',
    finishedAt: '2026-02-12T00:00:01.000Z',
    durationMs: 1000,
    query: {
        since: '2026-02-05T00:00:00.000Z',
        days: 7,
        batchSize: 1000,
    },
    totals: {
        executions: 20,
        completed: 20,
        running: 0,
        pending: 0,
        success: 18,
        failed: 2,
        canceled: 0,
        timeoutFailures: 1,
    },
    rates: {
        successRate: 0.9,
        failedRate: 0.1,
        canceledRate: 0,
        timeoutRate: 0.05,
        completedSuccessRate: 0.9,
    },
    latencyMs: {
        sampleCount: 20,
        p50: 1200,
        p90: 2400,
        p95: 3000,
        p99: 5000,
    },
    gate: {
        passed: gatePassed,
        evaluated: true,
        thresholds: {
            minSuccessRate: 0.9,
            maxFailureRate: 0.1,
            maxCanceledRate: 0.1,
            maxTimeoutRate: 0.05,
            maxP95DurationMs: 60000,
        },
        violations,
        warnings: gateWarnings,
    },
});

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-execution-baseline-report-validate-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('validate success execution baseline report', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const reportPath = path.join(caseDir, 'execution-baseline-report.json');
            const summaryPath = path.join(caseDir, 'execution-baseline-validation.json');

            await writeJson(reportPath, createReport());

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
                '--require-gate-pass',
                '--require-gate-evaluated',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.inputs.requireGatePass, true);
            assert.equal(summary.inputs.requireGateEvaluated, true);
            assert.equal(summary.validationErrorCount, 0);
            assert.equal(summary.warningCount, 0);
            assert.equal(summary.report.gatePassed, true);
            assert.equal(summary.report.gateEvaluated, true);
            assert.equal(summary.report.totalExecutions, 20);
            assert.equal(summary.report.successRate, 0.9);
            assert.equal(summary.report.failedRate, 0.1);
            assert.equal(summary.report.timeoutRate, 0.05);
        });

        await runCase('require gate pass fails when gate failed', async () => {
            const caseDir = path.join(tempRoot, 'case-require-gate-pass-failed');
            const reportPath = path.join(caseDir, 'execution-baseline-report.json');
            const summaryPath = path.join(caseDir, 'execution-baseline-validation.json');

            await writeJson(reportPath, createReport({
                gatePassed: false,
                violations: ['failedRate=0.2 > maxFailureRate=0.1'],
            }));

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
                '--require-gate-pass',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(
                Array.isArray(summary.validationErrors)
                && summary.validationErrors.some((item) => item.includes('gate.passed must be true')),
            );
            assert.equal(summary.report.gatePassed, false);
            assert.equal(summary.report.violationsCount, 1);
        });

        await runCase('require no warnings fails when gate warnings exist', async () => {
            const caseDir = path.join(tempRoot, 'case-require-no-warnings-failed');
            const reportPath = path.join(caseDir, 'execution-baseline-report.json');
            const summaryPath = path.join(caseDir, 'execution-baseline-validation.json');

            await writeJson(reportPath, createReport({
                gateWarnings: ['rate-thresholds-skipped: no execution samples in selected window'],
            }));

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
                '--require-no-warnings',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(
                Array.isArray(summary.validationErrors)
                && summary.validationErrors.some((item) => item.includes('gate.warnings must be empty')),
            );
            assert.equal(summary.report.warningsCount, 1);
        });

        await runCase('schema mismatch still writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-schema-mismatch');
            const reportPath = path.join(caseDir, 'execution-baseline-report.json');
            const summaryPath = path.join(caseDir, 'execution-baseline-validation.json');

            await writeJson(reportPath, createReport({ schemaVersion: '9.9' }));

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(
                Array.isArray(summary.validationErrors)
                && summary.validationErrors.some((item) => item.includes('schema version mismatch')),
            );
            assert.equal(summary.report.schemaVersion, '9.9');
        });

        process.stdout.write('\n[self-check] all workflow-execution-baseline-report-validate cases passed.\n');
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
