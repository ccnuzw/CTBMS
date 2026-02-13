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
const scriptFile = path.resolve(repoRoot, 'scripts/workflow-execution-baseline-reference.mjs');

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

const createBaselineReport = ({ runId = 'wf-baseline', successRate = 0.9 } = {}) => ({
    schemaVersion: '1.0',
    runId,
    startedAt: '2026-02-12T00:00:00.000Z',
    finishedAt: '2026-02-12T00:00:30.000Z',
    durationMs: 30000,
    query: {
        since: '2026-02-05T00:00:00.000Z',
        days: 7,
        batchSize: 1000,
    },
    totals: {
        executions: 10,
        completed: 10,
        running: 0,
        pending: 0,
        success: 9,
        failed: 1,
        canceled: 0,
        timeoutFailures: 0,
    },
    rates: {
        successRate,
        failedRate: 1 - successRate,
        canceledRate: 0,
        timeoutRate: 0,
        completedSuccessRate: successRate,
    },
    latencyMs: {
        sampleCount: 10,
        p50: 1000,
        p90: 1500,
        p95: 2000,
        p99: 2500,
    },
    gate: {
        passed: true,
        evaluated: true,
        thresholds: {
            minSuccessRate: 0.9,
        },
        violations: [],
        warnings: [],
    },
});

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-execution-baseline-reference-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('ensure mode seeds missing reference from current', async () => {
            const caseDir = path.join(tempRoot, 'case-ensure-seed');
            const currentPath = path.join(caseDir, 'current.json');
            const referencePath = path.join(caseDir, 'reference.json');
            const summaryPath = path.join(caseDir, 'summary.json');

            await writeJson(currentPath, createBaselineReport({ runId: 'current-seed' }));

            const result = await runNodeScript(scriptFile, [
                '--mode=ensure',
                `--current-report=${currentPath}`,
                `--reference-report=${referencePath}`,
                `--summary-json-file=${summaryPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            const reference = await readJson(referencePath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.action, 'SEEDED_FROM_CURRENT');
            assert.equal(summary.referenceBefore.exists, false);
            assert.equal(summary.referenceAfter.exists, true);
            assert.equal(reference.runId, 'current-seed');
        });

        await runCase('ensure mode preserves existing reference', async () => {
            const caseDir = path.join(tempRoot, 'case-ensure-preserve');
            const currentPath = path.join(caseDir, 'current.json');
            const referencePath = path.join(caseDir, 'reference.json');
            const summaryPath = path.join(caseDir, 'summary.json');

            await writeJson(currentPath, createBaselineReport({ runId: 'current-preserve', successRate: 0.95 }));
            await writeJson(referencePath, createBaselineReport({ runId: 'reference-preserved', successRate: 0.8 }));

            const result = await runNodeScript(scriptFile, [
                '--mode=ensure',
                `--current-report=${currentPath}`,
                `--reference-report=${referencePath}`,
                `--summary-json-file=${summaryPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            const reference = await readJson(referencePath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.action, 'PRESERVED');
            assert.equal(summary.referenceBefore.exists, true);
            assert.equal(reference.runId, 'reference-preserved');
        });

        await runCase('promote mode overwrites reference from current', async () => {
            const caseDir = path.join(tempRoot, 'case-promote');
            const currentPath = path.join(caseDir, 'current.json');
            const referencePath = path.join(caseDir, 'reference.json');
            const summaryPath = path.join(caseDir, 'summary.json');

            await writeJson(currentPath, createBaselineReport({ runId: 'current-promote', successRate: 0.97 }));
            await writeJson(referencePath, createBaselineReport({ runId: 'reference-old', successRate: 0.75 }));

            const result = await runNodeScript(scriptFile, [
                '--mode=promote',
                `--current-report=${currentPath}`,
                `--reference-report=${referencePath}`,
                `--summary-json-file=${summaryPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            const reference = await readJson(referencePath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.action, 'PROMOTED_FROM_CURRENT');
            assert.equal(reference.runId, 'current-promote');
            assert.equal(reference.rates.successRate, 0.97);
        });

        await runCase('missing current report fails and still writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-current');
            const currentPath = path.join(caseDir, 'current-missing.json');
            const referencePath = path.join(caseDir, 'reference.json');
            const summaryPath = path.join(caseDir, 'summary.json');

            const result = await runNodeScript(scriptFile, [
                '--mode=ensure',
                `--current-report=${currentPath}`,
                `--reference-report=${referencePath}`,
                `--summary-json-file=${summaryPath}`,
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(summary.validationErrors.some((item) => item.includes('current report missing')));
            assert.equal(summary.referenceAfter.exists, false);
        });

        process.stdout.write('\n[self-check] all workflow-execution-baseline-reference cases passed.\n');
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
