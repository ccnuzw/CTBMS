#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptFile = path.resolve(repoRoot, 'scripts/workflow-execution-baseline-reference-ci-state.mjs');

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

const readJson = async (targetPath) => JSON.parse(await readFile(targetPath, 'utf-8'));

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-execution-baseline-reference-ci-state-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('success state with promote success', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const summaryPath = path.join(caseDir, 'summary.json');
            await mkdir(caseDir, { recursive: true });

            const result = await runNodeScript(scriptFile, [
                `--summary-json-file=${summaryPath}`,
                '--cache-restore-outcome=success',
                '--cache-save-outcome=success',
                '--cache-hit=true',
                '--execution-baseline-gate-outcome=success',
                '--execution-baseline-report-validate-outcome=success',
                '--reference-ensure-outcome=success',
                '--trend-outcome=success',
                '--reference-promote-outcome=success',
                '--workflow-run-id=123',
                '--workflow-run-attempt=1',
                '--repository=foo/bar',
                '--ref-name=main',
                '--sha=abc',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.referenceLifecycle.cacheHit, true);
            assert.equal(summary.referenceLifecycle.referencePromoteOutcome, 'success');
            assert.equal(summary.warningCount, 0);
            assert.equal(summary.validationErrorCount, 0);
        });

        await runCase('partial state with cache miss and promote skipped', async () => {
            const caseDir = path.join(tempRoot, 'case-partial');
            const summaryPath = path.join(caseDir, 'summary.json');
            await mkdir(caseDir, { recursive: true });

            const result = await runNodeScript(scriptFile, [
                `--summary-json-file=${summaryPath}`,
                '--cache-restore-outcome=success',
                '--cache-save-outcome=skipped',
                '--cache-hit=false',
                '--execution-baseline-gate-outcome=success',
                '--execution-baseline-report-validate-outcome=success',
                '--reference-ensure-outcome=success',
                '--trend-outcome=success',
                '--reference-promote-outcome=skipped',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.referenceLifecycle.cacheHit, false);
            assert.equal(summary.referenceLifecycle.referencePromoteOutcome, 'skipped');
            assert.ok(summary.warnings.some((item) => item.includes('cache miss')));
            assert.ok(summary.warnings.some((item) => item.includes('promote skipped')));
            assert.ok(summary.warnings.some((item) => item.includes('cache save skipped')));
        });

        await runCase('missing required outcomes fails but writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-failed-missing-required');
            const summaryPath = path.join(caseDir, 'summary.json');
            await mkdir(caseDir, { recursive: true });

            const result = await runNodeScript(scriptFile, [
                `--summary-json-file=${summaryPath}`,
                '--cache-restore-outcome=success',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(summary.validationErrors.some((item) => item.includes('execution baseline gate outcome is required')));
            assert.ok(summary.validationErrors.some((item) => item.includes('trend outcome is required')));
        });

        process.stdout.write('\n[self-check] all workflow-execution-baseline-reference-ci-state cases passed.\n');
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
