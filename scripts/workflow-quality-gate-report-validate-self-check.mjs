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
const validateScript = path.resolve(repoRoot, 'scripts/workflow-quality-gate-report-validate.mjs');

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

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-quality-gate-report-validate-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('validate success quality gate report', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const reportPath = path.join(caseDir, 'quality-report.json');
            const summaryPath = path.join(caseDir, 'quality-report-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'quality-run-success',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                options: {
                    skipSmoke: true,
                },
                artifacts: {
                    smokeReportFile: 'logs/workflow-smoke-gate-report.json',
                    perfReportFile: 'apps/api/logs/workflow-perf-risk-gate-baseline.json',
                    summaryMarkdownFile: 'logs/workflow-reports-summary.md',
                    summaryJsonFile: 'logs/workflow-reports-summary.json',
                    qualityGateReportFile: reportPath,
                },
                errorMessage: null,
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        status: 'SUCCESS',
                        startedAt: '2026-02-11T00:00:00.200Z',
                        finishedAt: '2026-02-11T00:00:00.600Z',
                        durationMs: 400,
                        exitCode: 0,
                        outputTail: '',
                    },
                    {
                        id: 'summary-json-assert',
                        name: 'workflow summary json assert',
                        command: 'internal',
                        args: ['logs/workflow-reports-summary.json'],
                        status: 'SUCCESS',
                        startedAt: '2026-02-11T00:00:00.601Z',
                        finishedAt: '2026-02-11T00:00:00.700Z',
                        durationMs: 99,
                        exitCode: 0,
                        outputTail: 'summary json assert passed',
                    },
                ],
                summary: {
                    totalSteps: 2,
                    successfulSteps: 2,
                    failedSteps: 0,
                    failedStepIds: [],
                    summaryJsonAssert: {
                        status: 'SUCCESS',
                        reasonCode: 'OK',
                        reason: 'summary json assert passed',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '1.0',
                        summaryStatus: 'SUCCESS',
                        validationErrorCount: 0,
                    },
                },
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
                '--require-summary-json-assert',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.inputs.requireSummaryJsonAssert, true);
            assert.equal(summary.report.schemaVersion, '1.0');
            assert.equal(summary.report.hasSummaryJsonAssert, true);
            assert.equal(Array.isArray(summary.validationErrors), true);
            assert.equal(summary.validationErrors.length, 0);
            assert.equal(summary.failureIndex, null);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCountTotal, 0);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCounts?.REPORT_SCHEMA_MISMATCH, undefined);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeSourceCounts?.NONE, 1);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTotalCount, 0);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTruncatedCount, 0);
            assert.equal(summary.failureIndexDiagnostics?.consistency?.status, 'PASS');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchCount, 0);
            assert.equal(Array.isArray(summary.failureIndexDiagnostics?.consistency?.mismatchReasons), true);
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchReasons?.length, 0);
        });

        await runCase('schema mismatch still writes validation summary', async () => {
            const caseDir = path.join(tempRoot, 'case-schema-mismatch');
            const reportPath = path.join(caseDir, 'quality-report.json');
            const summaryPath = path.join(caseDir, 'quality-report-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '9.9',
                runId: 'quality-run-mismatch',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                options: {},
                artifacts: {
                    smokeReportFile: 'logs/workflow-smoke-gate-report.json',
                    perfReportFile: 'apps/api/logs/workflow-perf-risk-gate-baseline.json',
                    summaryMarkdownFile: 'logs/workflow-reports-summary.md',
                    summaryJsonFile: 'logs/workflow-reports-summary.json',
                    qualityGateReportFile: reportPath,
                },
                errorMessage: null,
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        status: 'SUCCESS',
                        startedAt: '2026-02-11T00:00:00.200Z',
                        finishedAt: '2026-02-11T00:00:00.600Z',
                        durationMs: 400,
                        exitCode: 0,
                        outputTail: '',
                    },
                ],
                summary: {
                    totalSteps: 1,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    summaryJsonAssert: null,
                },
            });

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
            assert.equal(summary.failureIndex?.reasonCode, 'REPORT_SCHEMA_MISMATCH');
            assert.equal(summary.failureIndex?.reasonCodeSource, 'CLASSIFIED_FROM_VALIDATION_ERROR');
            assert.equal(summary.failureIndex?.guidanceVersion, '1.0');
            assert.ok(String(summary.failureIndex?.suggestedCommand || '').includes('pnpm workflow:quality:report:validate'));
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCountTotal, 1);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCounts?.REPORT_SCHEMA_MISMATCH, 1);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeSourceCounts?.CLASSIFIED_FROM_VALIDATION_ERROR, 1);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTotalCount, 1);
            assert.equal(typeof summary.failureIndexDiagnostics?.snapshot?.rawLength, 'number');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.status, 'PASS');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchCount, 0);
        });

        await runCase('report path mismatch fails by default', async () => {
            const caseDir = path.join(tempRoot, 'case-report-path-mismatch');
            const reportPath = path.join(caseDir, 'quality-report.json');
            const summaryPath = path.join(caseDir, 'quality-report-validation.json');
            const mismatchReportPath = path.join(caseDir, 'quality-report-other.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'quality-run-path-mismatch',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                options: {
                    reportFile: mismatchReportPath,
                },
                artifacts: {
                    smokeReportFile: 'logs/workflow-smoke-gate-report.json',
                    perfReportFile: 'apps/api/logs/workflow-perf-risk-gate-baseline.json',
                    summaryMarkdownFile: 'logs/workflow-reports-summary.md',
                    summaryJsonFile: 'logs/workflow-reports-summary.json',
                    qualityGateReportFile: mismatchReportPath,
                },
                errorMessage: null,
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        status: 'SUCCESS',
                        startedAt: '2026-02-11T00:00:00.200Z',
                        finishedAt: '2026-02-11T00:00:00.600Z',
                        durationMs: 400,
                        exitCode: 0,
                        outputTail: '',
                    },
                ],
                summary: {
                    totalSteps: 1,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    summaryJsonAssert: null,
                },
            });

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
                && summary.validationErrors.some((item) => item.includes('report path mismatch')),
            );
            assert.equal(summary.failureIndex?.reasonCode, 'REPORT_PATH_MISMATCH');
            assert.equal(summary.failureIndex?.reasonCodeSource, 'CLASSIFIED_FROM_VALIDATION_ERROR');
            assert.equal(summary.failureIndex?.guidanceVersion, '1.0');
            assert.ok(String(summary.failureIndex?.suggestedCommand || '').includes(`--report-file=${mismatchReportPath}`));
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCounts?.REPORT_PATH_MISMATCH, 1);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeSourceCounts?.CLASSIFIED_FROM_VALIDATION_ERROR, 1);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTotalCount, 1);
            assert.equal(summary.failureIndexDiagnostics?.consistency?.status, 'PASS');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchCount, 0);
        });

        await runCase('report path mismatch can be allowed', async () => {
            const caseDir = path.join(tempRoot, 'case-report-path-mismatch-allowed');
            const reportPath = path.join(caseDir, 'quality-report.json');
            const summaryPath = path.join(caseDir, 'quality-report-validation.json');
            const mismatchReportPath = path.join(caseDir, 'quality-report-other.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'quality-run-path-mismatch-allowed',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                options: {
                    reportFile: mismatchReportPath,
                },
                artifacts: {
                    smokeReportFile: 'logs/workflow-smoke-gate-report.json',
                    perfReportFile: 'apps/api/logs/workflow-perf-risk-gate-baseline.json',
                    summaryMarkdownFile: 'logs/workflow-reports-summary.md',
                    summaryJsonFile: 'logs/workflow-reports-summary.json',
                    qualityGateReportFile: mismatchReportPath,
                },
                errorMessage: null,
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        status: 'SUCCESS',
                        startedAt: '2026-02-11T00:00:00.200Z',
                        finishedAt: '2026-02-11T00:00:00.600Z',
                        durationMs: 400,
                        exitCode: 0,
                        outputTail: '',
                    },
                ],
                summary: {
                    totalSteps: 1,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    summaryJsonAssert: null,
                },
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
                '--allow-report-file-path-mismatch',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.inputs.allowReportFilePathMismatch, true);
            assert.equal(summary.report.reportFilePathMatchesArtifact, false);
            assert.ok(
                Array.isArray(summary.warnings)
                && summary.warnings.some((item) => item.includes('report path mismatch')),
            );
            assert.equal(summary.failureIndex, null);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCountTotal, 0);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeSourceCounts?.NONE, 1);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTotalCount, 0);
            assert.equal(summary.failureIndexDiagnostics?.consistency?.status, 'PASS');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchCount, 0);
        });

        await runCase('require summary json assert fails when missing', async () => {
            const caseDir = path.join(tempRoot, 'case-require-summary-json-assert');
            const reportPath = path.join(caseDir, 'quality-report.json');
            const summaryPath = path.join(caseDir, 'quality-report-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'quality-run-require-summary-json-assert',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'SUCCESS',
                options: {},
                artifacts: {
                    smokeReportFile: 'logs/workflow-smoke-gate-report.json',
                    perfReportFile: 'apps/api/logs/workflow-perf-risk-gate-baseline.json',
                    summaryMarkdownFile: 'logs/workflow-reports-summary.md',
                    summaryJsonFile: 'logs/workflow-reports-summary.json',
                    qualityGateReportFile: reportPath,
                },
                errorMessage: null,
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        status: 'SUCCESS',
                        startedAt: '2026-02-11T00:00:00.200Z',
                        finishedAt: '2026-02-11T00:00:00.600Z',
                        durationMs: 400,
                        exitCode: 0,
                        outputTail: '',
                    },
                ],
                summary: {
                    totalSteps: 1,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    summaryJsonAssert: null,
                },
            });

            const result = await runNodeScript(validateScript, [
                `--report-file=${reportPath}`,
                `--summary-json-file=${summaryPath}`,
                '--expected-report-schema-version=1.0',
                '--require-summary-json-assert',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryPath);
            assert.equal(summary.status, 'FAILED');
            assert.ok(
                Array.isArray(summary.validationErrors)
                && summary.validationErrors.some((item) => item.includes('required by --require-summary-json-assert')),
            );
            assert.equal(summary.failureIndex?.reasonCode, 'SUMMARY_JSON_ASSERT_REQUIRED');
            assert.equal(summary.failureIndex?.reasonCodeSource, 'CLASSIFIED_FROM_VALIDATION_ERROR');
            assert.equal(summary.failureIndex?.guidanceVersion, '1.0');
            assert.ok(String(summary.failureIndex?.suggestedCommand || '').includes('pnpm workflow:quality:gate'));
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCounts?.SUMMARY_JSON_ASSERT_REQUIRED, 1);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTotalCount, 1);
            assert.equal(summary.failureIndexDiagnostics?.consistency?.status, 'PASS');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchCount, 0);
        });

        await runCase('invalid summary contract fails and writes summary json', async () => {
            const caseDir = path.join(tempRoot, 'case-invalid-summary');
            const reportPath = path.join(caseDir, 'quality-report.json');
            const summaryPath = path.join(caseDir, 'quality-report-validation.json');

            await writeJson(reportPath, {
                schemaVersion: '1.0',
                runId: 'quality-run-invalid-summary',
                startedAt: '2026-02-11T00:00:00.000Z',
                finishedAt: '2026-02-11T00:00:01.000Z',
                durationMs: 1000,
                status: 'FAILED',
                options: {},
                artifacts: {
                    smokeReportFile: 'logs/workflow-smoke-gate-report.json',
                    perfReportFile: 'apps/api/logs/workflow-perf-risk-gate-baseline.json',
                    summaryMarkdownFile: 'logs/workflow-reports-summary.md',
                    summaryJsonFile: 'logs/workflow-reports-summary.json',
                    qualityGateReportFile: reportPath,
                },
                errorMessage: 'failed',
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        status: 'FAILED',
                        startedAt: '2026-02-11T00:00:00.200Z',
                        finishedAt: '2026-02-11T00:00:00.600Z',
                        durationMs: 400,
                        exitCode: 1,
                        outputTail: 'failed',
                    },
                ],
                summary: {
                    totalSteps: 1,
                    successfulSteps: 1,
                    failedSteps: 0,
                    failedStepIds: [],
                    summaryJsonAssert: null,
                },
            });

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
                && summary.validationErrors.some((item) => item.includes('summary.successfulSteps mismatch')),
            );
            assert.equal(summary.failureIndex?.reasonCode, 'SUMMARY_COUNTER_MISMATCH');
            assert.equal(summary.failureIndex?.reasonCodeSource, 'CLASSIFIED_FROM_VALIDATION_ERROR');
            assert.equal(summary.failureIndex?.guidanceVersion, '1.0');
            assert.ok(String(summary.failureIndex?.suggestedCommand || '').includes('pnpm workflow:quality:gate'));
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeCountTotal, 3);
            assert.ok((summary.failureIndexDiagnostics?.reasonCodeCounts?.SUMMARY_COUNTER_MISMATCH || 0) >= 1);
            assert.ok((summary.failureIndexDiagnostics?.reasonCodeCounts?.FAILED_STEP_IDS_MISMATCH || 0) >= 1);
            assert.equal(summary.failureIndexDiagnostics?.reasonCodeSourceCounts?.CLASSIFIED_FROM_VALIDATION_ERROR, 1);
            assert.equal(summary.failureIndexDiagnostics?.snapshotTotalCount, 1);
            assert.equal(summary.failureIndexDiagnostics?.consistency?.status, 'PASS');
            assert.equal(summary.failureIndexDiagnostics?.consistency?.mismatchCount, 0);
        });

        process.stdout.write('\n[self-check] all workflow-quality-gate-report-validate cases passed.\n');
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
