import { createHash } from 'node:crypto';
import {
    DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS,
    buildQualityGateFailureIndexSnapshotPayload,
    buildQualityGateValidationReasonCodeCounts,
    formatCountMap,
    resolveQualityGateValidationGuidance,
    serializeQualityGateFailureIndexSnapshot,
} from './workflow-quality-gate-validation-guidance.mjs';

const fallback = (value, defaultValue = 'N/A') => {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : defaultValue;
    }
    return value;
};

const safeCount = (value) => (Array.isArray(value) ? value.length : 0);
const sumCountMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 0;
    }
    return Object.values(value).reduce(
        (sum, count) => sum + (Number.isFinite(count) ? count : 0),
        0,
    );
};
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const buildStepCommand = (step) => `${step.command || ''} ${Array.isArray(step.args) ? step.args.join(' ') : ''}`.trim();
const QUALITY_GATE_SUGGESTED_COMMAND_SOURCE = Object.freeze({
    VALIDATION_FAILURE_INDEX: 'VALIDATION_FAILURE_INDEX',
    FAILURE_FINGERPRINT: 'FAILURE_FINGERPRINT',
    FAILED_STEP: 'FAILED_STEP',
    NOT_AVAILABLE: 'N/A',
});
const SELF_CHECK_SUGGESTED_COMMAND_SOURCE = Object.freeze({
    FAILURE_FINGERPRINT: 'FAILURE_FINGERPRINT',
    FAILED_STEP: 'FAILED_STEP',
    NOT_AVAILABLE: 'N/A',
});
const QUALITY_GATE_SUGGESTED_COMMAND_SOURCE_PRIORITY = Object.freeze([
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.VALIDATION_FAILURE_INDEX,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILED_STEP,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.NOT_AVAILABLE,
]);
const SELF_CHECK_SUGGESTED_COMMAND_SOURCE_PRIORITY = Object.freeze([
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT,
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILED_STEP,
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE.NOT_AVAILABLE,
]);
const QUALITY_GATE_FIRST_FIX_ROUTE = Object.freeze({
    VALIDATION_COMMAND: 'RUN_QUALITY_VALIDATION_SUGGESTED_COMMAND',
    FINGERPRINT_COMMAND: 'RUN_QUALITY_FINGERPRINT_COMMAND',
    FAILED_STEP_COMMAND: 'RUN_QUALITY_FAILED_STEP_COMMAND',
    MANUAL_INSPECTION: 'INSPECT_QUALITY_REPORT_STEPS_AND_FAILURE_INDEX',
});
const SELF_CHECK_FIRST_FIX_ROUTE = Object.freeze({
    FINGERPRINT_COMMAND: 'RUN_SELF_CHECK_FINGERPRINT_COMMAND',
    FAILED_STEP_COMMAND: 'RUN_SELF_CHECK_FAILED_STEP_COMMAND',
    MANUAL_INSPECTION: 'INSPECT_SELF_CHECK_REPORT_STEPS',
});
const extractFirstOutputLine = (outputTail) => {
    if (typeof outputTail !== 'string' || outputTail.trim().length === 0) {
        return null;
    }
    const firstLine = outputTail
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    return firstLine || null;
};
const normalizeFailureFingerprintLine = (value, maxChars = 240) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized.length === 0) {
        return null;
    }
    if (normalized.length <= maxChars) {
        return normalized;
    }
    return normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd().concat('...');
};
const buildFailureFingerprintFromStep = (step) => {
    if (!isRecord(step)) {
        return null;
    }
    const stepId = typeof step.id === 'string' && step.id.trim().length > 0
        ? step.id
        : null;
    const command = buildStepCommand(step);
    if (!stepId || command.length === 0) {
        return null;
    }
    const exitCode = Number.isFinite(step.exitCode) ? step.exitCode : null;
    const firstOutputLine = extractFirstOutputLine(step.outputTail);
    const normalizedOutputLine = normalizeFailureFingerprintLine(firstOutputLine);
    const signature = [
        `stepId=${stepId}`,
        `exitCode=${exitCode === null ? 'N/A' : String(exitCode)}`,
        `output=${normalizedOutputLine || 'N/A'}`,
    ].join('|');
    const hash = createHash('sha256').update(signature).digest('hex');
    return {
        stepId,
        command,
        exitCode,
        firstOutputLine: firstOutputLine || null,
        normalizedOutputLine: normalizedOutputLine || null,
        signature,
        hashAlgorithm: 'sha256',
        hash,
    };
};

const extractSummaryJsonAssert = (report) => {
    const summaryJsonAssertFromSummary = report.summary?.summaryJsonAssert || null;
    const summaryJsonAssertFromSteps = Array.isArray(report.steps)
        ? report.steps.find((step) => step?.id === 'summary-json-assert')
        : null;

    const status = fallback(
        summaryJsonAssertFromSummary?.status
            || summaryJsonAssertFromSteps?.status,
    );
    const reasonCode = fallback(summaryJsonAssertFromSummary?.reasonCode);
    const reason = fallback(
        summaryJsonAssertFromSummary?.reason
            || summaryJsonAssertFromSteps?.outputTail,
    );
    const expectedSchemaVersion = fallback(summaryJsonAssertFromSummary?.expectedSchemaVersion);
    const actualSchemaVersion = fallback(summaryJsonAssertFromSummary?.actualSchemaVersion);
    const summaryStatus = fallback(summaryJsonAssertFromSummary?.summaryStatus);
    const validationErrorCount = typeof summaryJsonAssertFromSummary?.validationErrorCount === 'number'
        ? String(summaryJsonAssertFromSummary.validationErrorCount)
        : 'N/A';

    return {
        status,
        reasonCode,
        reason,
        expectedSchemaVersion,
        actualSchemaVersion,
        summaryStatus,
        validationErrorCount,
    };
};

