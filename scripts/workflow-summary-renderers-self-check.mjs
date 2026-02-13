#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
    QUALITY_GATE_FIRST_FIX_ROUTE,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE_PRIORITY,
    SELF_CHECK_FIRST_FIX_ROUTE,
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE,
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE_PRIORITY,
    extractSummaryJsonAssert,
    renderQualityGateSummaryMarkdown,
    renderWorkflowExecutionBaselineReferenceCiStateMarkdown,
    renderWorkflowExecutionBaselineReferenceOperationMarkdown,
    renderWorkflowExecutionBaselineValidationMarkdown,
    renderWorkflowExecutionBaselineTrendMarkdown,
    renderWorkflowQuickLocateIndexMarkdown,
    renderWorkflowQualityGateReportValidationMarkdown,
    renderWorkflowReportValidationSummaryMarkdown,
    renderWorkflowSummarySelfCheckValidationMarkdown,
    renderWorkflowSummarySelfCheckMarkdown,
} from './workflow-summary-renderers.mjs';

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    try {
        await runCase('extract summary-json-assert with summary priority', async () => {
            const report = {
                summary: {
                    summaryJsonAssert: {
                        status: 'SUCCESS',
                        reasonCode: 'OK',
                        reason: 'all good',
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '1.0',
                        summaryStatus: 'SUCCESS',
                        validationErrorCount: 0,
                    },
                },
                steps: [
                    {
                        id: 'summary-json-assert',
                        status: 'FAILED',
                        outputTail: 'should not override summary reason',
                    },
                ],
            };

            const extracted = extractSummaryJsonAssert(report);
            assert.equal(extracted.status, 'SUCCESS');
            assert.equal(extracted.reasonCode, 'OK');
            assert.equal(extracted.reason, 'all good');
            assert.equal(extracted.expectedSchemaVersion, '1.0');
            assert.equal(extracted.actualSchemaVersion, '1.0');
            assert.equal(extracted.summaryStatus, 'SUCCESS');
            assert.equal(extracted.validationErrorCount, '0');
        });

        await runCase('extract summary-json-assert with step fallback', async () => {
            const report = {
                summary: {},
                steps: [
                    {
                        id: 'summary-json-assert',
                        status: 'FAILED',
                        outputTail: 'schema mismatch details from step output',
                    },
                ],
            };

            const extracted = extractSummaryJsonAssert(report);
            assert.equal(extracted.status, 'FAILED');
            assert.equal(extracted.reasonCode, 'N/A');
            assert.equal(extracted.reason, 'schema mismatch details from step output');
            assert.equal(extracted.expectedSchemaVersion, 'N/A');
            assert.equal(extracted.actualSchemaVersion, 'N/A');
        });

        await runCase('render quality summary with reason truncation', async () => {
            const report = {
                status: 'FAILED',
                runId: 'run-renderer',
                durationMs: 42.1,
                artifacts: {
                    smokeReportFile: 'logs/smoke.json',
                    perfReportFile: 'logs/perf.json',
                    summaryMarkdownFile: 'logs/summary.md',
                    summaryJsonFile: 'logs/summary.json',
                },
                summary: {
                    failedStepIds: ['summary-json-assert'],
                    summaryJsonAssert: {
                        status: 'FAILED',
                        reasonCode: 'SCHEMA_MISMATCH',
                        reason: 'x'.repeat(20),
                        expectedSchemaVersion: '1.0',
                        actualSchemaVersion: '9.9',
                        summaryStatus: 'FAILED',
                        validationErrorCount: 1,
                    },
                },
            };

            const markdown = renderQualityGateSummaryMarkdown(report, { maxReasonChars: 8 });
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Failed Steps: `summary-json-assert`'));
            assert.ok(markdown.includes('Summary JSON Assert Code: `SCHEMA_MISMATCH`'));
            assert.ok(markdown.includes('Summary JSON Assert Reason: `xxxxxxxx`'));
            assert.ok(!markdown.includes('xxxxxxxxx'));
        });

        await runCase('render validation summary top items limit', async () => {
            const summary = {
                status: 'FAILED',
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                smoke: {
                    status: 'FAILED',
                    mode: 'gate',
                },
                perf: {
                    violations: 3,
                },
                qualityGate: {
                    status: 'FAILED',
                    runId: 'run-1',
                },
                warnings: ['warn-1', 'warn-2', 'warn-3'],
                validationErrors: ['err-1', 'err-2', 'err-3'],
            };

            const markdown = renderWorkflowReportValidationSummaryMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Warning Count: `3`'));
            assert.ok(markdown.includes('Validation Error Count: `3`'));
            assert.ok(markdown.includes('- warn-1'));
            assert.ok(markdown.includes('- warn-2'));
            assert.ok(!markdown.includes('- warn-3'));
            assert.ok(markdown.includes('- err-1'));
            assert.ok(markdown.includes('- err-2'));
            assert.ok(!markdown.includes('- err-3'));
        });

        await runCase('render workflow execution baseline validation summary', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:10:00.000Z',
                status: 'FAILED',
                validationErrorCount: 3,
                warningCount: 2,
                inputs: {
                    reportFile: 'logs/workflow-execution-baseline-report.json',
                    expectedReportSchemaVersion: '1.0',
                    requireGatePass: true,
                    requireGateEvaluated: true,
                    requireNoWarnings: false,
                },
                report: {
                    schemaVersion: '1.0',
                    runId: 'wf-exec-baseline',
                    gatePassed: false,
                    gateEvaluated: true,
                    violationsCount: 2,
                    warningsCount: 1,
                    totalExecutions: 30,
                    completedExecutions: 30,
                    successRate: 0.8,
                    failedRate: 0.2,
                    canceledRate: 0,
                    timeoutRate: 0.1,
                    p95DurationMs: 12000,
                    querySince: '2026-02-05T00:00:00.000Z',
                    queryDays: 7,
                },
                validationErrors: ['error-1', 'error-2', 'error-3'],
                warnings: ['warn-1', 'warn-2', 'warn-3'],
            };

            const markdown = renderWorkflowExecutionBaselineValidationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('## Workflow Execution Baseline Validation'));
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Validation Error Count: `3`'));
            assert.ok(markdown.includes('Warning Count: `2`'));
            assert.ok(markdown.includes('Require Gate Pass: `true`'));
            assert.ok(markdown.includes('Require Gate Evaluated: `true`'));
            assert.ok(markdown.includes('Require No Warnings: `false`'));
            assert.ok(markdown.includes('Report Gate Passed: `false`'));
            assert.ok(markdown.includes('Report Gate Evaluated: `true`'));
            assert.ok(markdown.includes('Report Success Rate: `0.8`'));
            assert.ok(markdown.includes('Report P95 Duration(ms): `12000`'));
            assert.ok(markdown.includes('### Top Validation Errors'));
            assert.ok(markdown.includes('- error-1'));
            assert.ok(markdown.includes('- error-2'));
            assert.ok(!markdown.includes('- error-3'));
            assert.ok(markdown.includes('### Top Warnings'));
            assert.ok(markdown.includes('- warn-1'));
            assert.ok(markdown.includes('- warn-2'));
            assert.ok(!markdown.includes('- warn-3'));
        });

        await runCase('render workflow execution baseline reference operation summary', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:11:00.000Z',
                status: 'SUCCESS',
                mode: 'ensure',
                action: 'SEEDED_FROM_CURRENT',
                inputs: {
                    currentReportFile: 'logs/workflow-execution-baseline-report.json',
                    referenceReportFile: 'logs/workflow-execution-baseline-reference.json',
                    summaryJsonFile: 'logs/workflow-execution-baseline-reference-operation.json',
                },
                current: {
                    exists: true,
                    runId: 'current-run',
                    finishedAt: '2026-02-12T00:10:30.000Z',
                    successRate: 0.91,
                    failedRate: 0.09,
                    timeoutRate: 0.01,
                    p95DurationMs: 9000,
                },
                referenceBefore: {
                    exists: false,
                    runId: null,
                    successRate: null,
                    failedRate: null,
                    timeoutRate: null,
                    p95DurationMs: null,
                },
                referenceAfter: {
                    exists: true,
                    runId: 'current-run',
                    successRate: 0.91,
                    failedRate: 0.09,
                    timeoutRate: 0.01,
                    p95DurationMs: 9000,
                },
                warningCount: 2,
                validationErrorCount: 3,
                warnings: ['warn-1', 'warn-2', 'warn-3'],
                validationErrors: ['error-1', 'error-2', 'error-3'],
            };

            const markdown = renderWorkflowExecutionBaselineReferenceOperationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('## Workflow Execution Baseline Reference Operation'));
            assert.ok(markdown.includes('Status: `SUCCESS`'));
            assert.ok(markdown.includes('Mode: `ensure`'));
            assert.ok(markdown.includes('Action: `SEEDED_FROM_CURRENT`'));
            assert.ok(markdown.includes('Current Run ID: `current-run`'));
            assert.ok(markdown.includes('Reference Before Exists: `false`'));
            assert.ok(markdown.includes('Reference After Exists: `true`'));
            assert.ok(markdown.includes('Reference After Run ID: `current-run`'));
            assert.ok(markdown.includes('Validation Error Count: `3`'));
            assert.ok(markdown.includes('Warning Count: `2`'));
            assert.ok(markdown.includes('### Top Validation Errors'));
            assert.ok(markdown.includes('- error-1'));
            assert.ok(markdown.includes('- error-2'));
            assert.ok(!markdown.includes('- error-3'));
            assert.ok(markdown.includes('### Top Warnings'));
            assert.ok(markdown.includes('- warn-1'));
            assert.ok(markdown.includes('- warn-2'));
            assert.ok(!markdown.includes('- warn-3'));
        });

        await runCase('render workflow execution baseline reference CI state summary', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:11:30.000Z',
                status: 'PARTIAL',
                ci: {
                    repository: 'foo/bar',
                    refName: 'main',
                    sha: 'abc123',
                    workflowRunId: '123',
                    workflowRunAttempt: '2',
                },
                referenceLifecycle: {
                    cacheRestoreOutcome: 'success',
                    cacheSaveOutcome: 'skipped',
                    cacheHit: false,
                    referenceEnsureOutcome: 'success',
                    trendOutcome: 'success',
                    referencePromoteOutcome: 'skipped',
                },
                upstream: {
                    executionBaselineGateOutcome: 'success',
                    executionBaselineReportValidateOutcome: 'success',
                },
                warningCount: 2,
                validationErrorCount: 3,
                warnings: ['warn-1', 'warn-2', 'warn-3'],
                validationErrors: ['error-1', 'error-2', 'error-3'],
            };

            const markdown = renderWorkflowExecutionBaselineReferenceCiStateMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('## Workflow Execution Baseline Reference CI State'));
            assert.ok(markdown.includes('Status: `PARTIAL`'));
            assert.ok(markdown.includes('Repository: `foo/bar`'));
            assert.ok(markdown.includes('Cache Hit: `false`'));
            assert.ok(markdown.includes('Reference Promote Outcome: `skipped`'));
            assert.ok(markdown.includes('Validation Error Count: `3`'));
            assert.ok(markdown.includes('Warning Count: `2`'));
            assert.ok(markdown.includes('### Top Validation Errors'));
            assert.ok(markdown.includes('- error-1'));
            assert.ok(markdown.includes('- error-2'));
            assert.ok(!markdown.includes('- error-3'));
            assert.ok(markdown.includes('### Top Warnings'));
            assert.ok(markdown.includes('- warn-1'));
            assert.ok(markdown.includes('- warn-2'));
            assert.ok(!markdown.includes('- warn-3'));
        });

        await runCase('render workflow execution baseline trend summary', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-12T00:12:00.000Z',
                status: 'FAILED',
                inputs: {
                    currentReportFile: 'logs/workflow-execution-baseline-report.json',
                    referenceReportFile: 'logs/workflow-execution-baseline-reference.json',
                    allowMissingReference: true,
                    requireReference: false,
                    maxSuccessRateDrop: 0.05,
                    maxFailedRateIncrease: 0.05,
                    maxTimeoutRateIncrease: 0.02,
                    maxP95DurationIncreaseMs: 10000,
                },
                current: {
                    exists: true,
                    runId: 'current-run',
                    successRate: 0.9,
                    failedRate: 0.1,
                    timeoutRate: 0.05,
                    p95DurationMs: 15000,
                },
                reference: {
                    exists: true,
                    runId: 'reference-run',
                    successRate: 0.95,
                    failedRate: 0.05,
                    timeoutRate: 0.02,
                    p95DurationMs: 10000,
                },
                delta: {
                    successRate: -0.05,
                    failedRate: 0.05,
                    timeoutRate: 0.03,
                    p95DurationMs: 5000,
                },
                regressionCount: 2,
                warningCount: 2,
                validationErrorCount: 3,
                regressions: ['regression-1', 'regression-2', 'regression-3'],
                validationErrors: ['error-1', 'error-2', 'error-3'],
                warnings: ['warn-1', 'warn-2', 'warn-3'],
            };

            const markdown = renderWorkflowExecutionBaselineTrendMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('## Workflow Execution Baseline Trend'));
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Current Run ID: `current-run`'));
            assert.ok(markdown.includes('Reference Run ID: `reference-run`'));
            assert.ok(markdown.includes('Delta Success Rate: `-0.05`'));
            assert.ok(markdown.includes('Regression Count: `2`'));
            assert.ok(markdown.includes('Validation Error Count: `3`'));
            assert.ok(markdown.includes('Warning Count: `2`'));
            assert.ok(markdown.includes('### Top Regressions'));
            assert.ok(markdown.includes('- regression-1'));
            assert.ok(markdown.includes('- regression-2'));
            assert.ok(!markdown.includes('- regression-3'));
            assert.ok(markdown.includes('### Top Validation Errors'));
            assert.ok(markdown.includes('- error-1'));
            assert.ok(markdown.includes('- error-2'));
            assert.ok(!markdown.includes('- error-3'));
            assert.ok(markdown.includes('### Top Warnings'));
            assert.ok(markdown.includes('- warn-1'));
            assert.ok(markdown.includes('- warn-2'));
            assert.ok(!markdown.includes('- warn-3'));
        });

        await runCase('quick locate suggested command source enum contract', async () => {
            assert.deepEqual(QUALITY_GATE_SUGGESTED_COMMAND_SOURCE, {
                VALIDATION_FAILURE_INDEX: 'VALIDATION_FAILURE_INDEX',
                FAILURE_FINGERPRINT: 'FAILURE_FINGERPRINT',
                FAILED_STEP: 'FAILED_STEP',
                NOT_AVAILABLE: 'N/A',
            });
            assert.deepEqual(SELF_CHECK_SUGGESTED_COMMAND_SOURCE, {
                FAILURE_FINGERPRINT: 'FAILURE_FINGERPRINT',
                FAILED_STEP: 'FAILED_STEP',
                NOT_AVAILABLE: 'N/A',
            });
            assert.deepEqual(QUALITY_GATE_SUGGESTED_COMMAND_SOURCE_PRIORITY, [
                QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.VALIDATION_FAILURE_INDEX,
                QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT,
                QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILED_STEP,
                QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.NOT_AVAILABLE,
            ]);
            assert.deepEqual(SELF_CHECK_SUGGESTED_COMMAND_SOURCE_PRIORITY, [
                SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT,
                SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILED_STEP,
                SELF_CHECK_SUGGESTED_COMMAND_SOURCE.NOT_AVAILABLE,
            ]);
            assert.deepEqual(QUALITY_GATE_FIRST_FIX_ROUTE, {
                VALIDATION_COMMAND: 'RUN_QUALITY_VALIDATION_SUGGESTED_COMMAND',
                FINGERPRINT_COMMAND: 'RUN_QUALITY_FINGERPRINT_COMMAND',
                FAILED_STEP_COMMAND: 'RUN_QUALITY_FAILED_STEP_COMMAND',
                MANUAL_INSPECTION: 'INSPECT_QUALITY_REPORT_STEPS_AND_FAILURE_INDEX',
            });
            assert.deepEqual(SELF_CHECK_FIRST_FIX_ROUTE, {
                FINGERPRINT_COMMAND: 'RUN_SELF_CHECK_FINGERPRINT_COMMAND',
                FAILED_STEP_COMMAND: 'RUN_SELF_CHECK_FAILED_STEP_COMMAND',
                MANUAL_INSPECTION: 'INSPECT_SELF_CHECK_REPORT_STEPS',
            });
        });

        await runCase('render workflow quick locate index', async () => {
            const markdown = renderWorkflowQuickLocateIndexMarkdown({
                qualityReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate'],
                    },
                    steps: [
                        {
                            id: 'report-validate',
                            status: 'FAILED',
                            command: 'pnpm',
                            args: ['workflow:reports:validate'],
                            outputTail: 'quality validation failed first line\nquality stack trace line 2',
                        },
                    ],
                },
                qualityReportValidation: {
                    status: 'FAILED',
                    failureIndex: {
                        reasonCode: 'REPORT_PATH_MISMATCH',
                        suggestedCommand: 'pnpm workflow:quality:report:validate -- --report-file=logs/workflow-quality-gate-report.actual.json',
                    },
                },
                selfCheckReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate-self-check'],
                        failureFingerprint: {
                            stepId: 'report-validate-self-check',
                            command: 'pnpm workflow:reports:validate:self-check',
                            firstOutputLine: 'schema mismatch',
                            normalizedOutputLine: 'schema mismatch',
                            hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                        },
                    },
                },
                selfCheckValidation: {
                    status: 'FAILED',
                    report: {
                        failureFingerprintHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                    },
                },
            });

            assert.ok(markdown.includes('## Workflow Quick Locate Index'));
            assert.ok(markdown.includes('Quality Gate Status: `FAILED`'));
            assert.ok(markdown.includes('Quality Gate Failed Steps: `report-validate`'));
            assert.ok(markdown.includes('Quality Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(markdown.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(!markdown.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(markdown.includes('Quality Validation Reason Code: `REPORT_PATH_MISMATCH`'));
            assert.ok(markdown.includes('Quality Validation Suggested Command: `pnpm workflow:quality:report:validate -- --report-file=logs/workflow-quality-gate-report.actual.json`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command Source Priority: `VALIDATION_FAILURE_INDEX > FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command Source: `VALIDATION_FAILURE_INDEX`'));
            assert.ok(markdown.includes('Quality Gate First Fix Route: `RUN_QUALITY_VALIDATION_SUGGESTED_COMMAND`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command: `pnpm workflow:quality:report:validate -- --report-file=logs/workflow-quality-gate-report.actual.json`'));
            assert.ok(markdown.includes('Quality Gate First Failed Output: `quality validation failed first line`'));
            assert.ok(markdown.includes('Self-Check Failed Steps: `report-validate-self-check`'));
            assert.ok(markdown.includes('Self-Check Failure Fingerprint Source: `SUMMARY`'));
            assert.ok(markdown.includes('Self-Check Failure Fingerprint Step: `report-validate-self-check`'));
            assert.ok(markdown.includes('Self-Check Failure Fingerprint Hash: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`'));
            assert.ok(markdown.includes('Self-Check Suggested Command Source Priority: `FAILURE_FINGERPRINT > FAILED_STEP > N/A`'));
            assert.ok(markdown.includes('Self-Check Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(markdown.includes('Self-Check First Fix Route: `RUN_SELF_CHECK_FINGERPRINT_COMMAND`'));
            assert.ok(markdown.includes('Self-Check Suggested Command: `pnpm workflow:reports:validate:self-check`'));
            assert.ok(markdown.includes('Self-Check First Failed Output: `schema mismatch`'));
            assert.ok(markdown.includes('Self-Check Validation Fingerprint Hash: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`'));
        });

        await runCase('render workflow quick locate index with computed legacy fallback', async () => {
            const markdown = renderWorkflowQuickLocateIndexMarkdown({
                qualityReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate'],
                    },
                    steps: [
                        {
                            id: 'report-validate',
                            status: 'FAILED',
                            command: 'pnpm',
                            args: ['workflow:reports:validate', '--strict'],
                            outputTail: 'quality fallback first line\nquality fallback stack trace line 2',
                        },
                    ],
                },
                qualityReportValidation: {
                    status: 'FAILED',
                    failureIndex: {
                        reasonCode: 'REPORT_PATH_MISMATCH',
                    },
                },
                selfCheckReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate-self-check'],
                        failureFingerprint: null,
                    },
                    steps: [
                        {
                            id: 'report-validate-self-check',
                            status: 'FAILED',
                            command: 'pnpm',
                            args: ['workflow:reports:validate:self-check'],
                            exitCode: 1,
                            outputTail: 'legacy mismatch first line\nstack trace line 2',
                        },
                    ],
                },
                selfCheckValidation: {
                    status: 'FAILED',
                    report: {
                        failureFingerprintHash: 'N/A',
                    },
                },
            });

            assert.ok(markdown.includes('Quality Validation Suggested Command: `N/A`'));
            assert.ok(markdown.includes('Quality Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(markdown.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(!markdown.includes('Quality Failure Fingerprint Hash: `N/A`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(markdown.includes('Quality Gate First Fix Route: `RUN_QUALITY_FINGERPRINT_COMMAND`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command: `pnpm workflow:reports:validate --strict`'));
            assert.ok(markdown.includes('Quality Gate First Failed Output: `quality fallback first line`'));
            assert.ok(markdown.includes('Self-Check Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(markdown.includes('Self-Check Failure Fingerprint Step: `report-validate-self-check`'));
            assert.ok(markdown.includes('Self-Check Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(markdown.includes('Self-Check First Fix Route: `RUN_SELF_CHECK_FINGERPRINT_COMMAND`'));
            assert.ok(markdown.includes('Self-Check Suggested Command: `pnpm workflow:reports:validate:self-check`'));
            assert.ok(markdown.includes('Self-Check First Failed Output: `legacy mismatch first line`'));
            assert.ok(!markdown.includes('Self-Check Failure Fingerprint Hash: `N/A`'));
        });

        await runCase('render workflow quick locate index with quality summary fingerprint priority', async () => {
            const qualityFingerprintHash = 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
            const markdown = renderWorkflowQuickLocateIndexMarkdown({
                qualityReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate'],
                        failureFingerprint: {
                            stepId: 'report-validate',
                            command: 'pnpm workflow:reports:validate --strict',
                            firstOutputLine: 'quality summary fingerprint line',
                            normalizedOutputLine: 'quality summary fingerprint line',
                            hash: qualityFingerprintHash,
                        },
                    },
                    steps: [],
                },
                qualityReportValidation: {
                    status: 'FAILED',
                    failureIndex: {
                        reasonCode: 'REPORT_PATH_MISMATCH',
                    },
                },
            });

            assert.ok(markdown.includes('Quality Failure Fingerprint Source: `SUMMARY`'));
            assert.ok(markdown.includes('Quality Failure Fingerprint Step: `report-validate`'));
            assert.ok(markdown.includes(`Quality Failure Fingerprint Hash: \`${qualityFingerprintHash}\``));
            assert.ok(markdown.includes('Quality Validation Suggested Command: `N/A`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command Source: `FAILURE_FINGERPRINT`'));
            assert.ok(markdown.includes('Quality Gate First Fix Route: `RUN_QUALITY_FINGERPRINT_COMMAND`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command: `pnpm workflow:reports:validate --strict`'));
            assert.ok(markdown.includes('Quality Gate First Failed Output: `quality summary fingerprint line`'));
        });

        await runCase('render workflow quick locate index with suggested command failed-step source', async () => {
            const markdown = renderWorkflowQuickLocateIndexMarkdown({
                qualityReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate'],
                        failureFingerprint: {
                            stepId: 'report-validate',
                            hash: 'quality-fingerprint-hash-no-command',
                        },
                    },
                    steps: [
                        {
                            id: 'report-validate',
                            status: 'FAILED',
                            command: 'pnpm',
                            args: ['workflow:reports:validate', '--strict'],
                            outputTail: 'quality step fallback line\nquality stack trace line 2',
                        },
                    ],
                },
                qualityReportValidation: {
                    status: 'FAILED',
                    failureIndex: {
                        reasonCode: 'REPORT_PATH_MISMATCH',
                    },
                },
                selfCheckReport: {
                    status: 'FAILED',
                    summary: {
                        failedStepIds: ['report-validate-self-check'],
                        failureFingerprint: {
                            stepId: 'report-validate-self-check',
                            hash: 'self-check-fingerprint-hash-no-command',
                        },
                    },
                    steps: [
                        {
                            id: 'report-validate-self-check',
                            status: 'FAILED',
                            command: 'pnpm',
                            args: ['workflow:reports:validate:self-check'],
                            outputTail: 'self-check step fallback line\nself-check stack trace line 2',
                        },
                    ],
                },
                selfCheckValidation: {
                    status: 'FAILED',
                    report: {
                        failureFingerprintHash: 'N/A',
                    },
                },
            });

            assert.ok(markdown.includes('Quality Failure Fingerprint Source: `SUMMARY`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command Source: `FAILED_STEP`'));
            assert.ok(markdown.includes('Quality Gate First Fix Route: `RUN_QUALITY_FAILED_STEP_COMMAND`'));
            assert.ok(markdown.includes('Quality Gate Suggested Command: `pnpm workflow:reports:validate --strict`'));
            assert.ok(markdown.includes('Quality Gate First Failed Output: `quality step fallback line`'));
            assert.ok(markdown.includes('Self-Check Failure Fingerprint Source: `SUMMARY`'));
            assert.ok(markdown.includes('Self-Check Suggested Command Source: `FAILED_STEP`'));
            assert.ok(markdown.includes('Self-Check First Fix Route: `RUN_SELF_CHECK_FAILED_STEP_COMMAND`'));
            assert.ok(markdown.includes('Self-Check Suggested Command: `pnpm workflow:reports:validate:self-check`'));
            assert.ok(markdown.includes('Self-Check First Failed Output: `self-check step fallback line`'));
        });

        await runCase('render workflow summary self-check report', async () => {
            const report = {
                status: 'FAILED',
                runId: 'summary-suite-run',
                durationMs: 99.12,
                reportFile: 'logs/workflow-summary-self-check-report.json',
                summary: {
                    totalSteps: 7,
                    successfulSteps: 3,
                    failedSteps: 1,
                    failedStepIds: ['quality-gate-self-check'],
                },
                steps: [
                    { id: 'report-validate-self-check', status: 'SUCCESS' },
                    { id: 'summary-renderers-self-check', status: 'SUCCESS' },
                    { id: 'report-summary-self-check', status: 'SUCCESS' },
                    {
                        id: 'quality-gate-self-check',
                        status: 'FAILED',
                        command: 'pnpm',
                        args: ['workflow:quality:gate:self-check'],
                        exitCode: 1,
                        outputTail: 'failed with schema mismatch',
                    },
                    { id: 'ci-step-summary-self-check', status: 'PENDING' },
                ],
            };

            const markdown = renderWorkflowSummarySelfCheckMarkdown(report, {
                maxFailedDetails: 1,
            });
            assert.ok(markdown.includes('## Workflow Summary Self-Check Suite'));
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Failed Step IDs: `quality-gate-self-check`'));
            assert.ok(markdown.includes('First Failed Step: `quality-gate-self-check`'));
            assert.ok(markdown.includes('First Failed Suggested Action: `pnpm workflow:quality:gate:self-check`'));
            assert.ok(markdown.includes('Quick Locate Command Source Priority: `STEP_OVERRIDE > FAILED_STEP > N/A`'));
            assert.ok(markdown.includes('Quick Locate Command Source: `STEP_OVERRIDE`'));
            assert.ok(markdown.includes('Quick Locate First Fix Route: `RERUN_QUICK_LOCATE_COMMAND`'));
            assert.ok(markdown.includes('Quick Locate Suggested Command: `pnpm workflow:quality:gate:self-check`'));
            assert.ok(markdown.includes('Quick Locate First Failed Output: `failed with schema mismatch`'));
            assert.ok(markdown.includes('Failure Fingerprint Source: `COMPUTED`'));
            assert.ok(markdown.includes('Failure Fingerprint Step: `quality-gate-self-check`'));
            assert.ok(markdown.includes('Failure Fingerprint Command: `pnpm workflow:quality:gate:self-check`'));
            assert.ok(markdown.includes('Failure Fingerprint First Output: `failed with schema mismatch`'));
            assert.ok(markdown.includes('Failure Fingerprint Hash: `'));
            assert.ok(!markdown.includes('Failure Fingerprint Hash: `N/A`'));
            assert.ok(markdown.includes('Failure Fingerprint Hash Algorithm: `sha256`'));
            assert.ok(markdown.includes('Failure Fingerprint Signature: `stepId=quality-gate-self-check|exitCode=1|output=failed with schema mismatch`'));
            assert.ok(markdown.includes('Pending Steps: `1`'));
            assert.ok(markdown.includes('Report File: `logs/workflow-summary-self-check-report.json`'));
            assert.ok(markdown.includes('### Failed Step Details'));
            assert.ok(markdown.includes('quality-gate-self-check | exitCode=`1`'));
        });

        await runCase('render workflow summary self-check report validation', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-summary-self-check-report.json',
                    expectedReportSchemaVersion: '1.0',
                },
                report: {
                    schemaVersion: '9.9',
                    status: 'FAILED',
                    failedStepIds: ['report-validate-self-check'],
                    quickLocateCommandSourcePriority: ['STEP_OVERRIDE', 'FAILED_STEP', 'N/A'],
                    quickLocateCommandSource: 'FAILED_STEP',
                    quickLocateFirstFixRoute: 'RERUN_FAILED_STEP_COMMAND',
                    quickLocateCommand: 'pnpm workflow:reports:validate:self-check',
                    quickLocateFirstFailedOutput: 'sample validation first output',
                    hasFailureFingerprint: true,
                    failureFingerprintStepId: 'report-validate-self-check',
                    failureFingerprintHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                    failureFingerprintHashAlgorithm: 'sha256',
                },
                warnings: ['warn-1'],
                validationErrors: ['error-1', 'error-2', 'error-3'],
            };

            const markdown = renderWorkflowSummarySelfCheckValidationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('## Workflow Summary Self-Check Report Validation'));
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Validation Error Count: `3`'));
            assert.ok(markdown.includes('Expected Report Schema Version: `1.0`'));
            assert.ok(markdown.includes('Report Schema Version: `9.9`'));
            assert.ok(markdown.includes('Report Failed Step IDs: `report-validate-self-check`'));
            assert.ok(markdown.includes('Report Quick Locate Command Source Priority: `STEP_OVERRIDE > FAILED_STEP > N/A`'));
            assert.ok(markdown.includes('Report Quick Locate Command Source: `FAILED_STEP`'));
            assert.ok(markdown.includes('Report Quick Locate First Fix Route: `RERUN_FAILED_STEP_COMMAND`'));
            assert.ok(markdown.includes('Report Quick Locate Suggested Command: `pnpm workflow:reports:validate:self-check`'));
            assert.ok(markdown.includes('Report Quick Locate First Failed Output: `sample validation first output`'));
            assert.ok(markdown.includes('Report Failure Fingerprint: `true`'));
            assert.ok(markdown.includes('Report Failure Fingerprint Step: `report-validate-self-check`'));
            assert.ok(markdown.includes('Report Failure Fingerprint Hash: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`'));
            assert.ok(markdown.includes('Report Failure Fingerprint Hash Algorithm: `sha256`'));
            assert.ok(markdown.includes('### Top Validation Errors'));
            assert.ok(markdown.includes('- error-1'));
            assert.ok(markdown.includes('- error-2'));
            assert.ok(!markdown.includes('- error-3'));
        });

        await runCase('render workflow quality gate report validation', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    expectedReportSchemaVersion: '1.0',
                    requireSummaryJsonAssert: true,
                    requireArtifactOptionPathMatch: true,
                    allowReportFilePathMismatch: false,
                },
                report: {
                    schemaVersion: '9.9',
                    status: 'FAILED',
                    failedStepIds: ['report-validate'],
                    hasSummaryJsonAssert: false,
                    reportFilePathMatchesArtifact: false,
                    artifactOptionPathCheckedCount: 5,
                    artifactOptionPathMismatchCount: 2,
                },
                failureIndex: {
                    reasonCode: 'ARTIFACT_OPTIONS_PATH_MISMATCH',
                    reasonCodeSource: 'CLASSIFIED_FROM_VALIDATION_ERROR',
                    guidanceVersion: '1.0',
                    message: 'error-1',
                    suggestedAction: 'align options.* and artifacts.* paths in quality gate report, then rerun validation',
                    suggestedCommand: 'pnpm workflow:quality:gate -- --require-summary-json-success --validate-summary-json-schema-version=1.0',
                },
                warnings: ['warn-1', 'warn-2'],
                validationErrors: ['error-1', 'error-2', 'error-3'],
            };

            const markdown = renderWorkflowQualityGateReportValidationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('## Workflow Quality Gate Report Validation'));
            assert.ok(markdown.includes('Status: `FAILED`'));
            assert.ok(markdown.includes('Expected Report Schema Version: `1.0`'));
            assert.ok(markdown.includes('Require Summary JSON Assert: `true`'));
            assert.ok(markdown.includes('Require Artifact/Options Path Match: `true`'));
            assert.ok(markdown.includes('Allow Report File Path Mismatch: `false`'));
            assert.ok(markdown.includes('Report Schema Version: `9.9`'));
            assert.ok(markdown.includes('Report Failed Step IDs: `report-validate`'));
            assert.ok(markdown.includes('Report Summary JSON Assert: `false`'));
            assert.ok(markdown.includes('Report File Path Matches Artifact: `false`'));
            assert.ok(markdown.includes('Artifact/Options Path Mismatch Count: `2`'));
            assert.ok(markdown.includes('First Failure Reason Code: `ARTIFACT_OPTIONS_PATH_MISMATCH`'));
            assert.ok(markdown.includes('Failure Reason Source: `CLASSIFIED_FROM_VALIDATION_ERROR`'));
            assert.ok(markdown.includes('Guidance Version: `1.0`'));
            assert.ok(markdown.includes('First Validation Error: `error-1`'));
            assert.ok(markdown.includes('Suggested Action: `align options.* and artifacts.* paths in quality gate report, then rerun validation`'));
            assert.ok(markdown.includes('Suggested Command: `pnpm workflow:quality:gate -- --require-summary-json-success --validate-summary-json-schema-version=1.0`'));
            assert.ok(markdown.includes('Failure Index Snapshot: `{"reasonCode":"ARTIFACT_OPTIONS_PATH_MISMATCH"'));
            assert.ok(markdown.includes('Failure Index Snapshot Raw Length: `'));
            assert.ok(markdown.includes('Failure Index Snapshot Max Chars: `320`'));
            assert.ok(markdown.includes('Failure Index Snapshot Truncated: `true`'));
            assert.ok(markdown.includes('Diagnostics Reason Code Count Total: `3`'));
            assert.ok(markdown.includes('Diagnostics Reason Code Counts: `VALIDATION_ERROR=3`'));
            assert.ok(markdown.includes('Diagnostics Reason Source Count Total: `1`'));
            assert.ok(markdown.includes('Diagnostics Reason Source Counts: `CLASSIFIED_FROM_VALIDATION_ERROR=1`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Total Count: `1`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Truncated Count: `1`'));
            assert.ok(markdown.includes('Diagnostics Consistency Source: `COMPUTED`'));
            assert.ok(markdown.includes('Diagnostics Consistency Status: `PASS`'));
            assert.ok(markdown.includes('Diagnostics Consistency Mismatch Count: `0`'));
            assert.ok(markdown.includes('Diagnostics Consistency Reasons: `N/A`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Contract Max Chars: `320`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Contract Truncated: `true`'));
            assert.ok(markdown.includes('### Top Validation Errors'));
            assert.ok(markdown.includes('- error-1'));
            assert.ok(markdown.includes('- error-2'));
            assert.ok(!markdown.includes('- error-3'));
            assert.ok(markdown.includes('### Top Warnings'));
            assert.ok(markdown.includes('- warn-1'));
            assert.ok(markdown.includes('- warn-2'));
        });

        await runCase('render workflow quality gate report validation with guidance fallback', async () => {
            const summary = {
                schemaVersion: '1.0',
                generatedAt: '2026-02-11T00:00:00.000Z',
                status: 'FAILED',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.input.json',
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
                    artifactQualityGateReportFile: 'logs/workflow-quality-gate-report.actual.json',
                },
                warnings: [],
                validationErrors: [
                    'Quality gate report path mismatch: input logs/workflow-quality-gate-report.input.json vs artifacts.qualityGateReportFile logs/workflow-quality-gate-report.actual.json.',
                ],
            };

            const markdown = renderWorkflowQualityGateReportValidationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('First Failure Reason Code: `REPORT_PATH_MISMATCH`'));
            assert.ok(markdown.includes('Failure Reason Source: `CLASSIFIED_FROM_VALIDATION_ERROR`'));
            assert.ok(markdown.includes('Guidance Version: `1.0`'));
            assert.ok(markdown.includes('Suggested Action: `rerun workflow:quality:gate and validate using the same --report-file as artifacts.qualityGateReportFile`'));
            assert.ok(markdown.includes('Suggested Command: `pnpm workflow:quality:report:validate -- --report-file=logs/workflow-quality-gate-report.actual.json'));
            assert.ok(markdown.includes('Failure Index Snapshot: `{"reasonCode":"REPORT_PATH_MISMATCH"'));
            assert.ok(markdown.includes('Diagnostics Reason Code Count Total: `1`'));
            assert.ok(markdown.includes('Diagnostics Reason Code Counts: `REPORT_PATH_MISMATCH=1`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Total Count: `1`'));
            assert.ok(markdown.includes('Diagnostics Consistency Status: `PASS`'));
            assert.ok(markdown.includes('Diagnostics Consistency Mismatch Count: `0`'));
        });

        await runCase('render workflow quality gate report validation with legacy failureIndex', async () => {
            const summary = {
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
            };

            const markdown = renderWorkflowQualityGateReportValidationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('First Failure Reason Code: `REPORT_PATH_MISMATCH`'));
            assert.ok(markdown.includes('Failure Reason Source: `EXPLICIT_FAILURE_REASON_CODE`'));
            assert.ok(markdown.includes('Guidance Version: `1.0`'));
            assert.ok(markdown.includes('Suggested Action: `legacy action`'));
            assert.ok(markdown.includes('Suggested Command: `legacy command`'));
            assert.ok(markdown.includes('Failure Index Snapshot: `{"reasonCode":"REPORT_PATH_MISMATCH","reasonCodeSource":"EXPLICIT_FAILURE_REASON_CODE","guidanceVersion":"1.0","message":"legacy path mismatch message","suggestedAction":"legacy action","suggestedCommand":"legacy command"}`'));
            assert.ok(markdown.includes('Diagnostics Reason Source Counts: `EXPLICIT_FAILURE_REASON_CODE=1`'));
            assert.ok(markdown.includes('Diagnostics Consistency Status: `PASS`'));
            assert.ok(markdown.includes('Diagnostics Consistency Reasons: `N/A`'));
        });

        await runCase('render workflow quality gate report validation with diagnostics consistency failed', async () => {
            const summary = {
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
            };

            const markdown = renderWorkflowQualityGateReportValidationMarkdown(summary, {
                maxItems: 2,
            });
            assert.ok(markdown.includes('Diagnostics Consistency Source: `SUMMARY`'));
            assert.ok(markdown.includes('Diagnostics Consistency Status: `FAILED`'));
            assert.ok(markdown.includes('Diagnostics Consistency Mismatch Count: `2`'));
            assert.ok(markdown.includes('Diagnostics Consistency Reasons: `reasonCodeCountTotal mismatch: expected 1, actual 2. | reasonCodeCountTotal vs reasonCodeCounts mismatch: total=2, mapTotal=1.`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Contract Max Chars: `320`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Contract Raw Length: `222`'));
            assert.ok(markdown.includes('Diagnostics Snapshot Contract Truncated: `false`'));
        });

        process.stdout.write('\n[self-check] all workflow-summary-renderers cases passed.\n');
    } catch (error) {
        process.stderr.write(
            `\n[self-check] failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    }
}

main();
