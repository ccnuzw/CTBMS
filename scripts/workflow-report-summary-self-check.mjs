#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const summaryScript = path.resolve(repoRoot, 'scripts/workflow-report-summary.mjs');

const runNodeScript = (scriptFile, args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptFile, ...args], {
        cwd: repoRoot,
        env: process.env,
        shell: false,
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
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

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-report-summary-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('render success summary json', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            await writeJson(summaryJsonPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'SUCCESS',
                smoke: {
                    status: 'SUCCESS',
                    mode: 'gate',
                },
                perf: {
                    violations: 0,
                },
                qualityGate: {
                    status: 'SUCCESS',
                    runId: 'run-success',
                },
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(summaryScript, [
                `--summary-json-file=${summaryJsonPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('Status: `SUCCESS`'));
            assert.ok(result.output.includes('Validation Error Count: `0`'));
        });

        await runCase('render failure summary json with top errors', async () => {
            const caseDir = path.join(tempRoot, 'case-failed');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            await writeJson(summaryJsonPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                smoke: {
                    status: 'FAILED',
                    mode: 'gate',
                },
                perf: {
                    violations: 2,
                },
                qualityGate: {
                    status: 'FAILED',
                    runId: 'run-failed',
                },
                warnings: ['warn-1', 'warn-2', 'warn-3', 'warn-4'],
                validationErrors: ['err-1', 'err-2', 'err-3', 'err-4'],
            });

            const result = await runNodeScript(summaryScript, [
                `--summary-json-file=${summaryJsonPath}`,
                '--max-items=2',
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('Status: `FAILED`'));
            assert.ok(result.output.includes('Warning Count: `4`'));
            assert.ok(result.output.includes('Validation Error Count: `4`'));
            assert.ok(result.output.includes('### Top Warnings'));
            assert.ok(result.output.includes('- warn-1'));
            assert.ok(result.output.includes('- warn-2'));
            assert.ok(!result.output.includes('- warn-3'));
            assert.ok(result.output.includes('### Top Validation Errors'));
            assert.ok(result.output.includes('- err-1'));
            assert.ok(result.output.includes('- err-2'));
            assert.ok(!result.output.includes('- err-3'));
        });

        process.stdout.write('\n[self-check] all workflow-report-summary cases passed.\n');
    } catch (error) {
        shouldCleanup = false;
        process.stderr.write(
            `\n[self-check] failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.stderr.write(`[self-check] temp root preserved for debugging: ${tempRoot}\n`);
        process.exitCode = 1;
    } finally {
        if (shouldCleanup) {
            await rm(tempRoot, { recursive: true, force: true });
        }
    }
}

main();