const renderQualityGateSummaryMarkdown = (report, options = {}) => {
    const maxReasonChars = Number.isFinite(options.maxReasonChars) && options.maxReasonChars > 0
        ? Math.floor(options.maxReasonChars)
        : 300;
    const failed = (report.summary?.failedStepIds || []).join(', ') || 'N/A';
    const smokeReport = fallback(report.artifacts?.smokeReportFile);
    const perfReport = fallback(report.artifacts?.perfReportFile);
    const summaryReport = fallback(report.artifacts?.summaryMarkdownFile);
    const summaryJsonReport = fallback(report.artifacts?.summaryJsonFile);
    const durationMs = typeof report.durationMs === 'number'
        ? report.durationMs.toFixed(2)
        : 'N/A';
    const assertInfo = extractSummaryJsonAssert(report);
    const reason = assertInfo.reason !== 'N/A'
        ? assertInfo.reason.slice(0, maxReasonChars)
        : 'N/A';

    return [
        '## Workflow Quality Gate',
        '',
        `- Status: \`${fallback(report.status, 'UNKNOWN')}\``,
        `- Run ID: \`${fallback(report.runId)}\``,
        `- Failed Steps: \`${failed}\``,
        `- Duration: \`${durationMs}ms\``,
        `- Smoke Report: \`${smokeReport}\``,
        `- Perf Report: \`${perfReport}\``,
        `- Summary Report: \`${summaryReport}\``,
        `- Summary JSON: \`${summaryJsonReport}\``,
        `- Summary JSON Assert: \`${assertInfo.status}\``,
        `- Summary JSON Assert Code: \`${assertInfo.reasonCode}\``,
        `- Summary JSON Assert Reason: \`${reason}\``,
        `- Summary JSON Assert Schema: expected=\`${assertInfo.expectedSchemaVersion}\`, actual=\`${assertInfo.actualSchemaVersion}\``,
        `- Summary JSON Assert Inputs: summaryStatus=\`${assertInfo.summaryStatus}\`, validationErrorCount=\`${assertInfo.validationErrorCount}\``,
    ].join('\n');
};

const appendTopItems = (lines, title, items, maxItems) => {
    if (!Array.isArray(items) || items.length === 0) {
        return;
    }
    lines.push('');
    lines.push(`### ${title}`);
    lines.push('');
    for (const item of items.slice(0, maxItems)) {
        lines.push(`- ${item}`);
    }
};

const renderWorkflowReportValidationSummaryMarkdown = (summary, options = {}) => {
    const maxItems = Number.isFinite(options.maxItems) && options.maxItems > 0
        ? Math.floor(options.maxItems)
        : 3;
    const warnings = Array.isArray(summary?.warnings) ? summary.warnings : [];
    const validationErrors = Array.isArray(summary?.validationErrors)
        ? summary.validationErrors
        : [];
    const smoke = summary?.smoke || null;
    const perf = summary?.perf || null;
    const qualityGate = summary?.qualityGate || null;

    const lines = [
        '## Workflow Report Validation (JSON)',
        '',
        `- Status: \`${fallback(summary?.status, 'UNKNOWN')}\``,
        `- Schema Version: \`${fallback(summary?.schemaVersion)}\``,
        `- Generated At: \`${fallback(summary?.generatedAt)}\``,
        `- Warning Count: \`${safeCount(warnings)}\``,
        `- Validation Error Count: \`${safeCount(validationErrors)}\``,
        `- Smoke Status: \`${fallback(smoke?.status)}\``,
        `- Smoke Mode: \`${fallback(smoke?.mode)}\``,
        `- Perf Violations: \`${typeof perf?.violations === 'number' ? perf.violations : 'N/A'}\``,
        `- Quality Gate Status: \`${fallback(qualityGate?.status)}\``,
        `- Quality Gate Run ID: \`${fallback(qualityGate?.runId)}\``,
    ];

    appendTopItems(lines, 'Top Warnings', warnings, maxItems);
    appendTopItems(lines, 'Top Validation Errors', validationErrors, maxItems);

    return lines.join('\n');
};

const resolveQualityGateFirstFixRoute = (suggestedCommandSource) => {
    if (suggestedCommandSource === QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.VALIDATION_FAILURE_INDEX) {
        return QUALITY_GATE_FIRST_FIX_ROUTE.VALIDATION_COMMAND;
    }
    if (suggestedCommandSource === QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT) {
        return QUALITY_GATE_FIRST_FIX_ROUTE.FINGERPRINT_COMMAND;
    }
    if (suggestedCommandSource === QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILED_STEP) {
        return QUALITY_GATE_FIRST_FIX_ROUTE.FAILED_STEP_COMMAND;
    }
    return QUALITY_GATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION;
};

const resolveSelfCheckFirstFixRoute = (suggestedCommandSource) => {
    if (suggestedCommandSource === SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT) {
        return SELF_CHECK_FIRST_FIX_ROUTE.FINGERPRINT_COMMAND;
    }
    if (suggestedCommandSource === SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILED_STEP) {
        return SELF_CHECK_FIRST_FIX_ROUTE.FAILED_STEP_COMMAND;
    }
    return SELF_CHECK_FIRST_FIX_ROUTE.MANUAL_INSPECTION;
};

const resolveSelfCheckQuickLocateInfo = (selfCheckReport) => {
    const steps = Array.isArray(selfCheckReport?.steps) ? selfCheckReport.steps : [];
    const failedStepIds = Array.isArray(selfCheckReport?.summary?.failedStepIds)
        ? selfCheckReport.summary.failedStepIds
        : [];
    const firstFailedStepId = failedStepIds[0] || steps.find((step) => step?.status === 'FAILED')?.id || null;
    const firstFailedStep = firstFailedStepId
        ? steps.find((step) => step?.id === firstFailedStepId) || null
        : null;
    const summaryFailureFingerprint = isRecord(selfCheckReport?.summary?.failureFingerprint)
        ? selfCheckReport.summary.failureFingerprint
        : null;
    const computedFailureFingerprint = summaryFailureFingerprint
        ? null
        : buildFailureFingerprintFromStep(firstFailedStep);
    const resolvedFailureFingerprint = summaryFailureFingerprint || computedFailureFingerprint;
    const resolvedFailureFingerprintSource = summaryFailureFingerprint
        ? 'SUMMARY'
        : (computedFailureFingerprint ? 'COMPUTED' : 'N/A');
    const resolvedFailureFingerprintCommand = typeof resolvedFailureFingerprint?.command === 'string'
        && resolvedFailureFingerprint.command.trim().length > 0
        ? resolvedFailureFingerprint.command
        : null;
    const fallbackSuggestedCommand = firstFailedStep
        ? buildStepCommand(firstFailedStep)
        : null;
    const suggestedCommandSource = resolvedFailureFingerprintCommand
        ? SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT
        : (
            fallbackSuggestedCommand
                ? SELF_CHECK_SUGGESTED_COMMAND_SOURCE.FAILED_STEP
                : SELF_CHECK_SUGGESTED_COMMAND_SOURCE.NOT_AVAILABLE
        );
    const suggestedCommand = resolvedFailureFingerprintCommand || fallbackSuggestedCommand;
    const firstFailedOutput = resolvedFailureFingerprint?.normalizedOutputLine
        || resolvedFailureFingerprint?.firstOutputLine
        || extractFirstOutputLine(firstFailedStep?.outputTail);

    return {
        failedStepIds,
        failureFingerprintSource: resolvedFailureFingerprintSource,
        failureFingerprintStep: fallback(resolvedFailureFingerprint?.stepId),
        failureFingerprintHash: fallback(resolvedFailureFingerprint?.hash),
        suggestedCommandSource,
        firstFixRoute: resolveSelfCheckFirstFixRoute(suggestedCommandSource),
        suggestedCommand: toSingleLine(suggestedCommand),
        firstFailedOutput: toSingleLine(firstFailedOutput),
    };
};

