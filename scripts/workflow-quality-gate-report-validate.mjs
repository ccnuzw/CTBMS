#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS,
    DEFAULT_QUALITY_GATE_REPORT_FILE,
    DEFAULT_QUALITY_GATE_REPORT_SCHEMA_VERSION,
    DEFAULT_QUALITY_GATE_REPORT_VALIDATION_SUMMARY_JSON_FILE,
    QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE,
    buildQualityGateFailureIndexSnapshotPayload,
    buildQualityGateValidationReasonCodeCounts,
    resolveQualityGateValidationGuidance,
    serializeQualityGateFailureIndexSnapshot,
} from './workflow-quality-gate-validation-guidance.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const VALIDATION_SCHEMA_VERSION = '1.0';
const DEFAULT_REPORT_FILE = DEFAULT_QUALITY_GATE_REPORT_FILE;
const DEFAULT_SUMMARY_JSON_FILE = DEFAULT_QUALITY_GATE_REPORT_VALIDATION_SUMMARY_JSON_FILE;
const DEFAULT_EXPECTED_REPORT_SCHEMA_VERSION = DEFAULT_QUALITY_GATE_REPORT_SCHEMA_VERSION;
const args = process.argv.slice(2);

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toComparableAbsolutePath = (value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }
    return path.resolve(repoRoot, value.trim());
};

const buildFailureIndex = (validationErrors, inputs, reportSummary) => {
    if (!Array.isArray(validationErrors) || validationErrors.length === 0) {
        return null;
    }
    const message = String(validationErrors[0] || '').trim();
    const guidance = resolveQualityGateValidationGuidance({
        firstValidationError: message,
        inputs,
        reportSummary,
    });
    return {
        reasonCode: guidance.reasonCode,
        reasonCodeSource: guidance.reasonCodeSource,
        guidanceVersion: guidance.guidanceVersion,
        message: message || null,
        suggestedAction: guidance.suggestedAction,
        suggestedCommand: guidance.suggestedCommand,
    };
};

const sumCountMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 0;
    }
    return Object.values(value).reduce(
        (sum, count) => sum + (Number.isFinite(count) ? count : 0),
        0,
    );
};

const buildFailureIndexDiagnosticsConsistency = ({
    validationErrors,
    failureIndex,
    reasonCodeCountTotal,
    reasonCodeCounts,
    reasonCodeSourceCountTotal,
    reasonCodeSourceCounts,
    snapshotTotalCount,
    snapshotTruncatedCount,
    snapshot,
}) => {
    const expectedReasonCodeCountTotal = Array.isArray(validationErrors) ? validationErrors.length : 0;
    const expectedReasonCodeCountFromMap = sumCountMap(reasonCodeCounts);
    const expectedReasonCodeSourceCountFromMap = sumCountMap(reasonCodeSourceCounts);
    const expectedReasonCodeSourceCountTotal = 1;
    const expectedSnapshotTotalCount = failureIndex ? 1 : 0;
    const expectedSnapshotTruncatedCount = snapshot?.truncated ? 1 : 0;
    const mismatchReasons = [];

    if (reasonCodeCountTotal !== expectedReasonCodeCountTotal) {
        mismatchReasons.push(
            `reasonCodeCountTotal mismatch: expected ${expectedReasonCodeCountTotal}, actual ${reasonCodeCountTotal}.`,
        );
    }
    if (reasonCodeCountTotal !== expectedReasonCodeCountFromMap) {
        mismatchReasons.push(
            `reasonCodeCountTotal vs reasonCodeCounts mismatch: total=${reasonCodeCountTotal}, mapTotal=${expectedReasonCodeCountFromMap}.`,
        );
    }
    if (reasonCodeSourceCountTotal !== expectedReasonCodeSourceCountTotal) {
        mismatchReasons.push(
            `reasonCodeSourceCountTotal mismatch: expected ${expectedReasonCodeSourceCountTotal}, actual ${reasonCodeSourceCountTotal}.`,
        );
    }
    if (reasonCodeSourceCountTotal !== expectedReasonCodeSourceCountFromMap) {
        mismatchReasons.push(
            `reasonCodeSourceCountTotal vs reasonCodeSourceCounts mismatch: total=${reasonCodeSourceCountTotal}, mapTotal=${expectedReasonCodeSourceCountFromMap}.`,
        );
    }
    if (snapshotTotalCount !== expectedSnapshotTotalCount) {
        mismatchReasons.push(
            `snapshotTotalCount mismatch: expected ${expectedSnapshotTotalCount}, actual ${snapshotTotalCount}.`,
        );
    }
    if (snapshotTruncatedCount !== expectedSnapshotTruncatedCount) {
        mismatchReasons.push(
            `snapshotTruncatedCount mismatch: expected ${expectedSnapshotTruncatedCount}, actual ${snapshotTruncatedCount}.`,
        );
    }
    if (snapshotTruncatedCount > snapshotTotalCount) {
        mismatchReasons.push(
            `snapshotTruncatedCount cannot be greater than snapshotTotalCount: truncated=${snapshotTruncatedCount}, total=${snapshotTotalCount}.`,
        );
    }
    if (snapshot?.maxChars !== DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS) {
        mismatchReasons.push(
            `snapshot.maxChars mismatch: expected ${DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS}, actual ${snapshot?.maxChars}.`,
        );
    }
    if (typeof snapshot?.rawLength !== 'number' || snapshot.rawLength < 0) {
        mismatchReasons.push(`snapshot.rawLength invalid: ${String(snapshot?.rawLength)}.`);
    }
    if (snapshotTotalCount === 0 && snapshot?.rawLength !== 0) {
        mismatchReasons.push(
            `snapshot.rawLength mismatch when snapshotTotalCount=0: expected 0, actual ${snapshot?.rawLength}.`,
        );
    }
    if (snapshotTotalCount === 0 && snapshot?.truncated) {
        mismatchReasons.push('snapshot.truncated cannot be true when snapshotTotalCount=0.');
    }

    return {
        status: mismatchReasons.length === 0 ? 'PASS' : 'FAILED',
        mismatchCount: mismatchReasons.length,
        mismatchReasons,
    };
};

