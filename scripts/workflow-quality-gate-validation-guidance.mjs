const DEFAULT_QUALITY_GATE_REPORT_FILE = 'logs/workflow-quality-gate-report.json';
const DEFAULT_QUALITY_GATE_REPORT_VALIDATION_SUMMARY_JSON_FILE = 'logs/workflow-quality-gate-report-validation.json';
const DEFAULT_QUALITY_GATE_REPORT_SCHEMA_VERSION = '1.0';
const DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS = 320;
const QUALITY_GATE_VALIDATION_GUIDANCE_VERSION = '1.0';
const QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE = {
    NONE: 'NONE',
    EXPLICIT: 'EXPLICIT_FAILURE_REASON_CODE',
    CLASSIFIED: 'CLASSIFIED_FROM_VALIDATION_ERROR',
};

const normalizeNonEmptyString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const toSingleLine = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeOptionalSingleLine = (value) => {
    const normalized = toSingleLine(value);
    if (!normalized || normalized.toUpperCase() === 'N/A') {
        return null;
    }
    return normalized;
};

const toInlineCodeSafe = (value) => String(value ?? '').replace(/`/g, '\'');

const normalizeSnapshotMaxChars = (maxChars) => Number.isFinite(maxChars) && maxChars > 0
    ? Math.floor(maxChars)
    : DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS;

const resolveInputValue = (inputs, field, fallback) => {
    const value = normalizeNonEmptyString(inputs?.[field]);
    return value || fallback;
};

const resolveReportSummaryValue = (reportSummary, flattenedField, nestedField) => {
    const flattened = normalizeNonEmptyString(reportSummary?.[flattenedField]);
    if (flattened) {
        return flattened;
    }
    return normalizeNonEmptyString(reportSummary?.artifacts?.[nestedField]);
};

const classifyQualityGateValidationReasonCode = (message) => {
    const normalized = String(message || '').toLowerCase();
    if (normalized.includes('schema version mismatch')) {
        return 'REPORT_SCHEMA_MISMATCH';
    }
    if (normalized.includes('summary.summaryjsonassert is required')) {
        return 'SUMMARY_JSON_ASSERT_REQUIRED';
    }
    if (normalized.includes('summaryjsonassert status mismatch')) {
        return 'SUMMARY_JSON_ASSERT_STATUS_MISMATCH';
    }
    if (normalized.includes('summaryjsonassert reasoncode mismatch')) {
        return 'SUMMARY_JSON_ASSERT_REASONCODE_MISMATCH';
    }
    if (normalized.includes('report path mismatch')) {
        return 'REPORT_PATH_MISMATCH';
    }
    if (normalized.includes('options/artifacts path mismatch')) {
        return 'ARTIFACT_OPTIONS_PATH_MISMATCH';
    }
    if (normalized.includes('failedstepids')) {
        return 'FAILED_STEP_IDS_MISMATCH';
    }
    if (normalized.includes('summary.totalsteps mismatch')
        || normalized.includes('summary.successfulsteps mismatch')
        || normalized.includes('summary.failedsteps mismatch')) {
        return 'SUMMARY_COUNTER_MISMATCH';
    }
    if (normalized.includes('status success cannot contain failed steps')) {
        return 'STATUS_STEP_CONFLICT';
    }
    if (normalized.includes('failed to read quality gate report')) {
        return 'REPORT_READ_ERROR';
    }
    return 'VALIDATION_ERROR';
};

const buildQualityGateReportValidateCommand = (inputs = {}, override = {}) => {
    const reportFile = resolveInputValue(
        override,
        'reportFile',
        resolveInputValue(inputs, 'reportFile', DEFAULT_QUALITY_GATE_REPORT_FILE),
    );
    const summaryJsonFile = resolveInputValue(
        override,
        'summaryJsonFile',
        resolveInputValue(
            inputs,
            'summaryJsonFile',
            DEFAULT_QUALITY_GATE_REPORT_VALIDATION_SUMMARY_JSON_FILE,
        ),
    );
    const expectedReportSchemaVersion = resolveInputValue(
        override,
        'expectedReportSchemaVersion',
        resolveInputValue(
            inputs,
            'expectedReportSchemaVersion',
            DEFAULT_QUALITY_GATE_REPORT_SCHEMA_VERSION,
        ),
    );
    return `pnpm workflow:quality:report:validate -- --report-file=${reportFile} --summary-json-file=${summaryJsonFile} --expected-report-schema-version=${expectedReportSchemaVersion} --require-summary-json-assert`;
};

const buildQualityGateRegenerateCommand = (reportSummary) => {
    if (!reportSummary) {
        return 'pnpm workflow:quality:gate -- --require-summary-json-success --validate-summary-json-schema-version=1.0';
    }

    const reportFile = resolveReportSummaryValue(
        reportSummary,
        'artifactQualityGateReportFile',
        'qualityGateReportFile',
    );
    const summaryMarkdownFile = resolveReportSummaryValue(
        reportSummary,
        'artifactSummaryMarkdownFile',
        'summaryMarkdownFile',
    );
    const summaryJsonFile = resolveReportSummaryValue(
        reportSummary,
        'artifactSummaryJsonFile',
        'summaryJsonFile',
    );
    const smokeReportFile = resolveReportSummaryValue(
        reportSummary,
        'artifactSmokeReportFile',
        'smokeReportFile',
    );
    const perfReportFile = resolveReportSummaryValue(
        reportSummary,
        'artifactPerfReportFile',
        'perfReportFile',
    );

    const args = ['pnpm workflow:quality:gate --'];
    if (summaryMarkdownFile) {
        args.push(`--summary-markdown-file=${summaryMarkdownFile}`);
    }
    if (summaryJsonFile) {
        args.push(`--summary-json-file=${summaryJsonFile}`);
    }
    if (reportFile) {
        args.push(`--report-file=${reportFile}`);
    }
    if (smokeReportFile) {
        args.push(`--smoke-report-file=${smokeReportFile}`);
    }
    if (perfReportFile) {
        args.push(`--perf-report-file=${perfReportFile}`);
    }
    args.push('--require-summary-json-success');
    args.push('--validate-summary-json-schema-version=1.0');
    return args.join(' ');
};

const buildQualityGateValidationSuggestedAction = (reasonCode, context = {}) => {
    const inputs = context?.inputs || null;
    const reportFile = resolveInputValue(inputs, 'reportFile', DEFAULT_QUALITY_GATE_REPORT_FILE);
    const expectedReportSchemaVersion = resolveInputValue(
        inputs,
        'expectedReportSchemaVersion',
        DEFAULT_QUALITY_GATE_REPORT_SCHEMA_VERSION,
    );

    switch (reasonCode) {
    case 'REPORT_SCHEMA_MISMATCH':
        return `align --expected-report-schema-version=${expectedReportSchemaVersion} with quality report schema and rerun validation`;
    case 'SUMMARY_JSON_ASSERT_REQUIRED':
    case 'SUMMARY_JSON_ASSERT_STATUS_MISMATCH':
    case 'SUMMARY_JSON_ASSERT_REASONCODE_MISMATCH':
        return 'rerun pnpm workflow:quality:gate -- --require-summary-json-success, then rerun report validation';
    case 'REPORT_PATH_MISMATCH':
        return 'rerun workflow:quality:gate and validate using the same --report-file as artifacts.qualityGateReportFile';
    case 'ARTIFACT_OPTIONS_PATH_MISMATCH':
        return 'ensure quality gate report options.* and artifacts.* paths are aligned, then rerun workflow:quality:gate';
    case 'FAILED_STEP_IDS_MISMATCH':
    case 'SUMMARY_COUNTER_MISMATCH':
    case 'STATUS_STEP_CONFLICT':
        return 'fix workflow-quality-gate-runner report summary contract and rerun workflow:quality:gate';
    case 'REPORT_READ_ERROR':
        return `verify report file exists/readable: ${reportFile}`;
    default:
        return `pnpm workflow:quality:report:validate -- --report-file=${reportFile} --expected-report-schema-version=${expectedReportSchemaVersion} --require-summary-json-assert`;
    }
};

const buildQualityGateValidationSuggestedCommand = (reasonCode, context = {}) => {
    const inputs = context?.inputs || null;
    const reportSummary = context?.reportSummary || null;

    switch (reasonCode) {
    case 'REPORT_PATH_MISMATCH': {
        const artifactReportFile = resolveReportSummaryValue(
            reportSummary,
            'artifactQualityGateReportFile',
            'qualityGateReportFile',
        );
        return buildQualityGateReportValidateCommand(inputs, {
            reportFile: artifactReportFile || inputs?.reportFile,
        });
    }
    case 'ARTIFACT_OPTIONS_PATH_MISMATCH':
    case 'SUMMARY_JSON_ASSERT_REQUIRED':
    case 'SUMMARY_JSON_ASSERT_STATUS_MISMATCH':
    case 'SUMMARY_JSON_ASSERT_REASONCODE_MISMATCH':
    case 'SUMMARY_COUNTER_MISMATCH':
    case 'FAILED_STEP_IDS_MISMATCH':
    case 'STATUS_STEP_CONFLICT':
        return buildQualityGateRegenerateCommand(reportSummary);
    case 'REPORT_READ_ERROR':
        return `ls -l ${resolveInputValue(inputs, 'reportFile', DEFAULT_QUALITY_GATE_REPORT_FILE)}`;
    case 'REPORT_SCHEMA_MISMATCH':
    case 'VALIDATION_ERROR':
    default:
        return buildQualityGateReportValidateCommand(inputs);
    }
};

const resolveQualityGateValidationGuidance = ({
    failureReasonCode,
    firstValidationError,
    inputs,
    reportSummary,
} = {}) => {
    const normalizedFailureReasonCodeCandidate = normalizeNonEmptyString(failureReasonCode);
    const normalizedFailureReasonCode = normalizedFailureReasonCodeCandidate
        && normalizedFailureReasonCodeCandidate.toUpperCase() !== 'N/A'
        ? normalizedFailureReasonCodeCandidate
        : null;
    const normalizedValidationErrorCandidate = normalizeNonEmptyString(firstValidationError);
    const normalizedValidationError = normalizedValidationErrorCandidate
        && normalizedValidationErrorCandidate.toUpperCase() !== 'N/A'
        ? normalizedValidationErrorCandidate
        : null;
    if (!normalizedFailureReasonCode && !normalizedValidationError) {
        return {
            reasonCode: null,
            reasonCodeSource: QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.NONE,
            guidanceVersion: QUALITY_GATE_VALIDATION_GUIDANCE_VERSION,
            suggestedAction: 'N/A',
            suggestedCommand: 'N/A',
        };
    }

    const reasonCodeSource = normalizedFailureReasonCode
        ? QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.EXPLICIT
        : QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE.CLASSIFIED;
    const reasonCode = normalizedFailureReasonCode
        ? normalizedFailureReasonCode.toUpperCase()
        : classifyQualityGateValidationReasonCode(normalizedValidationError);
    return {
        reasonCode,
        reasonCodeSource,
        guidanceVersion: QUALITY_GATE_VALIDATION_GUIDANCE_VERSION,
        suggestedAction: buildQualityGateValidationSuggestedAction(reasonCode, { inputs }),
        suggestedCommand: buildQualityGateValidationSuggestedCommand(reasonCode, {
            inputs,
            reportSummary,
        }),
    };
};

const buildQualityGateFailureIndexSnapshotPayload = ({
    reasonCode,
    reasonCodeSource,
    guidanceVersion,
    message,
    suggestedAction,
    suggestedCommand,
} = {}) => {
    const normalizedReasonCode = normalizeNonEmptyString(reasonCode);
    const normalizedReasonCodeSource = normalizeNonEmptyString(reasonCodeSource);
    const normalizedGuidanceVersion = normalizeNonEmptyString(guidanceVersion);
    const normalizedMessage = normalizeOptionalSingleLine(message);
    const normalizedSuggestedAction = normalizeOptionalSingleLine(suggestedAction);
    const normalizedSuggestedCommand = normalizeOptionalSingleLine(suggestedCommand);
    if (
        !normalizedReasonCode
        && !normalizedMessage
        && !normalizedSuggestedAction
        && !normalizedSuggestedCommand
    ) {
        return null;
    }
    return {
        reasonCode: normalizedReasonCode,
        reasonCodeSource: normalizedReasonCodeSource,
        guidanceVersion: normalizedGuidanceVersion,
        message: normalizedMessage,
        suggestedAction: normalizedSuggestedAction,
        suggestedCommand: normalizedSuggestedCommand,
    };
};

const serializeQualityGateFailureIndexSnapshot = (payload, options = {}) => {
    const maxChars = normalizeSnapshotMaxChars(options?.maxChars);
    if (!payload) {
        return {
            value: 'N/A',
            rawLength: 0,
            truncated: false,
            maxChars,
        };
    }
    const compact = toInlineCodeSafe(JSON.stringify(payload));
    const rawLength = compact.length;
    if (rawLength <= maxChars) {
        return {
            value: compact,
            rawLength,
            truncated: false,
            maxChars,
        };
    }
    return {
        value: `${compact.slice(0, Math.max(0, maxChars - 3))}...`,
        rawLength,
        truncated: true,
        maxChars,
    };
};

const buildQualityGateValidationReasonCodeCounts = (validationErrors) => {
    const counts = {};
    if (!Array.isArray(validationErrors) || validationErrors.length === 0) {
        return counts;
    }
    for (const validationError of validationErrors) {
        const reasonCode = classifyQualityGateValidationReasonCode(validationError);
        counts[reasonCode] = (counts[reasonCode] || 0) + 1;
    }
    return counts;
};

const formatCountMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'N/A';
    }
    const entries = Object.entries(value)
        .filter(([, count]) => Number.isFinite(count) && count > 0)
        .sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
        return 'N/A';
    }
    return entries.map(([key, count]) => `${key}=${count}`).join(', ');
};

export {
    DEFAULT_FAILURE_INDEX_SNAPSHOT_MAX_CHARS,
    DEFAULT_QUALITY_GATE_REPORT_FILE,
    DEFAULT_QUALITY_GATE_REPORT_SCHEMA_VERSION,
    DEFAULT_QUALITY_GATE_REPORT_VALIDATION_SUMMARY_JSON_FILE,
    QUALITY_GATE_VALIDATION_GUIDANCE_VERSION,
    QUALITY_GATE_VALIDATION_REASON_CODE_SOURCE,
    buildQualityGateFailureIndexSnapshotPayload,
    buildQualityGateValidationReasonCodeCounts,
    buildQualityGateRegenerateCommand,
    buildQualityGateReportValidateCommand,
    buildQualityGateValidationSuggestedAction,
    buildQualityGateValidationSuggestedCommand,
    classifyQualityGateValidationReasonCode,
    formatCountMap,
    resolveQualityGateValidationGuidance,
    serializeQualityGateFailureIndexSnapshot,
};