const resolveQualityQuickLocateInfo = (qualityReport, qualityReportValidation) => {
    const steps = Array.isArray(qualityReport?.steps) ? qualityReport.steps : [];
    const summaryFailedStepIds = Array.isArray(qualityReport?.summary?.failedStepIds)
        ? qualityReport.summary.failedStepIds
        : [];
    const computedFailedStepIds = steps
        .filter((step) => step?.status === 'FAILED')
        .map((step) => (typeof step?.id === 'string' && step.id.trim().length > 0 ? step.id : null))
        .filter(Boolean);
    const failedStepIds = summaryFailedStepIds.length > 0 ? summaryFailedStepIds : computedFailedStepIds;
    const firstFailedStepId = failedStepIds[0] || computedFailedStepIds[0] || null;
    const firstFailedStep = firstFailedStepId
        ? steps.find((step) => step?.id === firstFailedStepId) || null
        : null;
    const validationSuggestedCommand = typeof qualityReportValidation?.failureIndex?.suggestedCommand === 'string'
        && qualityReportValidation.failureIndex.suggestedCommand.trim().length > 0
        ? qualityReportValidation.failureIndex.suggestedCommand
        : null;
    const summaryFailureFingerprint = isRecord(qualityReport?.summary?.failureFingerprint)
        ? qualityReport.summary.failureFingerprint
        : null;
    const computedFailureFingerprint = summaryFailureFingerprint
        ? null
        : buildFailureFingerprintFromStep(firstFailedStep);
    const resolvedFailureFingerprint = summaryFailureFingerprint || computedFailureFingerprint;
    const resolvedFailureFingerprintSource = summaryFailureFingerprint
        ? 'SUMMARY'
        : (computedFailureFingerprint ? 'COMPUTED' : 'N/A');
    const resolvedFailureFingerprintCommand = typeof resolvedFailureFingerprint?.command === 'string'
        && resolvedFailureFingerprint.command.trim().length > 0
        ? resolvedFailureFingerprint.command
        : null;
    const fallbackSuggestedCommand = firstFailedStep
        ? buildStepCommand(firstFailedStep)
        : null;
    const suggestedCommandSource = validationSuggestedCommand
        ? QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.VALIDATION_FAILURE_INDEX
        : (
            resolvedFailureFingerprintCommand
                ? QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILURE_FINGERPRINT
                : (
                    fallbackSuggestedCommand
                        ? QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.FAILED_STEP
                        : QUALITY_GATE_SUGGESTED_COMMAND_SOURCE.NOT_AVAILABLE
                )
        );
    const firstFailedOutput = resolvedFailureFingerprint?.normalizedOutputLine
        || resolvedFailureFingerprint?.firstOutputLine
        || extractFirstOutputLine(firstFailedStep?.outputTail);

    return {
        failedStepIds,
        failureFingerprintSource: resolvedFailureFingerprintSource,
        failureFingerprintStep: fallback(resolvedFailureFingerprint?.stepId),
        failureFingerprintHash: fallback(resolvedFailureFingerprint?.hash),
        validationSuggestedCommand: toSingleLine(validationSuggestedCommand),
        suggestedCommandSource,
        firstFixRoute: resolveQualityGateFirstFixRoute(suggestedCommandSource),
        suggestedCommand: toSingleLine(
            validationSuggestedCommand
            || resolvedFailureFingerprintCommand
            || fallbackSuggestedCommand,
        ),
        firstFailedOutput: toSingleLine(firstFailedOutput),
    };
};

const renderWorkflowQuickLocateIndexMarkdown = ({
    qualityReport,
    qualityReportValidation,
    selfCheckReport,
    selfCheckValidation,
} = {}) => {
    const qualityQuickLocate = resolveQualityQuickLocateInfo(qualityReport, qualityReportValidation);
    const qualityFailedStepIds = qualityQuickLocate.failedStepIds.length > 0
        ? qualityQuickLocate.failedStepIds.join(', ')
        : 'N/A';
    const qualityValidationFailureReasonCode = fallback(qualityReportValidation?.failureIndex?.reasonCode);
    const qualityValidationSuggestedCommand = qualityQuickLocate.validationSuggestedCommand;
    const selfCheckQuickLocate = resolveSelfCheckQuickLocateInfo(selfCheckReport);
    const selfCheckFailedStepIds = selfCheckQuickLocate.failedStepIds.length > 0
        ? selfCheckQuickLocate.failedStepIds.join(', ')
        : 'N/A';
    const selfCheckValidationFingerprintHash = fallback(
        selfCheckValidation?.report?.failureFingerprintHash,
    );

    return [
        '## Workflow Quick Locate Index',
        '',
        `- Quality Gate Status: \`${fallback(qualityReport?.status)}\``,
        `- Quality Gate Failed Steps: \`${qualityFailedStepIds}\``,
        `- Quality Failure Fingerprint Source: \`${qualityQuickLocate.failureFingerprintSource}\``,
        `- Quality Failure Fingerprint Step: \`${qualityQuickLocate.failureFingerprintStep}\``,
        `- Quality Failure Fingerprint Hash: \`${qualityQuickLocate.failureFingerprintHash}\``,
        `- Quality Validation Status: \`${fallback(qualityReportValidation?.status)}\``,
        `- Quality Validation Reason Code: \`${qualityValidationFailureReasonCode}\``,
        `- Quality Validation Suggested Command: \`${qualityValidationSuggestedCommand}\``,
        `- Quality Gate Suggested Command Source Priority: \`${QUALITY_GATE_SUGGESTED_COMMAND_SOURCE_PRIORITY.join(' > ')}\``,
        `- Quality Gate Suggested Command Source: \`${qualityQuickLocate.suggestedCommandSource}\``,
        `- Quality Gate First Fix Route: \`${qualityQuickLocate.firstFixRoute}\``,
        `- Quality Gate Suggested Command: \`${qualityQuickLocate.suggestedCommand}\``,
        `- Quality Gate First Failed Output: \`${qualityQuickLocate.firstFailedOutput}\``,
        `- Self-Check Status: \`${fallback(selfCheckReport?.status)}\``,
        `- Self-Check Failed Steps: \`${selfCheckFailedStepIds}\``,
        `- Self-Check Failure Fingerprint Source: \`${selfCheckQuickLocate.failureFingerprintSource}\``,
        `- Self-Check Failure Fingerprint Step: \`${selfCheckQuickLocate.failureFingerprintStep}\``,
        `- Self-Check Failure Fingerprint Hash: \`${selfCheckQuickLocate.failureFingerprintHash}\``,
        `- Self-Check Suggested Command Source Priority: \`${SELF_CHECK_SUGGESTED_COMMAND_SOURCE_PRIORITY.join(' > ')}\``,
        `- Self-Check Suggested Command Source: \`${selfCheckQuickLocate.suggestedCommandSource}\``,
        `- Self-Check First Fix Route: \`${selfCheckQuickLocate.firstFixRoute}\``,
        `- Self-Check Suggested Command: \`${selfCheckQuickLocate.suggestedCommand}\``,
        `- Self-Check First Failed Output: \`${selfCheckQuickLocate.firstFailedOutput}\``,
        `- Self-Check Validation Status: \`${fallback(selfCheckValidation?.status)}\``,
        `- Self-Check Validation Fingerprint Hash: \`${selfCheckValidationFingerprintHash}\``,
    ].join('\n');
};