const buildFailureIndexDiagnostics = (validationErrors, failureIndex) => {
    const reasonCodeCounts = buildQualityGateValidationReasonCodeCounts(validationErrors);
    const reasonCodeCountTotal = Array.isArray(validationErrors) ? validationErrors.length : 0;
    const reasonCodeSource = typeof failureIndex?.reasonCodeSource === 'string'
        ? failureIndex.reasonCodeSource
        : QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.NONE;
    const reasonCodeSourceCounts = {
        [reasonCodeSource]: 1,
    };
    const reasonCodeSourceCountTotal = 1;

    const snapshotPayload = buildQualityGateFailureIndexSnapshotPayload({
        reasonCode: failureIndex?.reasonCode,
        reasonCodeSource: failureIndex?.reasonCodeSource,
        guidanceVersion: failureIndex?.guidanceVersion,
        message: failureIndex?.message,
        suggestedAction: failureIndex?.suggestedAction,
        suggestedCommand: failureIndex?.suggestedCommand,
    });
    const snapshot = serializeQualityGateFailureIndexSnapshot(snapshotPayload, {
        maxChars: DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS,
    });
    const snapshotTotalCount = snapshotPayload ? 1 : 0;
    const snapshotTruncatedCount = snapshot.truncated ? 1 : 0;
    const consistency = buildFailureIndexDiagnosticsConsistency({
        validationErrors,
        failureIndex,
        reasonCodeCountTotal,
        reasonCodeCounts,
        reasonCodeSourceCountTotal,
        reasonCodeSourceCounts,
        snapshotTotalCount,
        snapshotTruncatedCount,
        snapshot: {
            maxChars: snapshot.maxChars,
            rawLength: snapshot.rawLength,
            truncated: snapshot.truncated,
        },
    });

    return {
        reasonCodeCountTotal,
        reasonCodeCounts,
        reasonCodeSourceCountTotal,
        reasonCodeSourceCounts,
        snapshotTotalCount,
        snapshotTruncatedCount,
        snapshot: {
            maxChars: snapshot.maxChars,
            rawLength: snapshot.rawLength,
            truncated: snapshot.truncated,
        },
        consistency,
    };
};

const normalizeFailedStepIds = (value, validationErrors) => {
    if (!Array.isArray(value)) {
        validationErrors.push('Quality gate report summary.failedStepIds must be an array.');
        return [];
    }
    for (const stepId of value) {
        if (typeof stepId !== 'string' || stepId.trim().length === 0) {
            validationErrors.push('Quality gate report summary.failedStepIds must contain non-empty strings.');
            return [];
        }
    }
    return value;
};

