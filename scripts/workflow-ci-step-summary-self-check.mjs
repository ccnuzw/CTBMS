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
const summaryScript = path.resolve(repoRoot, 'scripts/workflow-ci-step-summary.mjs');

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

const findLine = (output, prefix) => output
    .split('\n')
    .find((line) => line.startsWith(prefix)) || '';

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-ci-step-summary-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('render all summary blocks', async () => {
            const caseDir = path.join(tempRoot, 'case-all-blocks');
            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const qualityReportValidationPath = path.join(caseDir, 'quality-report-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const selfCheckReportPath = path.join(caseDir, 'self-check-report.json');
            const selfCheckValidationPath = path.join(caseDir, 'self-check-validation.json');

            await writeJson(qualityReportPath, {
                status: 'SUCCESS',
                runId: 'run-ci-summary',
                durationMs: 12.34,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: [],
                    summaryJsonAssert: {
                        status: 'SUCCESS',
                        reasonCode: 'OK',
                        reason: 'pass',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '1.0',
                        summaryStatus: 'SUCCESS',
                        validationErrorCount: 0,
                    },
                },
            });
            await writeFile(summaryMarkdownPath, '# Markdown Summary\n\nOK\n', 'utf-8');
            await writeJson(qualityReportValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'SUCCESS',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'SUCCESS',
                    failedStepIds: [],
                    hasSummaryJsonAssert: true,
                    reportFilePathMatchesArtifact: true,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 0,
                },
                warnings: [],
                validationErrors: [],
            });
            await writeJson(summaryJsonPath, {
                status: 'SUCCESS',
                warnings: [],
                validationErrors: [],
            });
            await writeJson(selfCheckReportPath, {
                status: 'SUCCESS',
                runId: 'self-check-run',
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 7,
                    failedSteps: 0,
                    failedStepIds: [],
                },
                steps: [],
            });
            await writeJson(selfCheckValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'SUCCESS',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'SUCCESS',
                    failedStepIds: [],
                },
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${qualityReportPath}`,
                `--quality-report-validation-file=${qualityReportValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--self-check-report-file=${selfCheckReportPath}`,
                `--self-check-validation-file=${selfCheckValidationPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('## Workflow Quick Locate Index'));
            assert.ok(result.output.includes('Quality Gate Status: `SUCCESS`'));
            assert.ok(result.output.includes('Quality Validation Status: `SUCCESS`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Validation Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source Priority: `VALIDATION_FAILURE_INDEX > FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `N/A`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `INSPECT_QUALITY_REPORT_STEPS_AND_FAILURE_INDEX`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Quality Gate First Failed Output: `N/A`'));
            assert.ok(result.output.includes('Self-Check Status: `SUCCESS`'));
            assert.ok(result.output.includes('Self-Check Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Self-Check Suggested Command Source Priority: `FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Self-Check Suggested Command Source: `N/A`'));
            assert.ok(result.output.includes('Self-Check First Fix Route: `INSPECT_SELF_CHECK_REPORT_STEPS`'));
            assert.ok(result.output.includes('Self-Check Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Self-Check First Failed Output: `N/A`'));
            assert.ok(result.output.includes('## Workflow Quality Gate'));
            assert.ok(result.output.includes('Summary JSON Assert Code: `OK`'));
            assert.ok(result.output.includes('## Workflow Quality Gate Report Validation'));
            assert.ok(result.output.includes('Report Summary JSON Assert: `true`'));
            assert.ok(result.output.includes('Report File Path Matches Artifact: `true`'));
            assert.ok(result.output.includes('Artifact/Options Path Mismatch Count: `0`'));
            assert.ok(result.output.includes('First Failure Reason Code: `N/A`'));
            assert.ok(result.output.includes('Failure Reason Source: `N/A`'));
            assert.ok(result.output.includes('Guidance Version: `N/A`'));
            assert.ok(result.output.includes('Suggested Action: `N/A`'));
            assert.ok(result.output.includes('Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Failure Index Snapshot: `N/A`'));
            assert.ok(result.output.includes('Failure Index Snapshot Raw Length: `0`'));
            assert.ok(result.output.includes('Failure Index Snapshot Max Chars: `320`'));
            assert.ok(result.output.includes('Failure Index Snapshot Truncated: `false`'));
            assert.ok(result.output.includes('Diagnostics Reason Code Count Total: `0`'));
            assert.ok(result.output.includes('Diagnostics Reason Code Counts: `N/A`'));
            assert.ok(result.output.includes('Diagnostics Reason Source Count Total: `1`'));
            assert.ok(result.output.includes('Diagnostics Reason Source Counts: `NONE=1`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Total Count: `0`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Truncated Count: `0`'));
            assert.ok(result.output.includes('Diagnostics Consistency Source: `COMPUTED`'));
            assert.ok(result.output.includes('Diagnostics Consistency Status: `PASS`'));
            assert.ok(result.output.includes('Diagnostics Consistency Mismatch Count: `0`'));
            assert.ok(result.output.includes('Diagnostics Consistency Reasons: `N/A`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Max Chars: `320`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Raw Length: `0`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Truncated: `false`'));
            assert.ok(result.output.includes('# Markdown Summary'));
            assert.ok(result.output.includes('## Workflow Report Validation (JSON)'));
            assert.ok(result.output.includes('## Workflow Summary Self-Check Suite'));
            assert.ok(result.output.includes('Failed Step IDs: `N/A`'));
            assert.ok(result.output.includes('First Failed Step: `N/A`'));
            assert.ok(result.output.includes('Quick Locate Command Source Priority: `STEP_OVERRIDE > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Quick Locate Command Source: `N/A`'));
            assert.ok(result.output.includes('Quick Locate First Fix Route: `INSPECT_SELF_CHECK_REPORT_STEPS`'));
            assert.ok(result.output.includes('Quick Locate Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Quick Locate First Failed Output: `N/A`'));
            assert.ok(result.output.includes('Failure Fingerprint Source: `N/A`'));
            assert.ok(result.output.includes('Failure Fingerprint Step: `N/A`'));
            assert.ok(result.output.includes('Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('## Workflow Summary Self-Check Report Validation'));
            assert.ok(result.output.includes('Expected Report Schema Version: `1.0`'));
            assert.ok(result.output.includes('Report Quick Locate Command Source Priority: `N/A`'));
            assert.ok(result.output.includes('Report Quick Locate Command Source: `N/A`'));
            assert.ok(result.output.includes('Report Quick Locate First Fix Route: `N/A`'));
            assert.ok(result.output.includes('Report Quick Locate Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Report Quick Locate First Failed Output: `N/A`'));
            assert.ok(result.output.includes('Report Failure Fingerprint: `N/A`'));
            assert.ok(result.output.includes('Report Failure Fingerprint Step: `N/A`'));
        });

        await runCase('render legacy failureIndex compatibility in quality validation block', async () => {
            const caseDir = path.join(tempRoot, 'case-legacy-failure-index');
            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const qualityReportValidationPath = path.join(caseDir, 'quality-report-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const selfCheckReportPath = path.join(caseDir, 'self-check-report.json');
            const selfCheckValidationPath = path.join(caseDir, 'self-check-validation.json');

            await writeJson(qualityReportPath, {
                status: 'FAILED',
                runId: 'run-legacy-ci-summary',
                durationMs: 12.34,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: ['report-validate'],
                    summaryJsonAssert: {
                        status: 'FAILED',
                        reasonCode: 'SCHEMA_MISMATCH',
                        reason: 'legacy sample',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '9.9',
                        summaryStatus: 'FAILED',
                        validationErrorCount: 1,
                    },
                },
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'quality fingerprint first line\nquality stack trace line 2',
                    },
                ],
            });
            await writeJson(qualityReportValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate'],
                    hasSummaryJsonAssert: true,
                    reportFilePathMatchesArtifact: false,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 0,
                },
                failureIndex: {
                    reasonCode: 'REPORT_PATH_MISMATCH',
                    message: 'legacy path mismatch message',
                    suggestedAction: 'legacy action',
                    suggestedCommand: 'legacy command',
                },
                warnings: [],
                validationErrors: [
                    'Quality gate report path mismatch: input logs/workflow-quality-gate-report.json vs artifacts.qualityGateReportFile logs/workflow-quality-gate-report.actual.json.',
                ],
            });
            await writeFile(summaryMarkdownPath, '# Markdown Summary\n\nLegacy\n', 'utf-8');
            await writeJson(summaryJsonPath, {
                status: 'FAILED',
                warnings: [],
                validationErrors: ['legacy-error'],
            });
            await writeJson(selfCheckReportPath, {
                status: 'SUCCESS',
                runId: 'self-check-run-legacy',
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 7,
                    failedSteps: 0,
                    failedStepIds: [],
                },
                steps: [],
            });
            await writeJson(selfCheckValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'SUCCESS',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'SUCCESS',
                    failedStepIds: [],
                },
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${qualityReportPath}`,
                `--quality-report-validation-file=${qualityReportValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--self-check-report-file=${selfCheckReportPath}`,
                `--self-check-validation-file=${selfCheckValidationPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('First Failure Reason Code: `REPORT_PATH_MISMATCH`'));
            assert.ok(result.output.includes('Failure Reason Source: `EXPLICIT_FAILURE_REASON_CODE`'));
            assert.ok(result.output.includes('Guidance Version: `1.0`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(!result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `VALIDATION_FAILURE_INDEX`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `RUN_QUALITY_VALIDATION_SUGGESTED_COMMAND`'));
            assert.ok(result.output.includes('Suggested Action: `legacy action`'));
            assert.ok(result.output.includes('Suggested Command: `legacy command`'));
            assert.ok(result.output.includes('Failure Index Snapshot: `{"reasonCode":"REPORT_PATH_MISMATCH","reasonCodeSource":"EXPLICIT_FAILURE_REASON_CODE","guidanceVersion":"1.0","message":"legacy path mismatch message","suggestedAction":"legacy action","suggestedCommand":"legacy command"}`'));
            assert.ok(result.output.includes('Failure Index Snapshot Raw Length: `222`'));
            assert.ok(result.output.includes('Failure Index Snapshot Max Chars: `320`'));
            assert.ok(result.output.includes('Failure Index Snapshot Truncated: `false`'));
            assert.ok(result.output.includes('Diagnostics Reason Code Count Total: `1`'));
            assert.ok(result.output.includes('Diagnostics Reason Code Counts: `REPORT_PATH_MISMATCH=1`'));
            assert.ok(result.output.includes('Diagnostics Reason Source Count Total: `1`'));
            assert.ok(result.output.includes('Diagnostics Reason Source Counts: `EXPLICIT_FAILURE_REASON_CODE=1`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Total Count: `1`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Truncated Count: `0`'));
            assert.ok(result.output.includes('Diagnostics Consistency Source: `COMPUTED`'));
            assert.ok(result.output.includes('Diagnostics Consistency Status: `PASS`'));
            assert.ok(result.output.includes('Diagnostics Consistency Mismatch Count: `0`'));
            assert.ok(result.output.includes('Diagnostics Consistency Reasons: `N/A`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Max Chars: `320`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Raw Length: `222`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Truncated: `false`'));
        });

        await runCase('render diagnostics consistency failed in quality validation block', async () => {
            const caseDir = path.join(tempRoot, 'case-consistency-failed');
            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const qualityReportValidationPath = path.join(caseDir, 'quality-report-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const selfCheckReportPath = path.join(caseDir, 'self-check-report.json');
            const selfCheckValidationPath = path.join(caseDir, 'self-check-validation.json');

            await writeJson(qualityReportPath, {
                status: 'FAILED',
                runId: 'run-consistency-failed',
                durationMs: 12.34,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: ['report-validate'],
                    summaryJsonAssert: {
                        status: 'FAILED',
                        reasonCode: 'SCHEMA_MISMATCH',
                        reason: 'consistency failed sample',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '9.9',
                        summaryStatus: 'FAILED',
                        validationErrorCount: 1,
                    },
                },
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate', '--strict'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'quality computed fallback first line\nquality computed stack trace line 2',
                    },
                ],
            });
            await writeJson(qualityReportValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate'],
                    hasSummaryJsonAssert: true,
                    reportFilePathMatchesArtifact: false,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 0,
                },
                failureIndex: {
                    reasonCode: 'REPORT_PATH_MISMATCH',
                    reasonCodeSource: 'EXPLICIT_FAILURE_REASON_CODE',
                    guidanceVersion: '1.0',
                    message: 'legacy path mismatch message',
                    suggestedAction: 'legacy action',
                },
                failureIndexDiagnostics: {
                    reasonCodeCountTotal: 2,
                    reasonCodeCounts: {
                        REPORT_PATH_MISMATCH: 1,
                    },
                    reasonCodeSourceCountTotal: 1,
                    reasonCodeSourceCounts: {
                        EXPLICIT_FAILURE_REASON_CODE: 1,
                    },
                    snapshotTotalCount: 1,
                    snapshotTruncatedCount: 0,
                    snapshot: {
                        maxChars: 320,
                        rawLength: 222,
                        truncated: false,
                    },
                    consistency: {
                        status: 'FAILED',
                        mismatchCount: 2,
                        mismatchReasons: [
                            'reasonCodeCountTotal mismatch: expected 1, actual 2.',
                            'reasonCodeCountTotal vs reasonCodeCounts mismatch: total=2, mapTotal=1.',
                        ],
                    },
                },
                warnings: [],
                validationErrors: [
                    'Quality gate report path mismatch: input logs/workflow-quality-gate-report.json vs artifacts.qualityGateReportFile logs/workflow-quality-gate-report.actual.json.',
                ],
            });
            await writeFile(summaryMarkdownPath, '# Markdown Summary\n\nConsistency Failed\n', 'utf-8');
            await writeJson(summaryJsonPath, {
                status: 'FAILED',
                warnings: [],
                validationErrors: ['consistency-failed-error'],
            });
            await writeJson(selfCheckReportPath, {
                status: 'SUCCESS',
                runId: 'self-check-run-consistency',
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 7,
                    failedSteps: 0,
                    failedStepIds: [],
                },
                steps: [],
            });
            await writeJson(selfCheckValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'SUCCESS',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'SUCCESS',
                    failedStepIds: [],
                },
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${qualityReportPath}`,
                `--quality-report-validation-file=${qualityReportValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--self-check-report-file=${selfCheckReportPath}`,
                `--self-check-validation-file=${selfCheckValidationPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(!result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `RUN_QUALITY_FINGERPRINT_COMMAND`'));
            assert.ok(result.output.includes('Diagnostics Consistency Source: `SUMMARY`'));
            assert.ok(result.output.includes('Diagnostics Consistency Status: `FAILED`'));
            assert.ok(result.output.includes('Diagnostics Consistency Mismatch Count: `2`'));
            assert.ok(result.output.includes('Diagnostics Consistency Reasons: `reasonCodeCountTotal mismatch: expected 1, actual 2. | reasonCodeCountTotal vs reasonCodeCounts mismatch: total=2, mapTotal=1.`'));
        });

        await runCase('render failure index snapshot with truncation option', async () => {
            const caseDir = path.join(tempRoot, 'case-snapshot-truncation');
            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const qualityReportValidationPath = path.join(caseDir, 'quality-report-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const selfCheckReportPath = path.join(caseDir, 'self-check-report.json');
            const selfCheckValidationPath = path.join(caseDir, 'self-check-validation.json');

            await writeJson(qualityReportPath, {
                status: 'FAILED',
                runId: 'run-snapshot-truncation',
                durationMs: 12.34,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: ['report-validate'],
                    summaryJsonAssert: {
                        status: 'FAILED',
                        reasonCode: 'SCHEMA_MISMATCH',
                        reason: 'snapshot truncation sample',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '9.9',
                        summaryStatus: 'FAILED',
                        validationErrorCount: 1,
                    },
                },
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate', '--strict'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'quality computed fallback first line\nquality computed stack trace line 2',
                    },
                ],
            });
            await writeJson(qualityReportValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate'],
                    hasSummaryJsonAssert: true,
                    reportFilePathMatchesArtifact: false,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 0,
                },
                failureIndex: {
                    reasonCode: 'REPORT_PATH_MISMATCH',
                    message: 'legacy path mismatch message for truncation scenario',
                    suggestedAction: 'legacy action',
                    suggestedCommand: 'legacy command with very long tail --arg1=value1 --arg2=value2 --arg3=value3 --arg4=value4 --arg5=value5',
                },
                warnings: [],
                validationErrors: [
                    'Quality gate report path mismatch: input logs/workflow-quality-gate-report.json vs artifacts.qualityGateReportFile logs/workflow-quality-gate-report.actual.json.',
                ],
            });
            await writeFile(summaryMarkdownPath, '# Markdown Summary\n\nTruncation\n', 'utf-8');
            await writeJson(summaryJsonPath, {
                status: 'FAILED',
                warnings: [],
                validationErrors: ['snapshot-truncation-error'],
            });
            await writeJson(selfCheckReportPath, {
                status: 'SUCCESS',
                runId: 'self-check-run-truncation',
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 7,
                    failedSteps: 0,
                    failedStepIds: [],
                },
                steps: [],
            });
            await writeJson(selfCheckValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'SUCCESS',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'SUCCESS',
                    failedStepIds: [],
                },
                warnings: [],
                validationErrors: [],
            });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${qualityReportPath}`,
                `--quality-report-validation-file=${qualityReportValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--self-check-report-file=${selfCheckReportPath}`,
                `--self-check-validation-file=${selfCheckValidationPath}`,
                '--failure-index-snapshot-max-chars=120',
            ]);
            assert.equal(result.exitCode, 0, result.output);
            const snapshotLine = findLine(result.output, '- Failure Index Snapshot: `');
            assert.ok(snapshotLine.includes('Failure Index Snapshot: `{"reasonCode":"REPORT_PATH_MISMATCH"'));
            assert.ok(snapshotLine.endsWith('...`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(!result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `VALIDATION_FAILURE_INDEX`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `RUN_QUALITY_VALIDATION_SUGGESTED_COMMAND`'));
            assert.ok(result.output.includes('Failure Index Snapshot Max Chars: `120`'));
            assert.ok(result.output.includes('Failure Index Snapshot Truncated: `true`'));
            assert.ok(result.output.includes('Diagnostics Reason Code Count Total: `1`'));
            assert.ok(result.output.includes('Diagnostics Reason Code Counts: `REPORT_PATH_MISMATCH=1`'));
            assert.ok(result.output.includes('Diagnostics Reason Source Count Total: `1`'));
            assert.ok(result.output.includes('Diagnostics Reason Source Counts: `EXPLICIT_FAILURE_REASON_CODE=1`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Total Count: `1`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Truncated Count: `1`'));
            assert.ok(result.output.includes('Diagnostics Consistency Source: `COMPUTED`'));
            assert.ok(result.output.includes('Diagnostics Consistency Status: `PASS`'));
            assert.ok(result.output.includes('Diagnostics Consistency Mismatch Count: `0`'));
            assert.ok(result.output.includes('Diagnostics Consistency Reasons: `N/A`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Max Chars: `120`'));
            assert.ok(result.output.includes('Diagnostics Snapshot Contract Truncated: `true`'));
        });

        await runCase('render quick locate index with self-check failure fingerprint hash', async () => {
            const caseDir = path.join(tempRoot, 'case-self-check-fingerprint-hash');
            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const qualityReportValidationPath = path.join(caseDir, 'quality-report-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const selfCheckReportPath = path.join(caseDir, 'self-check-report.json');
            const selfCheckValidationPath = path.join(caseDir, 'self-check-validation.json');
            const fingerprintHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

            await writeJson(qualityReportPath, {
                status: 'FAILED',
                runId: 'run-self-check-fingerprint-hash',
                durationMs: 12.34,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: ['report-validate'],
                    summaryJsonAssert: {
                        status: 'FAILED',
                        reasonCode: 'SCHEMA_MISMATCH',
                        reason: 'fingerprint hash sample',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '9.9',
                        summaryStatus: 'FAILED',
                        validationErrorCount: 1,
                    },
                },
            });
            await writeJson(qualityReportValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate'],
                    hasSummaryJsonAssert: true,
                    reportFilePathMatchesArtifact: false,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 0,
                },
                failureIndex: {
                    reasonCode: 'REPORT_PATH_MISMATCH',
                    reasonCodeSource: 'EXPLICIT_FAILURE_REASON_CODE',
                    guidanceVersion: '1.0',
                    message: 'legacy path mismatch message',
                    suggestedAction: 'legacy action',
                    suggestedCommand: 'legacy command',
                },
                warnings: [],
                validationErrors: [
                    'Quality gate report path mismatch: input logs/workflow-quality-gate-report.json vs artifacts.qualityGateReportFile logs/workflow-quality-gate-report.actual.json.',
                ],
            });
            await writeFile(summaryMarkdownPath, '# Markdown Summary\n\nSelfCheckFingerprint\n', 'utf-8');
            await writeJson(summaryJsonPath, {
                status: 'FAILED',
                warnings: [],
                validationErrors: ['self-check-fingerprint-error'],
            });
            await writeJson(selfCheckReportPath, {
                status: 'FAILED',
                runId: 'self-check-run-fingerprint-hash',
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 6,
                    failedSteps: 1,
                    failedStepIds: ['report-validate-self-check'],
                    quickLocateCommandSourcePriority: ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A'],
                    quickLocateCommandSource: 'FAILED_STEP',
                    quickLocateFirstFixRoute: 'RERUN_FAILED_STEP_COMMAND',
                    quickLocateCommand: 'pnpm workflow:reports:validate:self-check --case=fingerprint',
                    quickLocateFirstFailedOutput: 'sample failure line from summary quick locate',
                    failureFingerprint: {
                        stepId: 'report-validate-self-check',
                        command: 'pnpm workflow:reports:validate:self-check',
                        exitCode: 1,
                        firstOutputLine: 'sample failure line',
                        normalizedOutputLine: 'sample failure line',
                        signature: 'stepId=report-validate-self-check|exitCode=1|output=sample failure line',
                        hashAlgorithm: 'sha256',
                        hash: fingerprintHash,
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
                        outputTail: 'sample failure line',
                    },
                ],
            });
            await writeJson(selfCheckValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate-self-check'],
                    quickLocateCommandSourcePriority: ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A'],
                    quickLocateCommandSource: 'FAILED_STEP',
                    quickLocateFirstFixRoute: 'RERUN_FAILED_STEP_COMMAND',
                    quickLocateCommand: 'pnpm workflow:reports:validate:self-check --case=fingerprint',
                    quickLocateFirstFailedOutput: 'sample validation quick locate output',
                    hasFailureFingerprint: true,
                    failureFingerprintStepId: 'report-validate-self-check',
                    failureFingerprintHashAlgorithm: 'sha256',
                    failureFingerprintHash: fingerprintHash,
                },
                warnings: [],
                validationErrors: ['sample validation error'],
            });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${qualityReportPath}`,
                `--quality-report-validation-file=${qualityReportValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--self-check-report-file=${selfCheckReportPath}`,
                `--self-check-validation-file=${selfCheckValidationPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('## Workflow Quick Locate Index'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Validation Suggested Command: `legacy command`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source Priority: `VALIDATION_FAILURE_INDEX > FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `VALIDATION_FAILURE_INDEX`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `RUN_QUALITY_VALIDATION_SUGGESTED_COMMAND`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command: `legacy command`'));
            assert.ok(result.output.includes('Quality Gate First Failed Output: `N/A`'));
            assert.ok(result.output.includes('Self-Check Failed Steps: `report-validate-self-check`'));
            assert.ok(result.output.includes('Self-Check Failure Fingerprint Source: `SUMMARY`'));
            assert.ok(result.output.includes('Self-Check Failure Fingerprint Step: `report-validate-self-check`'));
            assert.ok(result.output.includes(`Self-Check Failure Fingerprint Hash: \`${fingerprintHash}\``));
            assert.ok(result.output.includes('Self-Check Suggested Command Source Priority: `FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Self-Check Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(result.output.includes('Self-Check First Fix Route: `RUN_SELF_CHECK_FINGERPRINT_COMMAND`'));
            assert.ok(result.output.includes('Self-Check Suggested Command: `pnpm workflow:reports:validate:self-check`'));
            assert.ok(result.output.includes('Self-Check First Failed Output: `sample failure line`'));
            assert.ok(result.output.includes('Self-Check Validation Status: `FAILED`'));
            assert.ok(result.output.includes(`Self-Check Validation Fingerprint Hash: \`${fingerprintHash}\``));
            assert.ok(result.output.includes('First Failed Suggested Action: `pnpm workflow:reports:validate:self-check --case=fingerprint`'));
            assert.ok(result.output.includes('Report Quick Locate Command Source Priority: `STEP_OVERRIDE > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Report Quick Locate Command Source: `FAILED_STEP`'));
            assert.ok(result.output.includes('Report Quick Locate First Fix Route: `RERUN_FAILED_STEP_COMMAND`'));
            assert.ok(result.output.includes('Report Quick Locate Suggested Command: `pnpm workflow:reports:validate:self-check --case=fingerprint`'));
            assert.ok(result.output.includes('Report Quick Locate First Failed Output: `sample validation quick locate output`'));
            assert.ok(result.output.includes('Quick Locate Command Source Priority: `STEP_OVERRIDE > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Quick Locate Command Source: `FAILED_STEP`'));
            assert.ok(result.output.includes('Quick Locate First Fix Route: `RERUN_FAILED_STEP_COMMAND`'));
            assert.ok(result.output.includes('Quick Locate Suggested Command: `pnpm workflow:reports:validate:self-check --case=fingerprint`'));
            assert.ok(result.output.includes('Quick Locate First Failed Output: `sample failure line from summary quick locate`'));
        });

        await runCase('render quick locate index with computed fallback when self-check fingerprint is missing', async () => {
            const caseDir = path.join(tempRoot, 'case-self-check-computed-fallback');
            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const qualityReportValidationPath = path.join(caseDir, 'quality-report-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const selfCheckReportPath = path.join(caseDir, 'self-check-report.json');
            const selfCheckValidationPath = path.join(caseDir, 'self-check-validation.json');

            await writeJson(qualityReportPath, {
                status: 'FAILED',
                runId: 'run-self-check-computed-fallback',
                durationMs: 12.34,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: ['report-validate'],
                    summaryJsonAssert: {
                        status: 'FAILED',
                        reasonCode: 'SCHEMA_MISMATCH',
                        reason: 'computed fallback sample',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '9.9',
                        summaryStatus: 'FAILED',
                        validationErrorCount: 1,
                    },
                },
                steps: [
                    {
                        id: 'report-validate',
                        name: 'workflow report validate',
                        command: 'pnpm',
                        args: ['workflow:reports:validate', '--strict'],
                        startedAt: '2026-02-11T00:00:00.000Z',
                        finishedAt: '2026-02-11T00:00:00.200Z',
                        durationMs: 200,
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'quality computed fallback first line\nquality computed stack trace line 2',
                    },
                ],
            });
            await writeJson(qualityReportValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate'],
                    hasSummaryJsonAssert: true,
                    reportFilePathMatchesArtifact: false,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 0,
                },
                failureIndex: {
                    reasonCode: 'REPORT_PATH_MISMATCH',
                    reasonCodeSource: 'EXPLICIT_FAILURE_REASON_CODE',
                    guidanceVersion: '1.0',
                    message: 'legacy path mismatch message',
                    suggestedAction: 'legacy action',
                },
                warnings: [],
                validationErrors: [
                    'Quality gate report path mismatch: input logs/workflow-quality-gate-report.json vs artifacts.qualityGateReportFile logs/workflow-quality-gate-report.actual.json.',
                ],
            });
            await writeFile(summaryMarkdownPath, '# Markdown Summary\n\nSelfCheckComputedFallback\n', 'utf-8');
            await writeJson(summaryJsonPath, {
                status: 'FAILED',
                warnings: [],
                validationErrors: ['self-check-computed-fallback-error'],
            });
            await writeJson(selfCheckReportPath, {
                status: 'FAILED',
                runId: 'self-check-run-computed-fallback',
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 6,
                    failedSteps: 1,
                    failedStepIds: ['report-validate-self-check'],
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
                        status: 'FAILED',
                        exitCode: 1,
                        outputTail: 'computed fallback first line\nstack trace line 2',
                    },
                ],
            });
            await writeJson(selfCheckValidationPath, {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '1.0',
                    status: 'FAILED',
                    failedStepIds: ['report-validate-self-check'],
                    hasFailureFingerprint: false,
                    failureFingerprintStepId: null,
                    failureFingerprintHashAlgorithm: null,
                    failureFingerprintHash: null,
                },
                warnings: [],
                validationErrors: ['sample validation error'],
            });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${qualityReportPath}`,
                `--quality-report-validation-file=${qualityReportValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--self-check-report-file=${selfCheckReportPath}`,
                `--self-check-validation-file=${selfCheckValidationPath}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('## Workflow Quick Locate Index'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(!result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Validation Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `RUN_QUALITY_FINGERPRINT_COMMAND`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command: `pnpm workflow:reports:validate --strict`'));
            assert.ok(result.output.includes('Quality Gate First Failed Output: `quality computed fallback first line`'));
            assert.ok(result.output.includes('Self-Check Failed Steps: `report-validate-self-check`'));
            assert.ok(result.output.includes('Self-Check Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(result.output.includes('Self-Check Failure Fingerprint Step: `report-validate-self-check`'));
            assert.ok(result.output.includes('Self-Check Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(result.output.includes('Self-Check First Fix Route: `RUN_SELF_CHECK_FINGERPRINT_COMMAND`'));
            assert.ok(result.output.includes('Self-Check Suggested Command: `pnpm workflow:reports:validate:self-check`'));
            assert.ok(result.output.includes('Self-Check First Failed Output: `computed fallback first line`'));
            assert.ok(result.output.includes('Self-Check Validation Status: `FAILED`'));
            assert.ok(result.output.includes('Self-Check Validation Fingerprint Hash: `N/A`'));
            assert.ok(!result.output.includes('Self-Check Failure Fingerprint Hash: `N/A`'));
        });

        await runCase('render missing file fallbacks', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-files');
            await mkdir(caseDir, { recursive: true });

            const result = await runNodeScript(summaryScript, [
                `--quality-report-file=${path.join(caseDir, 'quality-report.json')}`,
                `--quality-report-validation-file=${path.join(caseDir, 'quality-report-validation.json')}`,
                `--summary-markdown-file=${path.join(caseDir, 'summary.md')}`,
                `--summary-json-file=${path.join(caseDir, 'summary.json')}`,
                `--self-check-report-file=${path.join(caseDir, 'self-check-report.json')}`,
                `--self-check-validation-file=${path.join(caseDir, 'self-check-validation.json')}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('## Workflow Quick Locate Index'));
            assert.ok(result.output.includes('Quality Gate Status: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Source: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Step: `N/A`'));
            assert.ok(result.output.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source Priority: `VALIDATION_FAILURE_INDEX > FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command Source: `N/A`'));
            assert.ok(result.output.includes('Quality Gate First Fix Route: `INSPECT_QUALITY_REPORT_STEPS_AND_FAILURE_INDEX`'));
            assert.ok(result.output.includes('Quality Gate Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Quality Gate First Failed Output: `N/A`'));
            assert.ok(result.output.includes('Self-Check Failure Fingerprint Hash: `N/A`'));
            assert.ok(result.output.includes('Self-Check Suggested Command Source Priority: `FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(result.output.includes('Self-Check Suggested Command Source: `N/A`'));
            assert.ok(result.output.includes('Self-Check First Fix Route: `INSPECT_SELF_CHECK_REPORT_STEPS`'));
            assert.ok(result.output.includes('Self-Check Suggested Command: `N/A`'));
            assert.ok(result.output.includes('Self-Check First Failed Output: `N/A`'));
            assert.ok(result.output.includes('workflow quality gate report file not found'));
            assert.ok(result.output.includes('workflow quality gate report validation file not found'));
            assert.ok(result.output.includes('workflow report summary file not found'));
            assert.ok(result.output.includes('workflow report summary json file not found'));
            assert.ok(result.output.includes('workflow summary self-check report file not found'));
            assert.ok(result.output.includes('workflow summary self-check validation file not found'));
        });

        process.stdout.write('\n[self-check] all workflow-ci-step-summary cases passed.\n');
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
