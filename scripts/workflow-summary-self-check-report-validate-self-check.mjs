#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const validateScript = path.resolve(repoRoot, 'scripts/workflow-summary-self-check-report-validate.mjs');

const runNodeScript = (scriptFile, args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptFile, ...args], {
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

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-summary-self-check-report-validate-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('validate success report', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const reportPath = path.join(caseDir, 'summary-self-check-report.json');
            const summaryPath = path.join(caseDir, 'summary-self-check-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'run-success',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                reportFile: reportPath,
                summary: {
                    totalSteps: 1,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    failureFingerprint: null,
                },
                steps: [
                    {
                        id: 'report-validate-self-check',
                        name: 'workflow report validate self-check',
                        command: 'pnpm',
                        args: ['workflow:reports:validate:self-check'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'SUCCESS',
                        exitCode: 0,
                        outputTail: 'ok',
                    },
                ],
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 0, result.output);
            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(Array.isArray(summary.validationErrors), true);
            assert.equal(summary.validationErrors.length, 0);
            assert.equal(summary.report.schemaVersion, '1.0');
            assert.equal(summary.report.hasFailureFingerprint, false);
            assert.equal(summary.report.failureFingerprintStepId, null);
            assert.equal(summary.report.failureFingerprintHash, null);
            assert.deepEqual(summary.report.quickLocateCommandSourcePriority, ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A']);
            assert.equal(summary.report.quickLocateCommandSource, 'N/A');
            assert.equal(summary.report.quickLocateFirstFixRoute, 'INSPECT_SELF_CHECK_REPORT_STEPS');
            assert.equal(summary.report.quickLocateCommand, null);
            assert.equal(summary.report.quickLocateFirstFailedOutput, null);
        });

        await runCase('schema mismatch still writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-schema-mismatch');
            const reportPath = path.join(caseDir, 'summary-self-check-report.json');
            const summaryPath = path.join(caseDir, 'summary-self-check-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '9.9',
                runId: 'run-schema-mismatch',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                reportFile: reportPath,
                summary: {
                    totalSteps: 5,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    failureFingerprint: null,
                },
                steps: [
                    {
                        id: 'report-validate-self-check',
                        name: 'workflow report validate self-check',
                        command: 'pnpm',
                        args: ['workflow:reports:validate:self-check'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'SUCCESS',
                        exitCode: 0,
                        outputTail: 'ok',
                    },
                ],
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 1, result.output);
            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(summary.validationErrors.some((item) => item.includes('schema version mismatch')));
            assert.equal(summary.report.hasFailureFingerprint, false);
            assert.equal(summary.report.failureFingerprintStepId, null);
        });

        await runCase('failed report with valid failure fingerprint passes validation', async () => {
            const caseDir = path.join(tempRoot, 'case-failure-fingerprint-pass');
            const reportPath = path.join(caseDir, 'summary-self-check-report.json');
            const summaryPath = path.join(caseDir, 'summary-self-check-validation.json');
            const firstOutputLine = 'failed due sample';
            const signature = 'stepId=report-validate-self-check|exitCode=1|output=failed due sample';
            const hash = createHash('sha256').update(signature).digest('hex');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'run-fingerprint-pass',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'FAILED',
                reportFile: reportPath,
                summary: {
                    totalSteps: 1,
                    successfulSteps: 0,
                    failedSteps: 1,
                    failedStepIds: ['report-validate-self-check'],
                    failureFingerprint: {
                        stepId: 'report-validate-self-check',
                        command: 'pnpm workflow:reports:validate:self-check',
                        exitCode: 1,
                        firstOutputLine,
                        normalizedOutputLine: firstOutputLine,
                        signature,
                        hashAlgorithm: 'sha256',
                        hash,
                    },
                },
                steps: [
                    {
                        id: 'report-validate-self-check',
                        name: 'workflow report validate self-check',
                        command: 'pnpm',
                        args: ['workflow:reports:validate:self-check'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'failed due sample\nmore details',
                    },
                ],
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 0, result.output);
            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.report.hasFailureFingerprint, true);
            assert.equal(summary.report.failureFingerprintStepId, 'report-validate-self-check');
            assert.equal(summary.report.failureFingerprintHashAlgorithm, 'sha256');
            assert.equal(summary.report.failureFingerprintHash, hash);
            assert.deepEqual(summary.report.quickLocateCommandSourcePriority, ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A']);
            assert.equal(summary.report.quickLocateCommandSource, 'STEP_OVERRIDE');
            assert.equal(summary.report.quickLocateFirstFixRoute, 'RERUN_QUICK_LOCATE_COMMAND');
            assert.equal(summary.report.quickLocateCommand, 'pnpm workflow:reports:validate:self-check');
            assert.equal(summary.report.quickLocateFirstFailedOutput, firstOutputLine);
        });

        await runCase('failed report with explicit FAILED_STEP quick locate passes validation', async () => {
            const caseDir = path.join(tempRoot, 'case-quick-locate-failed-step-pass');
            const reportPath = path.join(caseDir, 'summary-self-check-report.json');
            const summaryPath = path.join(caseDir, 'summary-self-check-validation.json');
            const firstOutputLine = 'custom self-check failure';
            const command = 'pnpm workflow:custom:self-check --strict';
            const signature = `stepId=custom-self-check|exitCode=1|output=${firstOutputLine}`;
            const hash = createHash('sha256').update(signature).digest('hex');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'run-quick-locate-failed-step-pass',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'FAILED',
                reportFile: reportPath,
                summary: {
                    totalSteps: 1,
                    successfulSteps: 0,
                    failedSteps: 1,
                    failedStepIds: ['custom-self-check'],
                    quickLocateCommandSourcePriority: ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A'],
                    quickLocateCommandSource: 'FAILED_STEP',
                    quickLocateFirstFixRoute: 'RERUN_FAILED_STEP_COMMAND',
                    quickLocateCommand: command,
                    quickLocateFirstFailedOutput: firstOutputLine,
                    failureFingerprint: {
                        stepId: 'custom-self-check',
                        command,
                        exitCode: 1,
                        firstOutputLine,
                        normalizedOutputLine: firstOutputLine,
                        signature,
                        hashAlgorithm: 'sha256',
                        hash,
                    },
                },
                steps: [
                    {
                        id: 'custom-self-check',
                        name: 'custom self-check',
                        command: 'pnpm',
                        args: ['workflow:custom:self-check', '--strict'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: `${firstOutputLine}\nstack trace line`,
                    },
                ],
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 0, result.output);
            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.report.quickLocateCommandSource, 'FAILED_STEP');
            assert.equal(summary.report.quickLocateFirstFixRoute, 'RERUN_FAILED_STEP_COMMAND');
            assert.equal(summary.report.quickLocateCommand, command);
            assert.equal(summary.report.quickLocateFirstFailedOutput, firstOutputLine);
        });

        await runCase('quick locate route mismatch fails validation', async () => {
            const caseDir = path.join(tempRoot, 'case-quick-locate-route-mismatch');
            const reportPath = path.join(caseDir, 'summary-self-check-report.json');
            const summaryPath = path.join(caseDir, 'summary-self-check-validation.json');
            const firstOutputLine = 'custom mismatch failure';
            const command = 'pnpm workflow:custom:self-check --strict';
            const signature = `stepId=custom-self-check|exitCode=1|output=${firstOutputLine}`;
            const hash = createHash('sha256').update(signature).digest('hex');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'run-quick-locate-route-mismatch',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'FAILED',
                reportFile: reportPath,
                summary: {
                    totalSteps: 1,
                    successfulSteps: 0,
                    failedSteps: 1,
                    failedStepIds: ['custom-self-check'],
                    quickLocateCommandSourcePriority: ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A'],
                    quickLocateCommandSource: 'FAILED_STEP',
                    quickLocateFirstFixRoute: 'RERUN_QUICK_LOCATE_COMMAND',
                    quickLocateCommand: command,
                    quickLocateFirstFailedOutput: firstOutputLine,
                    failureFingerprint: {
                        stepId: 'custom-self-check',
                        command,
                        exitCode: 1,
                        firstOutputLine,
                        normalizedOutputLine: firstOutputLine,
                        signature,
                        hashAlgorithm: 'sha256',
                        hash,
                    },
                },
                steps: [
                    {
                        id: 'custom-self-check',
                        name: 'custom self-check',
                        command: 'pnpm',
                        args: ['workflow:custom:self-check', '--strict'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: `${firstOutputLine}\nstack trace line`,
                    },
                ],
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 1, result.output);
            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(summary.validationErrors.some((item) => item.includes('quickLocateFirstFixRoute must be RERUN_FAILED_STEP_COMMAND')));
        });

        await runCase('invalid report contract still writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-invalid-contract');
            const reportPath = path.join(caseDir, 'summary-self-check-report.json');
            const summaryPath = path.join(caseDir, 'summary-self-check-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'run-invalid-contract',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'FAILED',
                reportFile: reportPath,
                summary: {
                    totalSteps: 5,
                    successfulSteps: 0,
                    failedSteps: 1,
                    failedStepIds: ['report-validate-self-check'],
                },
                steps: [
                    {
                        id: 'report-validate-self-check',
                        name: 'workflow report validate self-check',
                        command: 'pnpm',
                        args: 'invalid-args',
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'failed',
                    },
                ],
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
            ]);
            assert.equal(result.exitCode, 1, result.output);
            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(summary.validationErrors.some((item) => item.includes('step args must be an array')));
            assert.ok(
                summary.validationErrors.some((item) => item.includes('summary.failureFingerprint is required')),
            );
        });

        process.stdout.write('\n[self-check] all workflow-summary-self-check-report-validate cases passed.\n');
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