const validateSummaryJsonAssert = (summaryJsonAssert, validationErrors, warnings) => {
    if (summaryJsonAssert === null || summaryJsonAssert === undefined) {
        return {
            exists: false,
            status: null,
            reasonCode: null,
        };
    }
    if (!isRecord(summaryJsonAssert)) {
        validationErrors.push('Quality gate report summary.summaryJsonAssert must be an object.');
        return {
            exists: true,
            status: null,
            reasonCode: null,
        };
    }

    if (!['SUCCESS', 'FAILED'].includes(summaryJsonAssert.status)) {
        validationErrors.push(
            `Quality gate report summary.summaryJsonAssert.status is invalid: ${String(summaryJsonAssert.status)}.`,
        );
    }

    if (summaryJsonAssert.reasonCode !== null && typeof summaryJsonAssert.reasonCode !== 'string') {
        validationErrors.push('Quality gate report summary.summaryJsonAssert.reasonCode must be string or null.');
    }
    if (summaryJsonAssert.reason !== null && typeof summaryJsonAssert.reason !== 'string') {
        validationErrors.push('Quality gate report summary.summaryJsonAssert.reason must be string or null.');
    }
    if (
        summaryJsonAssert.validationErrorCount !== null
        && (!Number.isFinite(summaryJsonAssert.validationErrorCount) || summaryJsonAssert.validationErrorCount < 0)
    ) {
        validationErrors.push('Quality gate report summary.summaryJsonAssert.validationErrorCount must be non-negative number or null.');
    }

    if (summaryJsonAssert.status === 'SUCCESS' && summaryJsonAssert.reasonCode !== 'OK') {
        warnings.push('Quality gate report summary.summaryJsonAssert.status is SUCCESS but reasonCode is not OK.');
    }

    return {
        exists: true,
        status: typeof summaryJsonAssert.status === 'string' ? summaryJsonAssert.status : null,
        reasonCode: typeof summaryJsonAssert.reasonCode === 'string' ? summaryJsonAssert.reasonCode : null,
    };
};