const toSingleLine = (value) => {
    const normalized = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized.length > 0 ? normalized : 'N/A';
};
const SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE = Object.freeze({
    STEP_OVERRIDE: 'STEP_OVERRIDE',
    FAILED_STEP: 'FAILED_STEP',
    NOT_AVAILABLE: 'N/A',
});
const SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE_PRIORITY = Object.freeze([
    SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE,
    SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP,
    SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
]);
const SELF_CHECK_SUITE_QUICK_LOCATE_FIRST_FIX_ROUTE = Object.freeze({
    STEP_OVERRIDE_COMMAND: 'RERUN_QUICK_LOCATE_COMMAND',
    FAILED_STEP_COMMAND: 'RERUN_FAILED_STEP_COMMAND',
    MANUAL_INSPECTION: 'INSPECT_SELF_CHECK_REPORT_STEPS',
});
const resolveSelfCheckSuiteQuickLocateRoute = (source) => {
    if (source === SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE) {
        return SELF_CHECK_SUITE_QUICK_LOCATE_FIRST_FIX_ROUTE.STEP_OVERRIDE_COMMAND;
    }
    if (source === SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP) {
        return SELF_CHECK_SUITE_QUICK_LOCATE_FIRST_FIX_ROUTE.FAILED_STEP_COMMAND;
    }
    return SELF_CHECK_SUITE_QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION;
};

