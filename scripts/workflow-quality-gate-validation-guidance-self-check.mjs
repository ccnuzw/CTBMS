#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
    DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS,
    QUALITY_GATE_VALIDATION_GUIDANCE_VERSION,
    QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE,
    buildQualityGateFailureIndexSnapshotPayload,
    buildQualityGateValidationReasonCodeCounts,
    buildQualityGateValidationSuggestedCommand,
    classifyQualityGateValidationReasonCode,
    formatCountMap,
    resolveQualityGateValidationGuidance,
    serializeQualityGateFailureIndexSnapshot,
} from './workflow-quality-gate-validation-guidance.mjs';

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    try {
        await runCase('classify common validation reason codes', async () => {
            assert.equal(
                classifyQualityGateValidationReasonCode('Quality gate report schema version mismatch: expected 1.0, actual 9.9.'),
                'REPORT_SCHEMA_MISMATCH',
            );
            assert.equal(
                classifyQualityGateValidationReasonCode('Quality gate report summary.summaryJsonAssert is required by --require-summary-json-assert.'),
                'SUMMARY_JSON_ASSERT_REQUIRED',
            );
            assert.equal(
                classifyQualityGateValidationReasonCode('Quality gate report options/artifacts path mismatch: options.reportFile=a, artifacts.qualityGateReportFile=b.'),
                'ARTIFACT_OPTIONS_PATH_MISMATCH',
            );
            assert.equal(
                classifyQualityGateValidationReasonCode('Quality gate report status SUCCESS cannot contain failed steps.'),
                'STATUS_STEP_CONFLICT',
            );
            assert.equal(
                classifyQualityGateValidationReasonCode('some random message'),
                'VALIDATION_ERROR',
            );
        });

        await runCase('resolve guidance fallback to N/A when no failure signal', async () => {
            const guidance = resolveQualityGateValidationGuidance({
                failureReasonCode: null,
                firstValidationError: null,
            });
            assert.equal(guidance.reasonCode, null);
            assert.equal(guidance.reasonCodeSource, QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.NONE);
            assert.equal(guidance.guidanceVersion, QUALITY_GATE_VALIDATION_GUIDANCE_VERSION);
            assert.equal(guidance.suggestedAction, 'N/A');
            assert.equal(guidance.suggestedCommand, 'N/A');
        });

        await runCase('resolve command for report path mismatch with artifact override', async () => {
            const guidance = resolveQualityGateValidationGuidance({
                failureReasonCode: 'REPORT_PATH_MISMATCH',
                firstValidationError: 'path mismatch',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                },
                reportSummary: {
                    artifactQualityGateReportFile: 'logs/workflow-quality-gate-report.actual.json',
                },
            });
            assert.equal(guidance.reasonCode, 'REPORT_PATH_MISMATCH');
            assert.equal(guidance.reasonCodeSource, QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.EXPLICIT);
            assert.equal(guidance.guidanceVersion, QUALITY_GATE_VALIDATION_GUIDANCE_VERSION);
            assert.ok(guidance.suggestedAction.includes('artifacts.qualityGateReportFile'));
            assert.ok(guidance.suggestedCommand.includes('--report-file=logs/workflow-quality-gate-report.actual.json'));
        });

        await runCase('resolve command by classifying first validation error', async () => {
            const guidance = resolveQualityGateValidationGuidance({
                firstValidationError: 'Quality gate report summary.summaryJsonAssert is required by --require-summary-json-assert.',
                inputs: {
                    reportFile: 'logs/workflow-quality-gate-report.json',
                    summaryJsonFile: 'logs/workflow-quality-gate-report-validation.json',
                    expectedReportSchemaVersion: '1.0',
                },
            });
            assert.equal(guidance.reasonCode, 'SUMMARY_JSON_ASSERT_REQUIRED');
            assert.equal(guidance.reasonCodeSource, QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.CLASSIFIED);
            assert.equal(guidance.guidanceVersion, QUALITY_GATE_VALIDATION_GUIDANCE_VERSION);
            assert.equal(
                guidance.suggestedCommand,
                'pnpm workflow:quality:gate -- --require-summary-json-success --validate-summary-json-schema-version=1.0',
            );
        });

        await runCase('build command for report read error', async () => {
            const command = buildQualityGateValidationSuggestedCommand('REPORT_READ_ERROR', {
                inputs: {
                    reportFile: 'logs/missing-report.json',
                },
            });
            assert.equal(command, 'ls -l logs/missing-report.json');
        });

        await runCase('serialize failure index snapshot with truncation', async () => {
            const payload = buildQualityGateFailureIndexSnapshotPayload({
                reasonCode: 'REPORT_PATH_MISMATCH',
                reasonCodeSource: QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.EXPLICIT,
                guidanceVersion: QUALITY_GATE_VALIDATION_GUIDANCE_VERSION,
                message: 'long message value',
                suggestedAction: 'long action value',
                suggestedCommand: 'long command value',
            });
            const snapshot = serializeQualityGateFailureIndexSnapshot(payload, { maxChars: 40 });
            assert.equal(snapshot.maxChars, 40);
            assert.equal(snapshot.truncated, true);
            assert.ok(snapshot.value.endsWith('...'));
            assert.ok(snapshot.rawLength > 40);
        });

        await runCase('reason code counts and formatter', async () => {
            const counts = buildQualityGateValidationReasonCodeCounts([
                'Quality gate report schema version mismatch: expected 1.0, actual 9.9.',
                'Quality gate report summary.totalSteps mismatch: expected 2, actual 1.',
                'Quality gate report schema version mismatch: expected 1.0, actual 9.9.',
            ]);
            assert.equal(counts.REPORT_SCHEMA_MISMATCH, 2);
            assert.equal(counts.SUMMARY_COUNTER_MISMATCH, 1);
            const formatted = formatCountMap(counts);
            assert.equal(
                formatted,
                'REPORT_SCHEMA_MISMATCH=2, SUMMARY_COUNTER_MISMATCH=1',
            );
            const defaultSnapshot = serializeQualityGateFailureIndexSnapshot(null);
            assert.equal(defaultSnapshot.maxChars, DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS);
            assert.equal(defaultSnapshot.value, 'N/A');
        });

        process.stdout.write('\n[self-check] all workflow-quality-gate-validation-guidance cases passed.\n');
    } catch (error) {
        process.stderr.write(
            `\n[self-check] failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    }
}

main();