const validateReport = (report, options, validationErrors, warnings) => {
    if (!isRecord(report)) {
        validationErrors.push('Quality gate report must be an object.');
        return {
            schemaVersion: null,
            runId: null,
            status: null,
            totalSteps: null,
            successfulSteps: null,
            failedSteps: null,
            failedStepIds: [],
            hasSummaryJsonAssert: false,
        };
    }

    if (typeof report.schemaVersion !== 'string' || report.schemaVersion.trim().length === 0) {
        validationErrors.push('Quality gate report schemaVersion is required.');
    } else if (report.schemaVersion !== options.expectedReportSchemaVersion) {
        validationErrors.push(
            `Quality gate report schema version mismatch: expected ${options.expectedReportSchemaVersion}, actual ${report.schemaVersion}.`,
        );
    }

    if (typeof report.runId !== 'string' || report.runId.trim().length === 0) {
        validationErrors.push('Quality gate report runId is required.');
    }
    if (typeof report.startedAt !== 'string' || report.startedAt.trim().length === 0) {
        validationErrors.push('Quality gate report startedAt is required.');
    }
    if (typeof report.finishedAt !== 'string' || report.finishedAt.trim().length === 0) {
        validationErrors.push('Quality gate report finishedAt is required.');
    }
    if (!Number.isFinite(report.durationMs) || report.durationMs < 0) {
        validationErrors.push('Quality gate report durationMs must be a non-negative number.');
    }
    if (!['SUCCESS', 'FAILED'].includes(report.status)) {
        validationErrors.push(`Quality gate report status is invalid: ${String(report.status)}.`);
    }

    if (!isRecord(report.options)) {
        validationErrors.push('Quality gate report options is required.');
    }
    if (!isRecord(report.artifacts)) {
        validationErrors.push('Quality gate report artifacts is required.');
    } else {
        const requiredArtifacts = [
            'smokeReportFile',
            'perfReportFile',
            'summaryMarkdownFile',
            'summaryJsonFile',
            'qualityGateReportFile',
        ];
        for (const field of requiredArtifacts) {
            if (typeof report.artifacts[field] !== 'string' || report.artifacts[field].trim().length === 0) {
                validationErrors.push(`Quality gate report artifacts.${field} is required.`);
            }
        }
    }

    let reportFilePathMatchesArtifact = null;
    if (isRecord(report.artifacts) && typeof report.artifacts.qualityGateReportFile === 'string') {
        const expectedReportAbsolutePath = options.reportAbsolutePath;
        const artifactReportAbsolutePath = toComparableAbsolutePath(report.artifacts.qualityGateReportFile);
        reportFilePathMatchesArtifact = Boolean(
            expectedReportAbsolutePath
            && artifactReportAbsolutePath
            && expectedReportAbsolutePath === artifactReportAbsolutePath,
        );
        if (reportFilePathMatchesArtifact === false) {
            const mismatchMessage = `Quality gate report path mismatch: input ${options.reportFile} vs artifacts.qualityGateReportFile ${report.artifacts.qualityGateReportFile}.`;
            if (options.allowReportFilePathMismatch) {
                warnings.push(mismatchMessage);
            } else {
                validationErrors.push(mismatchMessage);
            }
        }
    }

    let artifactOptionPathCheckedCount = 0;
    let artifactOptionPathMismatchCount = 0;
    if (options.requireArtifactOptionPathMatch && isRecord(report.options) && isRecord(report.artifacts)) {
        const pathPairs = [
            ['reportFile', 'qualityGateReportFile'],
            ['summaryMarkdownFile', 'summaryMarkdownFile'],
            ['summaryJsonFile', 'summaryJsonFile'],
            ['smokeReportFile', 'smokeReportFile'],
            ['perfReportFile', 'perfReportFile'],
        ];

        for (const [optionsField, artifactsField] of pathPairs) {
            const optionsValue = report.options[optionsField];
            const artifactsValue = report.artifacts[artifactsField];
            if (
                typeof optionsValue !== 'string'
                || optionsValue.trim().length === 0
                || typeof artifactsValue !== 'string'
                || artifactsValue.trim().length === 0
            ) {
                continue;
            }

            artifactOptionPathCheckedCount += 1;
            const optionsAbsolutePath = toComparableAbsolutePath(optionsValue);
            const artifactsAbsolutePath = toComparableAbsolutePath(artifactsValue);
            if (optionsAbsolutePath !== artifactsAbsolutePath) {
                artifactOptionPathMismatchCount += 1;
                validationErrors.push(
                    `Quality gate report options/artifacts path mismatch: options.${optionsField}=${optionsValue}, artifacts.${artifactsField}=${artifactsValue}.`,
                );
            }
        }
    }

    const summary = report.summary;
    const steps = Array.isArray(report.steps) ? report.steps : null;

    if (!isRecord(summary)) {
        validationErrors.push('Quality gate report summary is required.');
    }
    if (!steps) {
        validationErrors.push('Quality gate report steps must be an array.');
    } else if (steps.length === 0) {
        validationErrors.push('Quality gate report steps must not be empty.');
    }

    let computedSuccessfulSteps = 0;
    let computedFailedSteps = 0;
    const stepIds = [];
    const stepIdSet = new Set();
    const failedStepIdsFromSteps = [];
    let summaryJsonAssertStep = null;

    if (steps) {
        for (const step of steps) {
            if (!isRecord(step)) {
                validationErrors.push('Quality gate report step must be an object.');
                continue;
            }

            if (typeof step.id !== 'string' || step.id.trim().length === 0) {
                validationErrors.push('Quality gate report step id is required.');
            } else {
                if (stepIdSet.has(step.id)) {
                    validationErrors.push(`Quality gate report step id must be unique: ${step.id}.`);
                }
                stepIds.push(step.id);
                stepIdSet.add(step.id);
            }

            if (typeof step.name !== 'string' || step.name.trim().length === 0) {
                validationErrors.push(`Quality gate report step name is required: ${String(step.id)}.`);
            }
            if (typeof step.command !== 'string' || step.command.trim().length === 0) {
                validationErrors.push(`Quality gate report step command is required: ${String(step.id)}.`);
            }
            if (!Array.isArray(step.args)) {
                validationErrors.push(`Quality gate report step args must be an array: ${String(step.id)}.`);
            }
            if (!['SUCCESS', 'FAILED', 'PENDING'].includes(step.status)) {
                validationErrors.push(`Quality gate report step status is invalid: ${String(step.id)}.`);
            }
            if (!Number.isFinite(step.durationMs) || step.durationMs < 0) {
                validationErrors.push(`Quality gate report step durationMs must be non-negative: ${String(step.id)}.`);
            }

            if (step.status === 'SUCCESS') {
                computedSuccessfulSteps += 1;
            }
            if (step.status === 'FAILED') {
                computedFailedSteps += 1;
                if (typeof step.id === 'string' && step.id.trim().length > 0) {
                    failedStepIdsFromSteps.push(step.id);
                }
            }

            if (step.id === 'summary-json-assert') {
                summaryJsonAssertStep = step;
            }
        }
    }

    const summaryFailedStepIds = normalizeFailedStepIds(summary?.failedStepIds, validationErrors);
    if (!Number.isFinite(summary?.totalSteps) || summary.totalSteps <= 0) {
        validationErrors.push('Quality gate report summary.totalSteps must be a positive number.');
    }
    if (!Number.isFinite(summary?.successfulSteps) || summary.successfulSteps < 0) {
        validationErrors.push('Quality gate report summary.successfulSteps must be a non-negative number.');
    }
    if (!Number.isFinite(summary?.failedSteps) || summary.failedSteps < 0) {
        validationErrors.push('Quality gate report summary.failedSteps must be a non-negative number.');
    }

    if (steps && Number.isFinite(summary?.totalSteps) && summary.totalSteps !== steps.length) {
        validationErrors.push(
            `Quality gate report summary.totalSteps mismatch: expected ${steps.length}, actual ${summary.totalSteps}.`,
        );
    }
    if (Number.isFinite(summary?.successfulSteps) && summary.successfulSteps !== computedSuccessfulSteps) {
        validationErrors.push(
            `Quality gate report summary.successfulSteps mismatch: expected ${computedSuccessfulSteps}, actual ${summary.successfulSteps}.`,
        );
    }
    if (Number.isFinite(summary?.failedSteps) && summary.failedSteps !== computedFailedSteps) {
        validationErrors.push(
            `Quality gate report summary.failedSteps mismatch: expected ${computedFailedSteps}, actual ${summary.failedSteps}.`,
        );
    }

    for (const stepId of summaryFailedStepIds) {
        if (!stepIdSet.has(stepId)) {
            validationErrors.push(`Quality gate report summary.failedStepIds includes unknown step id: ${stepId}.`);
        }
    }
    if (summaryFailedStepIds.length !== failedStepIdsFromSteps.length) {
        validationErrors.push(
            `Quality gate report summary.failedStepIds count mismatch: expected ${failedStepIdsFromSteps.length}, actual ${summaryFailedStepIds.length}.`,
        );
    } else {
        for (const stepId of failedStepIdsFromSteps) {
            if (!summaryFailedStepIds.includes(stepId)) {
                validationErrors.push(`Quality gate report summary.failedStepIds missing failed step id: ${stepId}.`);
            }
        }
    }

    const summaryJsonAssertInfo = validateSummaryJsonAssert(
        summary?.summaryJsonAssert,
        validationErrors,
        warnings,
    );
    if (options.requireSummaryJsonAssert && !summaryJsonAssertInfo.exists) {
        validationErrors.push('Quality gate report summary.summaryJsonAssert is required by --require-summary-json-assert.');
    }
    if (summaryJsonAssertStep && !summaryJsonAssertInfo.exists) {
        validationErrors.push('Quality gate report summary.summaryJsonAssert is required when summary-json-assert step exists.');
    }
    if (!summaryJsonAssertStep && summaryJsonAssertInfo.exists) {
        warnings.push('Quality gate report has summary.summaryJsonAssert but no summary-json-assert step.');
    }
    if (summaryJsonAssertStep && summaryJsonAssertInfo.exists) {
        if (summaryJsonAssertStep.status !== summaryJsonAssertInfo.status) {
            validationErrors.push(
                `Quality gate report summaryJsonAssert status mismatch: step=${summaryJsonAssertStep.status}, summary=${summaryJsonAssertInfo.status}.`,
            );
        }

        const stepAssertion = isRecord(summaryJsonAssertStep.assertion)
            ? summaryJsonAssertStep.assertion
            : null;
        if (!stepAssertion) {
            warnings.push('Quality gate report summary-json-assert step has no assertion object.');
        } else {
            const stepReasonCode = typeof stepAssertion.reasonCode === 'string'
                ? stepAssertion.reasonCode
                : null;
            if (
                summaryJsonAssertInfo.reasonCode
                && stepReasonCode
                && summaryJsonAssertInfo.reasonCode !== stepReasonCode
            ) {
                validationErrors.push(
                    `Quality gate report summaryJsonAssert reasonCode mismatch: step=${stepReasonCode}, summary=${summaryJsonAssertInfo.reasonCode}.`,
                );
            }
        }
    }

    if (report.status === 'SUCCESS' && failedStepIdsFromSteps.length > 0) {
        validationErrors.push('Quality gate report status SUCCESS cannot contain failed steps.');
    }
    if (report.status === 'FAILED' && failedStepIdsFromSteps.length === 0) {
        warnings.push('Quality gate report status FAILED has no failed steps.');
    }

    return {
        schemaVersion: typeof report.schemaVersion === 'string' ? report.schemaVersion : null,
        runId: typeof report.runId === 'string' ? report.runId : null,
        status: typeof report.status === 'string' ? report.status : null,
        totalSteps: Number.isFinite(summary?.totalSteps) ? summary.totalSteps : null,
        successfulSteps: Number.isFinite(summary?.successfulSteps) ? summary.successfulSteps : null,
        failedSteps: Number.isFinite(summary?.failedSteps) ? summary.failedSteps : null,
        failedStepIds: summaryFailedStepIds,
        hasSummaryJsonAssert: summaryJsonAssertInfo.exists,
        reportFilePathMatchesArtifact,
        artifactOptionPathCheckedCount,
        artifactOptionPathMismatchCount,
        artifactQualityGateReportFile: typeof report.artifacts?.qualityGateReportFile === 'string'
            ? report.artifacts.qualityGateReportFile
            : null,
        artifactSummaryMarkdownFile: typeof report.artifacts?.summaryMarkdownFile === 'string'
            ? report.artifacts.summaryMarkdownFile
            : null,
        artifactSummaryJsonFile: typeof report.artifacts?.summaryJsonFile === 'string'
            ? report.artifacts.summaryJsonFile
            : null,
        artifactSmokeReportFile: typeof report.artifacts?.smokeReportFile === 'string'
            ? report.artifacts.smokeReportFile
            : null,
        artifactPerfReportFile: typeof report.artifacts?.perfReportFile === 'string'
            ? report.artifacts.perfReportFile
            : null,
        stepIds,
    };
};