const renderWorkflowSummarySelfCheckMarkdown = (report, options = {}) => {
    const maxFailedDetails = Number.isFinite(options.maxFailedDetails) && options.maxFailedDetails > 0
        ? Math.floor(options.maxFailedDetails)
        : 2;
    const maxOutputTailChars = Number.isFinite(options.maxOutputTailChars) && options.maxOutputTailChars > 0
        ? Math.floor(options.maxOutputTailChars)
        : 200;
    const maxFailureFingerprintSignatureChars = Number.isFinite(options.maxFailureFingerprintSignatureChars)
        && options.maxFailureFingerprintSignatureChars > 0
        ? Math.floor(options.maxFailureFingerprintSignatureChars)
        : 280;

    const summary = report?.summary || {};
    const steps = Array.isArray(report?.steps) ? report.steps : [];
    const failedStepIds = Array.isArray(summary?.failedStepIds) ? summary.failedStepIds : [];
    const failedSteps = steps.filter((step) => step?.status === 'FAILED');
    const pendingSteps = steps.filter((step) => step?.status === 'PENDING');
    const durationMs = typeof report?.durationMs === 'number' ? report.durationMs.toFixed(2) : 'N/A';
    const reportFile = fallback(report?.reportFile);
    const firstFailedStepId = failedStepIds[0] || failedSteps[0]?.id || null;
    const firstFailedStep = firstFailedStepId
        ? steps.find((step) => step?.id === firstFailedStepId) || null
        : null;
    const firstFailedCommand = firstFailedStep
        ? `${fallback(firstFailedStep.command, '')} ${Array.isArray(firstFailedStep.args) ? firstFailedStep.args.join(' ') : ''}`.trim()
        : 'N/A';
    const fallbackRecoveryCommands = {
        'report-validate-self-check': 'pnpm workflow:reports:validate:self-check',
        'summary-renderers-self-check': 'pnpm workflow:summary:renderers:self-check',
        'quality-gate-validation-guidance-self-check': 'pnpm workflow:quality:validation:guidance:self-check',
        'report-summary-self-check': 'pnpm workflow:reports:summary:self-check',
        'ci-step-summary-self-check': 'pnpm workflow:ci:step-summary:self-check',
        'quality-gate-self-check': 'pnpm workflow:quality:gate:self-check',
        'quality-gate-report-validate-self-check': 'pnpm workflow:quality:report:validate:self-check',
    };
    const defaultQuickLocateCommandSource = firstFailedStepId
        ? (
            fallbackRecoveryCommands[firstFailedStepId]
                ? SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE
                : (
                    firstFailedCommand !== 'N/A'
                        ? SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP
                        : SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE
                )
        )
        : SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE;
    const quickLocateCommandSourcePriority = Array.isArray(summary?.quickLocateCommandSourcePriority)
        && summary.quickLocateCommandSourcePriority.length > 0
        && summary.quickLocateCommandSourcePriority.every(
            (item) => typeof item === 'string' && item.trim().length > 0,
        )
        ? summary.quickLocateCommandSourcePriority
        : SELF_CHECK_SUITE_QUICK_LOCATE_COMMAND_SOURCE_PRIORITY;
    const quickLocateCommandSource = typeof summary?.quickLocateCommandSource === 'string'
        && summary.quickLocateCommandSource.trim().length > 0
        ? summary.quickLocateCommandSource
        : defaultQuickLocateCommandSource;
    const fallbackQuickLocateCommand = firstFailedStepId
        ? fallbackRecoveryCommands[firstFailedStepId] || (firstFailedCommand !== 'N/A' ? firstFailedCommand : null)
        : null;
    const quickLocateSuggestedCommand = toSingleLine(
        (typeof summary?.quickLocateCommand === 'string' && summary.quickLocateCommand.trim().length > 0)
            ? summary.quickLocateCommand
            : fallbackQuickLocateCommand,
    );
    const quickLocateFirstFixRoute = typeof summary?.quickLocateFirstFixRoute === 'string'
        && summary.quickLocateFirstFixRoute.trim().length > 0
        ? summary.quickLocateFirstFixRoute
        : resolveSelfCheckSuiteQuickLocateRoute(quickLocateCommandSource);
    const quickLocateFirstFailedOutput = toSingleLine(
        (typeof summary?.quickLocateFirstFailedOutput === 'string' && summary.quickLocateFirstFailedOutput.trim().length > 0)
            ? summary.quickLocateFirstFailedOutput
            : extractFirstOutputLine(firstFailedStep?.outputTail),
    );
    const firstFailedSuggestedAction = quickLocateSuggestedCommand !== 'N/A'
        ? quickLocateSuggestedCommand
        : (
            firstFailedStepId
                ? fallbackRecoveryCommands[firstFailedStepId] || firstFailedCommand
                : 'N/A'
        );
    const summaryFailureFingerprint = isRecord(summary?.failureFingerprint)
        ? summary.failureFingerprint
        : null;
    const computedFailureFingerprint = buildFailureFingerprintFromStep(firstFailedStep);
    const failureFingerprintSource = summaryFailureFingerprint
        ? 'SUMMARY'
        : (computedFailureFingerprint ? 'COMPUTED' : 'N/A');
    const failureFingerprintStepId = typeof summaryFailureFingerprint?.stepId === 'string'
        ? summaryFailureFingerprint.stepId
        : computedFailureFingerprint?.stepId;
    const failureFingerprintCommand = typeof summaryFailureFingerprint?.command === 'string'
        ? summaryFailureFingerprint.command
        : computedFailureFingerprint?.command;
    const failureFingerprintFirstOutput = typeof summaryFailureFingerprint?.firstOutputLine === 'string'
        ? summaryFailureFingerprint.firstOutputLine
        : computedFailureFingerprint?.firstOutputLine;
    const failureFingerprintHash = typeof summaryFailureFingerprint?.hash === 'string'
        ? summaryFailureFingerprint.hash
        : computedFailureFingerprint?.hash;
    const failureFingerprintHashAlgorithm = typeof summaryFailureFingerprint?.hashAlgorithm === 'string'
        ? summaryFailureFingerprint.hashAlgorithm
        : computedFailureFingerprint?.hashAlgorithm;
    const failureFingerprintSignatureRaw = typeof summaryFailureFingerprint?.signature === 'string'
        ? summaryFailureFingerprint.signature
        : computedFailureFingerprint?.signature;
    const failureFingerprintSignature = failureFingerprintSignatureRaw
        ? toSingleLine(failureFingerprintSignatureRaw).slice(0, maxFailureFingerprintSignatureChars)
        : 'N/A';

    const lines = [
        '## Workflow Summary Self-Check Suite',
        '',
        `- Status: \`${fallback(report?.status, 'UNKNOWN')}\``,
        `- Run ID: \`${fallback(report?.runId)}\``,
        `- Total Steps: \`${typeof summary?.totalSteps === 'number' ? summary.totalSteps : safeCount(steps)}\``,
        `- Successful Steps: \`${typeof summary?.successfulSteps === 'number' ? summary.successfulSteps : 'N/A'}\``,
        `- Failed Steps: \`${typeof summary?.failedSteps === 'number' ? summary.failedSteps : safeCount(failedSteps)}\``,
        `- Pending Steps: \`${safeCount(pendingSteps)}\``,
        `- Failed Step IDs: \`${failedStepIds.length > 0 ? failedStepIds.join(', ') : 'N/A'}\``,
        `- First Failed Step: \`${fallback(firstFailedStepId)}\``,
        `- First Failed Command: \`${toSingleLine(firstFailedCommand)}\``,
        `- First Failed Suggested Action: \`${toSingleLine(firstFailedSuggestedAction)}\``,
        `- Quick Locate Command Source Priority: \`${quickLocateCommandSourcePriority.join(' > ')}\``,
        `- Quick Locate Command Source: \`${quickLocateCommandSource}\``,
        `- Quick Locate First Fix Route: \`${quickLocateFirstFixRoute}\``,
        `- Quick Locate Suggested Command: \`${quickLocateSuggestedCommand}\``,
        `- Quick Locate First Failed Output: \`${quickLocateFirstFailedOutput}\``,
        `- Failure Fingerprint Source: \`${failureFingerprintSource}\``,
        `- Failure Fingerprint Step: \`${fallback(failureFingerprintStepId)}\``,
        `- Failure Fingerprint Command: \`${toSingleLine(fallback(failureFingerprintCommand))}\``,
        `- Failure Fingerprint First Output: \`${toSingleLine(fallback(failureFingerprintFirstOutput))}\``,
        `- Failure Fingerprint Hash: \`${fallback(failureFingerprintHash)}\``,
        `- Failure Fingerprint Hash Algorithm: \`${fallback(failureFingerprintHashAlgorithm)}\``,
        `- Failure Fingerprint Signature: \`${failureFingerprintSignature || 'N/A'}\``,
        `- Duration: \`${durationMs}ms\``,
        `- Report File: \`${reportFile}\``,
    ];

    if (failedSteps.length > 0) {
        lines.push('');
        lines.push('### Failed Step Details');
        lines.push('');
        for (const step of failedSteps.slice(0, maxFailedDetails)) {
            const outputTail = toSingleLine(step?.outputTail).slice(0, maxOutputTailChars);
            lines.push(
                `- ${fallback(step?.id)} | exitCode=\`${fallback(step?.exitCode)}\` | outputTail=\`${outputTail}\``,
            );
        }
    }

    return lines.join('\n');
};