const writeSummaryJson = async (summaryJsonAbsolutePath, summary) => {
    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
    console.log(`[workflow-quality-gate-report-validate] validation summary json written to ${summaryJsonAbsolutePath}`);
};

async function main() {
    const reportFile = readArgValue('--report-file', DEFAULT_REPORT_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const expectedReportSchemaVersion = readArgValue(
        '--expected-report-schema-version',
        DEFAULT_EXPECTED_REPORT_SCHEMA_VERSION,
    );
    const requireSummaryJsonAssert = args.includes('--require-summary-json-assert');
    const allowReportFilePathMismatch = args.includes('--allow-report-file-path-mismatch');
    const requireArtifactOptionPathMatch = !args.includes('--skip-artifact-option-path-check');

    const reportAbsolutePath = toAbsolutePath(reportFile);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);
    const warnings = [];
    const validationErrors = [];
    let report = null;

    try {
        const reportContent = await readFile(reportAbsolutePath, 'utf-8');
        report = JSON.parse(reportContent);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        validationErrors.push(`Failed to read quality gate report: ${message}`);
    }

    const reportSummary = validateReport(
        report,
        {
            expectedReportSchemaVersion,
            requireSummaryJsonAssert,
            allowReportFilePathMismatch,
            requireArtifactOptionPathMatch,
            reportFile,
            reportAbsolutePath,
        },
        validationErrors,
        warnings,
    );

    const summaryInputs = {
        reportFile,
        expectedReportSchemaVersion,
        summaryJsonFile,
        requireSummaryJsonAssert,
        allowReportFilePathMismatch,
        requireArtifactOptionPathMatch,
    };
    const failureIndex = buildFailureIndex(validationErrors, summaryInputs, reportSummary);
    const failureIndexDiagnostics = buildFailureIndexDiagnostics(validationErrors, failureIndex);

    const summary = {
        schemaVersion: VALIDATION_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status: validationErrors.length > 0 ? 'FAILED' : 'SUCCESS',
        inputs: summaryInputs,
        report: reportSummary,
        firstValidationError: failureIndex?.message || validationErrors[0] || null,
        failureIndex,
        failureIndexDiagnostics,
        validationErrorCount: validationErrors.length,
        warningCount: warnings.length,
        warnings,
        validationErrors,
    };

    await writeSummaryJson(summaryJsonAbsolutePath, summary);

    if (validationErrors.length > 0) {
        console.error(
            `[workflow-quality-gate-report-validate] failed: validation failed: ${validationErrors.join(' ')}`,
        );
        process.exitCode = 1;
        return;
    }

    console.log('[workflow-quality-gate-report-validate] quality gate report validation passed.');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-quality-gate-report-validate] failed: ${message}`);
    process.exitCode = 1;
});