const renderWorkflowSummarySelfCheckValidationMarkdown = (summary, options = {}) => {
    const maxItems = Number.isFinite(options.maxItems) && options.maxItems > 0
        ? Math.floor(options.maxItems)
        : 3;
    const validationErrors = Array.isArray(summary?.validationErrors)
        ? summary.validationErrors
        : [];
    const warnings = Array.isArray(summary?.warnings) ? summary.warnings : [];
    const inputs = summary?.inputs || null;
    const report = summary?.report || null;

    const lines = [
        '## Workflow Summary Self-Check Report Validation',
        '',
        `- Status: \`${fallback(summary?.status, 'UNKNOWN')}\``,
        `- Schema Version: \`${fallback(summary?.schemaVersion)}\``,
        `- Generated At: \`${fallback(summary?.generatedAt)}\``,
        `- Validation Error Count: \`${safeCount(validationErrors)}\``,
        `- Warning Count: \`${safeCount(warnings)}\``,
        `- Expected Report Schema Version: \`${fallback(inputs?.expectedReportSchemaVersion)}\``,
        `- Report File: \`${fallback(inputs?.reportFile)}\``,
        `- Report Schema Version: \`${fallback(report?.schemaVersion)}\``,
        `- Report Status: \`${fallback(report?.status)}\``,
        `- Report Failed Step IDs: \`${Array.isArray(report?.failedStepIds) && report.failedStepIds.length > 0 ? report.failedStepIds.join(', ') : 'N/A'}\``,
        `- Report Quick Locate Command Source Priority: \`${Array.isArray(report?.quickLocateCommandSourcePriority) && report.quickLocateCommandSourcePriority.length > 0 ? report.quickLocateCommandSourcePriority.join(' > ') : 'N/A'}\``,
        `- Report Quick Locate Command Source: \`${fallback(report?.quickLocateCommandSource)}\``,
        `- Report Quick Locate First Fix Route: \`${fallback(report?.quickLocateFirstFixRoute)}\``,
        `- Report Quick Locate Suggested Command: \`${fallback(report?.quickLocateCommand)}\``,
        `- Report Quick Locate First Failed Output: \`${fallback(report?.quickLocateFirstFailedOutput)}\``,
        `- Report Failure Fingerprint: \`${typeof report?.hasFailureFingerprint === 'boolean' ? String(report.hasFailureFingerprint) : 'N/A'}\``,
        `- Report Failure Fingerprint Step: \`${fallback(report?.failureFingerprintStepId)}\``,
        `- Report Failure Fingerprint Hash: \`${fallback(report?.failureFingerprintHash)}\``,
        `- Report Failure Fingerprint Hash Algorithm: \`${fallback(report?.failureFingerprintHashAlgorithm)}\``,
    ];

    appendTopItems(lines, 'Top Validation Errors', validationErrors, maxItems);
    appendTopItems(lines, 'Top Warnings', warnings, maxItems);

    return lines.join('\n');
};

const renderWorkflowQualityGateReportValidationMarkdown = (summary, options = {}) => {
    const maxItems = Number.isFinite(options.maxItems) && options.maxItems > 0
        ? Math.floor(options.maxItems)
        : 3;
    const failureIndexSnapshotMaxChars = Number.isFinite(options.failureIndexSnapshotMaxChars)
        && options.failureIndexSnapshotMaxChars > 0
        ? Math.floor(options.failureIndexSnapshotMaxChars)
        : DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS;
    const validationErrors = Array.isArray(summary?.validationErrors)
        ? summary.validationErrors
        : [];
    const warnings = Array.isArray(summary?.warnings) ? summary.warnings : [];
    const inputs = summary?.inputs || null;
    const report = summary?.report || null;
    const failureIndex = summary?.failureIndex || null;
    const failureReasonCode = typeof failureIndex?.reasonCode === 'string'
        ? failureIndex.reasonCode
        : null;
    const firstValidationError = fallback(
        failureIndex?.message
            || summary?.firstValidationError
            || validationErrors[0],
    );
    const guidance = resolveQualityGateValidationGuidance({
        failureReasonCode,
        firstValidationError,
        inputs,
        reportSummary: report,
    });
    const resolvedFailureReasonCode = failureReasonCode || guidance.reasonCode;
    const failureReasonSource = typeof failureIndex?.reasonCodeSource === 'string'
        ? failureIndex.reasonCodeSource
        : guidance.reasonCodeSource;
    const guidanceVersion = typeof failureIndex?.guidanceVersion === 'string'
        ? failureIndex.guidanceVersion
        : guidance.guidanceVersion;
    const resolvedFailureReasonSource = resolvedFailureReasonCode ? failureReasonSource : null;
    const resolvedGuidanceVersion = resolvedFailureReasonCode ? guidanceVersion : null;
    const suggestedAction = typeof failureIndex?.suggestedAction === 'string' && failureIndex.suggestedAction.trim().length > 0
        ? failureIndex.suggestedAction
        : guidance.suggestedAction;
    const suggestedCommand = typeof failureIndex?.suggestedCommand === 'string' && failureIndex.suggestedCommand.trim().length > 0
        ? failureIndex.suggestedCommand
        : guidance.suggestedCommand;
    const failureIndexSnapshotPayload = buildQualityGateFailureIndexSnapshotPayload({
        reasonCode: resolvedFailureReasonCode,
        reasonCodeSource: resolvedFailureReasonSource,
        guidanceVersion: resolvedGuidanceVersion,
        message: firstValidationError,
        suggestedAction,
        suggestedCommand,
    });
    const failureIndexSnapshotInfo = serializeQualityGateFailureIndexSnapshot(
        failureIndexSnapshotPayload,
        { maxChars: failureIndexSnapshotMaxChars },
    );
    const diagnostics = summary?.failureIndexDiagnostics || null;
    const diagnosticsReasonCodeCounts = (
        diagnostics
        && typeof diagnostics === 'object'
        && !Array.isArray(diagnostics)
        && diagnostics.reasonCodeCounts
        && typeof diagnostics.reasonCodeCounts === 'object'
        && !Array.isArray(diagnostics.reasonCodeCounts)
    )
        ? diagnostics.reasonCodeCounts
        : buildQualityGateValidationReasonCodeCounts(validationErrors);
    const fallbackSourceCounts = resolvedFailureReasonSource
        ? { [resolvedFailureReasonSource]: 1 }
        : { NONE: 1 };
    const diagnosticsReasonCodeSourceCounts = (
        diagnostics
        && typeof diagnostics === 'object'
        && !Array.isArray(diagnostics)
        && diagnostics.reasonCodeSourceCounts
        && typeof diagnostics.reasonCodeSourceCounts === 'object'
        && !Array.isArray(diagnostics.reasonCodeSourceCounts)
    )
        ? diagnostics.reasonCodeSourceCounts
        : fallbackSourceCounts;
    const diagnosticsSnapshotTotalCount = typeof diagnostics?.snapshotTotalCount === 'number'
        ? diagnostics.snapshotTotalCount
        : (failureIndexSnapshotPayload ? 1 : 0);
    const diagnosticsSnapshotTruncatedCount = typeof diagnostics?.snapshotTruncatedCount === 'number'
        ? diagnostics.snapshotTruncatedCount
        : (failureIndexSnapshotInfo.truncated ? 1 : 0);
    const diagnosticsReasonCodeCountTotal = typeof diagnostics?.reasonCodeCountTotal === 'number'
        ? diagnostics.reasonCodeCountTotal
        : safeCount(validationErrors);
    const diagnosticsReasonCodeSourceCountTotal = typeof diagnostics?.reasonCodeSourceCountTotal === 'number'
        ? diagnostics.reasonCodeSourceCountTotal
        : sumCountMap(diagnosticsReasonCodeSourceCounts);
    const diagnosticsSnapshot = (
        diagnostics
        && typeof diagnostics === 'object'
        && !Array.isArray(diagnostics)
        && diagnostics.snapshot
        && typeof diagnostics.snapshot === 'object'
        && !Array.isArray(diagnostics.snapshot)
    )
        ? diagnostics.snapshot
        : null;
    const diagnosticsSnapshotMaxChars = typeof diagnosticsSnapshot?.maxChars === 'number'
        ? diagnosticsSnapshot.maxChars
        : failureIndexSnapshotInfo.maxChars;
    const diagnosticsSnapshotRawLength = typeof diagnosticsSnapshot?.rawLength === 'number'
        ? diagnosticsSnapshot.rawLength
        : failureIndexSnapshotInfo.rawLength;
    const diagnosticsSnapshotTruncated = typeof diagnosticsSnapshot?.truncated === 'boolean'
        ? diagnosticsSnapshot.truncated
        : failureIndexSnapshotInfo.truncated;
    const diagnosticsConsistencyFromSummary = (
        diagnostics
        && typeof diagnostics === 'object'
        && !Array.isArray(diagnostics)
        && diagnostics.consistency
        && typeof diagnostics.consistency === 'object'
        && !Array.isArray(diagnostics.consistency)
    )
        ? diagnostics.consistency
        : null;
    const diagnosticsConsistencyFallbackReasons = [];
    const diagnosticsReasonCodeMapTotal = sumCountMap(diagnosticsReasonCodeCounts);
    const diagnosticsReasonCodeSourceMapTotal = sumCountMap(diagnosticsReasonCodeSourceCounts);
    const expectedReasonCodeCountTotal = safeCount(validationErrors);
    const expectedReasonCodeSourceCountTotal = 1;
    const expectedSnapshotTotalCount = failureIndexSnapshotPayload ? 1 : 0;
    const expectedSnapshotTruncatedCount = diagnosticsSnapshotTruncated ? 1 : 0;
    if (diagnosticsReasonCodeCountTotal !== expectedReasonCodeCountTotal) {
        diagnosticsConsistencyFallbackReasons.push(
            `reasonCodeCountTotal mismatch: expected ${expectedReasonCodeCountTotal}, actual ${diagnosticsReasonCodeCountTotal}.`,
        );
    }
    if (diagnosticsReasonCodeCountTotal !== diagnosticsReasonCodeMapTotal) {
        diagnosticsConsistencyFallbackReasons.push(
            `reasonCodeCountTotal vs reasonCodeCounts mismatch: total=${diagnosticsReasonCodeCountTotal}, mapTotal=${diagnosticsReasonCodeMapTotal}.`,
        );
    }
    if (diagnosticsReasonCodeSourceCountTotal !== expectedReasonCodeSourceCountTotal) {
        diagnosticsConsistencyFallbackReasons.push(
            `reasonCodeSourceCountTotal mismatch: expected ${expectedReasonCodeSourceCountTotal}, actual ${diagnosticsReasonCodeSourceCountTotal}.`,
        );
    }
    if (diagnosticsReasonCodeSourceCountTotal !== diagnosticsReasonCodeSourceMapTotal) {
        diagnosticsConsistencyFallbackReasons.push(
            `reasonCodeSourceCountTotal vs reasonCodeSourceCounts mismatch: total=${diagnosticsReasonCodeSourceCountTotal}, mapTotal=${diagnosticsReasonCodeSourceMapTotal}.`,
        );
    }
    if (diagnosticsSnapshotTotalCount !== expectedSnapshotTotalCount) {
        diagnosticsConsistencyFallbackReasons.push(
            `snapshotTotalCount mismatch: expected ${expectedSnapshotTotalCount}, actual ${diagnosticsSnapshotTotalCount}.`,
        );
    }
    if (diagnosticsSnapshotTruncatedCount !== expectedSnapshotTruncatedCount) {
        diagnosticsConsistencyFallbackReasons.push(
            `snapshotTruncatedCount mismatch: expected ${expectedSnapshotTruncatedCount}, actual ${diagnosticsSnapshotTruncatedCount}.`,
        );
    }
    if (diagnosticsSnapshotTruncatedCount > diagnosticsSnapshotTotalCount) {
        diagnosticsConsistencyFallbackReasons.push(
            `snapshotTruncatedCount cannot be greater than snapshotTotalCount: truncated=${diagnosticsSnapshotTruncatedCount}, total=${diagnosticsSnapshotTotalCount}.`,
        );
    }
    if (typeof diagnosticsSnapshotRawLength !== 'number' || diagnosticsSnapshotRawLength < 0) {
        diagnosticsConsistencyFallbackReasons.push(
            `snapshot.rawLength invalid: ${String(diagnosticsSnapshotRawLength)}.`,
        );
    }
    if (diagnosticsSnapshotTotalCount === 0 && diagnosticsSnapshotRawLength !== 0) {
        diagnosticsConsistencyFallbackReasons.push(
            `snapshot.rawLength mismatch when snapshotTotalCount=0: expected 0, actual ${diagnosticsSnapshotRawLength}.`,
        );
    }
    if (diagnosticsSnapshotTotalCount === 0 && diagnosticsSnapshotTruncated) {
        diagnosticsConsistencyFallbackReasons.push(
            'snapshot.truncated cannot be true when snapshotTotalCount=0.',
        );
    }
    const diagnosticsConsistencyFallback = {
        status: diagnosticsConsistencyFallbackReasons.length === 0 ? 'PASS' : 'FAILED',
        mismatchCount: diagnosticsConsistencyFallbackReasons.length,
        mismatchReasons: diagnosticsConsistencyFallbackReasons,
    };
    const diagnosticsConsistency = diagnosticsConsistencyFromSummary || diagnosticsConsistencyFallback;
    const diagnosticsConsistencyStatus = (
        diagnosticsConsistency?.status === 'PASS'
        || diagnosticsConsistency?.status === 'FAILED'
    )
        ? diagnosticsConsistency.status
        : diagnosticsConsistencyFallback.status;
    const diagnosticsConsistencyMismatchCount = typeof diagnosticsConsistency?.mismatchCount === 'number'
        ? diagnosticsConsistency.mismatchCount
        : diagnosticsConsistencyFallback.mismatchCount;
    const diagnosticsConsistencyReasons = Array.isArray(diagnosticsConsistency?.mismatchReasons)
        ? diagnosticsConsistency.mismatchReasons
        : diagnosticsConsistencyFallback.mismatchReasons;
    const diagnosticsConsistencySource = diagnosticsConsistencyFromSummary ? 'SUMMARY' : 'COMPUTED';
    const diagnosticsConsistencyReasonsLine = diagnosticsConsistencyReasons.length > 0
        ? toSingleLine(diagnosticsConsistencyReasons.join(' | '))
        : 'N/A';

    const lines = [
        '## Workflow Quality Gate Report Validation',
        '',
        `- Status: \`${fallback(summary?.status, 'UNKNOWN')}\``,
        `- Schema Version: \`${fallback(summary?.schemaVersion)}\``,
        `- Generated At: \`${fallback(summary?.generatedAt)}\``,
        `- Validation Error Count: \`${typeof summary?.validationErrorCount === 'number' ? summary.validationErrorCount : safeCount(validationErrors)}\``,
        `- Warning Count: \`${typeof summary?.warningCount === 'number' ? summary.warningCount : safeCount(warnings)}\``,
        `- Expected Report Schema Version: \`${fallback(inputs?.expectedReportSchemaVersion)}\``,
        `- Require Summary JSON Assert: \`${typeof inputs?.requireSummaryJsonAssert === 'boolean' ? String(inputs.requireSummaryJsonAssert) : 'N/A'}\``,
        `- Require Artifact/Options Path Match: \`${typeof inputs?.requireArtifactOptionPathMatch === 'boolean' ? String(inputs.requireArtifactOptionPathMatch) : 'N/A'}\``,
        `- Allow Report File Path Mismatch: \`${typeof inputs?.allowReportFilePathMismatch === 'boolean' ? String(inputs.allowReportFilePathMismatch) : 'N/A'}\``,
        `- Report File: \`${fallback(inputs?.reportFile)}\``,
        `- Report Schema Version: \`${fallback(report?.schemaVersion)}\``,
        `- Report Status: \`${fallback(report?.status)}\``,
        `- Report Failed Step IDs: \`${Array.isArray(report?.failedStepIds) && report.failedStepIds.length > 0 ? report.failedStepIds.join(', ') : 'N/A'}\``,
        `- Report Summary JSON Assert: \`${typeof report?.hasSummaryJsonAssert === 'boolean' ? String(report.hasSummaryJsonAssert) : 'N/A'}\``,
        `- Report File Path Matches Artifact: \`${typeof report?.reportFilePathMatchesArtifact === 'boolean' ? String(report.reportFilePathMatchesArtifact) : 'N/A'}\``,
        `- Artifact/Options Path Check Count: \`${typeof report?.artifactOptionPathCheckedCount === 'number' ? report.artifactOptionPathCheckedCount : 'N/A'}\``,
        `- Artifact/Options Path Mismatch Count: \`${typeof report?.artifactOptionPathMismatchCount === 'number' ? report.artifactOptionPathMismatchCount : 'N/A'}\``,
        `- First Failure Reason Code: \`${fallback(resolvedFailureReasonCode)}\``,
        `- Failure Reason Source: \`${fallback(resolvedFailureReasonSource)}\``,
        `- Guidance Version: \`${fallback(resolvedGuidanceVersion)}\``,
        `- First Validation Error: \`${toSingleLine(firstValidationError)}\``,
        `- Suggested Action: \`${toSingleLine(suggestedAction)}\``,
        `- Suggested Command: \`${toSingleLine(suggestedCommand)}\``,
        `- Failure Index Snapshot: \`${toSingleLine(failureIndexSnapshotInfo.value)}\``,
        `- Failure Index Snapshot Raw Length: \`${failureIndexSnapshotInfo.rawLength}\``,
        `- Failure Index Snapshot Max Chars: \`${failureIndexSnapshotInfo.maxChars}\``,
        `- Failure Index Snapshot Truncated: \`${String(failureIndexSnapshotInfo.truncated)}\``,
        `- Diagnostics Reason Code Count Total: \`${diagnosticsReasonCodeCountTotal}\``,
        `- Diagnostics Reason Code Counts: \`${formatCountMap(diagnosticsReasonCodeCounts)}\``,
        `- Diagnostics Reason Source Count Total: \`${diagnosticsReasonCodeSourceCountTotal}\``,
        `- Diagnostics Reason Source Counts: \`${formatCountMap(diagnosticsReasonCodeSourceCounts)}\``,
        `- Diagnostics Snapshot Total Count: \`${diagnosticsSnapshotTotalCount}\``,
        `- Diagnostics Snapshot Truncated Count: \`${diagnosticsSnapshotTruncatedCount}\``,
        `- Diagnostics Consistency Source: \`${diagnosticsConsistencySource}\``,
        `- Diagnostics Consistency Status: \`${diagnosticsConsistencyStatus}\``,
        `- Diagnostics Consistency Mismatch Count: \`${diagnosticsConsistencyMismatchCount}\``,
        `- Diagnostics Consistency Reasons: \`${diagnosticsConsistencyReasonsLine}\``,
        `- Diagnostics Snapshot Contract Max Chars: \`${diagnosticsSnapshotMaxChars}\``,
        `- Diagnostics Snapshot Contract Raw Length: \`${diagnosticsSnapshotRawLength}\``,
        `- Diagnostics Snapshot Contract Truncated: \`${String(diagnosticsSnapshotTruncated)}\``,
    ];

    appendTopItems(lines, 'Top Validation Errors', validationErrors, maxItems);
    appendTopItems(lines, 'Top Warnings', warnings, maxItems);

    return lines.join('\n');
};

export {
    QUALITY_GATE_FIRST_FIX_ROUTE,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE,
    QUALITY_GATE_SUGGESTED_COMMAND_SOURCE_PRIORITY,
    SELF_CHECK_FIRST_FIX_ROUTE,
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE,
    SELF_CHECK_SUGGESTED_COMMAND_SOURCE_PRIORITY,
    extractSummaryJsonAssert,
    renderQualityGateSummaryMarkdown,
    renderWorkflowQuickLocateIndexMarkdown,
    renderWorkflowQualityGateReportValidationMarkdown,
    renderWorkflowReportValidationSummaryMarkdown,
    renderWorkflowSummarySelfCheckMarkdown,
    renderWorkflowSummarySelfCheckValidationMarkdown,
};
