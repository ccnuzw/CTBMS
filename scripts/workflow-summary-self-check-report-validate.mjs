#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const VALIDATION_SCHEMA_VERSION = '1.0';
const DEFAULT_REPORT_FILE = 'logs/workflow-summary-self-check-report.json';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-summary-self-check-validation.json';
const DEFAULT_EXPECTED_REPORT_SCHEMA_VERSION = '1.0';
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
const buildStepCommand = (step) => `${step.command} ${Array.isArray(step.args) ? step.args.join(' ') : ''}`.trim();
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
const isSha256Hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const QUICK_LOCATE_COMMAND_SOURCE = Object.freeze({
    STEP_OVERRIDE: 'STEP_OVERRIDE',
    FAILED_STEP: 'FAILED_STEP',
    NOT_AVAILABLE: 'N/A',
});
const QUICK_LOCATE_COMMAND_SOURCE_PRIORITY = Object.freeze([
    QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE,
    QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP,
    QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
]);
const QUICK_LOCATE_FIRST_FIX_ROUTE = Object.freeze({
    STEP_OVERRIDE_COMMAND: 'RERUN_QUICK_LOCATE_COMMAND',
    FAILED_STEP_COMMAND: 'RERUN_FAILED_STEP_COMMAND',
    MANUAL_INSPECTION: 'INSPECT_SELF_CHECK_REPORT_STEPS',
});
const QUICK_LOCATE_STEP_OVERRIDE_COMMANDS = Object.freeze({
    'report-validate-self-check': 'pnpm workflow:reports:validate:self-check',
    'summary-renderers-self-check': 'pnpm workflow:summary:renderers:self-check',
    'quality-gate-validation-guidance-self-check': 'pnpm workflow:quality:validation:guidance:self-check',
    'report-summary-self-check': 'pnpm workflow:reports:summary:self-check',
    'ci-step-summary-self-check': 'pnpm workflow:ci:step-summary:self-check',
    'quality-gate-self-check': 'pnpm workflow:quality:gate:self-check',
    'quality-gate-report-validate-self-check': 'pnpm workflow:quality:report:validate:self-check',
});
const QUICK_LOCATE_SOURCES = new Set(Object.values(QUICK_LOCATE_COMMAND_SOURCE));
const QUICK_LOCATE_ROUTES = new Set(Object.values(QUICK_LOCATE_FIRST_FIX_ROUTE));
const resolveQuickLocateFromStep = (step, source, route, command, firstFailedOutput) => {
    if (!step || typeof step !== 'object') {
        return {
            source: QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
            firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION,
            command: null,
            firstFailedOutput: null,
        };
    }

    const expectedOverrideCommand = QUICK_LOCATE_STEP_OVERRIDE_COMMANDS[step.id] || null;
    const stepCommand = buildStepCommand(step) || null;
    const stepFirstOutput = extractFirstOutputLine(step.outputTail);

    if (source && route) {
        return {
            source,
            firstFixRoute: route,
            command,
            firstFailedOutput,
            expectedOverrideCommand,
            expectedStepCommand: stepCommand,
            expectedFirstFailedOutput: stepFirstOutput,
        };
    }

    if (expectedOverrideCommand) {
        return {
            source: QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE,
            firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.STEP_OVERRIDE_COMMAND,
            command: expectedOverrideCommand,
            firstFailedOutput: stepFirstOutput,
            expectedOverrideCommand,
            expectedStepCommand: stepCommand,
            expectedFirstFailedOutput: stepFirstOutput,
        };
    }

    if (stepCommand) {
        return {
            source: QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP,
            firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.FAILED_STEP_COMMAND,
            command: stepCommand,
            firstFailedOutput: stepFirstOutput,
            expectedOverrideCommand,
            expectedStepCommand: stepCommand,
            expectedFirstFailedOutput: stepFirstOutput,
        };
    }

    return {
        source: QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
        firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION,
        command: null,
        firstFailedOutput: stepFirstOutput,
        expectedOverrideCommand,
        expectedStepCommand: stepCommand,
        expectedFirstFailedOutput: stepFirstOutput,
    };
};

const validateReport = (report, expectedReportSchemaVersion, validationErrors, warnings) => {
    if (!isRecord(report)) {
        validationErrors.push('Self-check report must be an object.');
        return {
            schemaVersion: null,
            status: null,
            runId: null,
            totalSteps: null,
            executedSteps: 0,
            successfulSteps: null,
            failedSteps: null,
            failedStepIds: [],
            quickLocateCommandSourcePriority: QUICK_LOCATE_COMMAND_SOURCE_PRIORITY.slice(),
            quickLocateCommandSource: QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
            quickLocateFirstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION,
            quickLocateCommand: null,
            quickLocateFirstFailedOutput: null,
        };
    }

    if (typeof report.schemaVersion !== 'string' || report.schemaVersion.trim().length === 0) {
        validationErrors.push('Self-check report schemaVersion is required.');
    } else if (expectedReportSchemaVersion && report.schemaVersion !== expectedReportSchemaVersion) {
        validationErrors.push(
            `Self-check report schema version mismatch: expected ${expectedReportSchemaVersion}, actual ${report.schemaVersion}.`,
        );
    }

    if (typeof report.runId !== 'string' || report.runId.trim().length === 0) {
        validationErrors.push('Self-check report runId is required.');
    }
    if (typeof report.startedAt !== 'string' || report.startedAt.trim().length === 0) {
        validationErrors.push('Self-check report startedAt is required.');
    }
    if (typeof report.finishedAt !== 'string' || report.finishedAt.trim().length === 0) {
        validationErrors.push('Self-check report finishedAt is required.');
    }
    if (typeof report.durationMs !== 'number' || report.durationMs < 0) {
        validationErrors.push('Self-check report durationMs must be a non-negative number.');
    }
    if (!['SUCCESS', 'FAILED'].includes(report.status)) {
        validationErrors.push(`Self-check report status is invalid: ${String(report.status)}.`);
    }

    const summary = report.summary;
    const steps = Array.isArray(report.steps) ? report.steps : null;
    if (!isRecord(summary)) {
        validationErrors.push('Self-check report summary is required.');
    }
    if (!steps) {
        validationErrors.push('Self-check report steps must be an array.');
    } else if (steps.length === 0) {
        validationErrors.push('Self-check report steps must not be empty.');
    }

    const failedStepIds = Array.isArray(summary?.failedStepIds) ? summary.failedStepIds : [];
    if (!Array.isArray(summary?.failedStepIds)) {
        validationErrors.push('Self-check report summary.failedStepIds must be an array.');
    }
    for (const failedStepId of failedStepIds) {
        if (typeof failedStepId !== 'string' || failedStepId.trim().length === 0) {
            validationErrors.push('Self-check report summary.failedStepIds must contain non-empty strings.');
            break;
        }
    }

    const summaryTotalSteps = summary?.totalSteps;
    const summarySuccessfulSteps = summary?.successfulSteps;
    const summaryFailedSteps = summary?.failedSteps;
    if (typeof summaryTotalSteps !== 'number' || summaryTotalSteps <= 0) {
        validationErrors.push('Self-check report summary.totalSteps must be a positive number.');
    }
    if (typeof summarySuccessfulSteps !== 'number' || summarySuccessfulSteps < 0) {
        validationErrors.push('Self-check report summary.successfulSteps must be a non-negative number.');
    }
    if (typeof summaryFailedSteps !== 'number' || summaryFailedSteps < 0) {
        validationErrors.push('Self-check report summary.failedSteps must be a non-negative number.');
    }

    let computedSuccessfulSteps = 0;
    let computedFailedSteps = 0;
    const stepIdSet = new Set();
    const stepById = new Map();

    if (steps) {
        for (const step of steps) {
            if (!isRecord(step)) {
                validationErrors.push('Self-check report step must be an object.');
                continue;
            }
            if (typeof step.id !== 'string' || step.id.trim().length === 0) {
                validationErrors.push('Self-check report step id is required.');
            } else {
                if (stepIdSet.has(step.id)) {
                    validationErrors.push(`Self-check report step id must be unique: ${step.id}.`);
                }
                stepIdSet.add(step.id);
                stepById.set(step.id, step);
            }
            if (typeof step.name !== 'string' || step.name.trim().length === 0) {
                validationErrors.push('Self-check report step name is required.');
            }
            if (typeof step.command !== 'string' || step.command.trim().length === 0) {
                validationErrors.push('Self-check report step command is required.');
            }
            if (!Array.isArray(step.args)) {
                validationErrors.push(`Self-check report step args must be an array: ${String(step.id)}.`);
            }
            if (!['SUCCESS', 'FAILED', 'PENDING'].includes(step.status)) {
                validationErrors.push(`Self-check report step status is invalid: ${String(step.id)}.`);
            }
            if (typeof step.durationMs !== 'number' || step.durationMs < 0) {
                validationErrors.push(`Self-check report step durationMs invalid: ${String(step.id)}.`);
            }

            if (step.status === 'SUCCESS') {
                computedSuccessfulSteps += 1;
            }
            if (step.status === 'FAILED') {
                computedFailedSteps += 1;
            }
        }
    }

    if (typeof summarySuccessfulSteps === 'number' && summarySuccessfulSteps !== computedSuccessfulSteps) {
        validationErrors.push(
            `Self-check summary successfulSteps mismatch: expected ${computedSuccessfulSteps}, actual ${summarySuccessfulSteps}.`,
        );
    }
    if (typeof summaryFailedSteps === 'number' && summaryFailedSteps !== computedFailedSteps) {
        validationErrors.push(
            `Self-check summary failedSteps mismatch: expected ${computedFailedSteps}, actual ${summaryFailedSteps}.`,
        );
    }
    if (typeof summaryTotalSteps === 'number' && steps && summaryTotalSteps < steps.length) {
        validationErrors.push(
            `Self-check summary totalSteps must be >= executed steps (${steps.length}), got ${summaryTotalSteps}.`,
        );
    }

    for (const failedStepId of failedStepIds) {
        if (!stepIdSet.has(failedStepId)) {
            validationErrors.push(
                `Self-check summary failed step id not found in steps: ${failedStepId}.`,
            );
        }
    }

    const firstFailedStepId = failedStepIds[0]
        || (steps ? steps.find((step) => step?.status === 'FAILED')?.id : null)
        || null;
    const firstFailedStep = firstFailedStepId && stepById.has(firstFailedStepId)
        ? stepById.get(firstFailedStepId)
        : null;
    const rawQuickLocatePriority = summary?.quickLocateCommandSourcePriority;
    const rawQuickLocateSource = summary?.quickLocateCommandSource;
    const rawQuickLocateFirstFixRoute = summary?.quickLocateFirstFixRoute;
    const rawQuickLocateCommand = summary?.quickLocateCommand;
    const rawQuickLocateFirstFailedOutput = summary?.quickLocateFirstFailedOutput;
    const hasQuickLocatePriority = rawQuickLocatePriority !== undefined;
    const hasQuickLocateSource = rawQuickLocateSource !== undefined;
    const hasQuickLocateFirstFixRoute = rawQuickLocateFirstFixRoute !== undefined;
    const hasQuickLocateCommand = rawQuickLocateCommand !== undefined;
    const hasQuickLocateFirstFailedOutput = rawQuickLocateFirstFailedOutput !== undefined;

    if (hasQuickLocatePriority) {
        if (!Array.isArray(rawQuickLocatePriority)) {
            validationErrors.push('Self-check report summary.quickLocateCommandSourcePriority must be an array when provided.');
        } else if (
            rawQuickLocatePriority.length !== QUICK_LOCATE_COMMAND_SOURCE_PRIORITY.length
            || rawQuickLocatePriority.some(
                (item, index) => item !== QUICK_LOCATE_COMMAND_SOURCE_PRIORITY[index],
            )
        ) {
            validationErrors.push(
                `Self-check report summary.quickLocateCommandSourcePriority must equal "${QUICK_LOCATE_COMMAND_SOURCE_PRIORITY.join(' > ')}".`,
            );
        }
    }
    if (hasQuickLocateSource) {
        if (typeof rawQuickLocateSource !== 'string' || !QUICK_LOCATE_SOURCES.has(rawQuickLocateSource)) {
            validationErrors.push(
                `Self-check report summary.quickLocateCommandSource is invalid: ${String(rawQuickLocateSource)}.`,
            );
        }
    }
    if (hasQuickLocateFirstFixRoute) {
        if (
            typeof rawQuickLocateFirstFixRoute !== 'string'
            || !QUICK_LOCATE_ROUTES.has(rawQuickLocateFirstFixRoute)
        ) {
            validationErrors.push(
                `Self-check report summary.quickLocateFirstFixRoute is invalid: ${String(rawQuickLocateFirstFixRoute)}.`,
            );
        }
    }
    if (hasQuickLocateCommand) {
        if (
            rawQuickLocateCommand !== null
            && (typeof rawQuickLocateCommand !== 'string' || rawQuickLocateCommand.trim().length === 0)
        ) {
            validationErrors.push('Self-check report summary.quickLocateCommand must be a non-empty string or null when provided.');
        }
    }
    if (hasQuickLocateFirstFailedOutput) {
        if (
            rawQuickLocateFirstFailedOutput !== null
            && (
                typeof rawQuickLocateFirstFailedOutput !== 'string'
                || rawQuickLocateFirstFailedOutput.trim().length === 0
            )
        ) {
            validationErrors.push('Self-check report summary.quickLocateFirstFailedOutput must be a non-empty string or null when provided.');
        }
    }

    const quickLocatePriority = Array.isArray(rawQuickLocatePriority)
        ? rawQuickLocatePriority
        : QUICK_LOCATE_COMMAND_SOURCE_PRIORITY.slice();
    const quickLocateFallback = resolveQuickLocateFromStep(firstFailedStep);
    const quickLocateSource = typeof rawQuickLocateSource === 'string'
        && QUICK_LOCATE_SOURCES.has(rawQuickLocateSource)
        ? rawQuickLocateSource
        : quickLocateFallback.source;
    const quickLocateFirstFixRoute = typeof rawQuickLocateFirstFixRoute === 'string'
        && QUICK_LOCATE_ROUTES.has(rawQuickLocateFirstFixRoute)
        ? rawQuickLocateFirstFixRoute
        : quickLocateFallback.firstFixRoute;
    const quickLocateCommand = rawQuickLocateCommand === null
        ? null
        : (
            typeof rawQuickLocateCommand === 'string' && rawQuickLocateCommand.trim().length > 0
                ? rawQuickLocateCommand
                : quickLocateFallback.command
        );
    const quickLocateFirstFailedOutput = rawQuickLocateFirstFailedOutput === null
        ? null
        : (
            typeof rawQuickLocateFirstFailedOutput === 'string' && rawQuickLocateFirstFailedOutput.trim().length > 0
                ? rawQuickLocateFirstFailedOutput
                : quickLocateFallback.firstFailedOutput
        );
    const quickLocateExpected = resolveQuickLocateFromStep(
        firstFailedStep,
        quickLocateSource,
        quickLocateFirstFixRoute,
        quickLocateCommand,
        quickLocateFirstFailedOutput,
    );

    if (quickLocateSource === QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE) {
        if (quickLocateFirstFixRoute !== QUICK_LOCATE_FIRST_FIX_ROUTE.STEP_OVERRIDE_COMMAND) {
            validationErrors.push('Self-check report summary.quickLocateFirstFixRoute must be RERUN_QUICK_LOCATE_COMMAND when source=STEP_OVERRIDE.');
        }
        if (!quickLocateCommand) {
            validationErrors.push('Self-check report summary.quickLocateCommand is required when source=STEP_OVERRIDE.');
        }
        if (quickLocateExpected.expectedOverrideCommand && quickLocateCommand !== quickLocateExpected.expectedOverrideCommand) {
            validationErrors.push(
                `Self-check report summary.quickLocateCommand mismatch for source=STEP_OVERRIDE: expected "${quickLocateExpected.expectedOverrideCommand}", actual "${quickLocateCommand}".`,
            );
        }
    }
    if (quickLocateSource === QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP) {
        if (quickLocateFirstFixRoute !== QUICK_LOCATE_FIRST_FIX_ROUTE.FAILED_STEP_COMMAND) {
            validationErrors.push('Self-check report summary.quickLocateFirstFixRoute must be RERUN_FAILED_STEP_COMMAND when source=FAILED_STEP.');
        }
        if (!quickLocateCommand) {
            validationErrors.push('Self-check report summary.quickLocateCommand is required when source=FAILED_STEP.');
        }
        if (quickLocateExpected.expectedStepCommand && quickLocateCommand !== quickLocateExpected.expectedStepCommand) {
            validationErrors.push(
                `Self-check report summary.quickLocateCommand mismatch for source=FAILED_STEP: expected "${quickLocateExpected.expectedStepCommand}", actual "${quickLocateCommand}".`,
            );
        }
    }
    if (quickLocateSource === QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE) {
        if (quickLocateFirstFixRoute !== QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION) {
            validationErrors.push('Self-check report summary.quickLocateFirstFixRoute must be INSPECT_SELF_CHECK_REPORT_STEPS when source=N/A.');
        }
        if (quickLocateCommand !== null) {
            validationErrors.push('Self-check report summary.quickLocateCommand must be null when source=N/A.');
        }
    }
    if (firstFailedStep && quickLocateExpected.expectedFirstFailedOutput !== (quickLocateFirstFailedOutput || null)) {
        validationErrors.push(
            'Self-check report summary.quickLocateFirstFailedOutput mismatch with failed step outputTail first line.',
        );
    }
    if (!firstFailedStep && quickLocateFirstFailedOutput !== null) {
        warnings.push('Self-check report summary.quickLocateFirstFailedOutput exists but no failed step is available.');
    }

    const rawFailureFingerprint = summary?.failureFingerprint;
    let failureFingerprint = null;
    if (rawFailureFingerprint !== null && rawFailureFingerprint !== undefined) {
        if (!isRecord(rawFailureFingerprint)) {
            validationErrors.push('Self-check report summary.failureFingerprint must be an object or null.');
        } else {
            const stepId = typeof rawFailureFingerprint.stepId === 'string'
                && rawFailureFingerprint.stepId.trim().length > 0
                ? rawFailureFingerprint.stepId
                : null;
            const command = typeof rawFailureFingerprint.command === 'string'
                && rawFailureFingerprint.command.trim().length > 0
                ? rawFailureFingerprint.command
                : null;
            const exitCode = rawFailureFingerprint.exitCode === null
                ? null
                : (Number.isFinite(rawFailureFingerprint.exitCode)
                    ? rawFailureFingerprint.exitCode
                    : null);
            const firstOutputLine = rawFailureFingerprint.firstOutputLine === null
                ? null
                : (typeof rawFailureFingerprint.firstOutputLine === 'string'
                    ? rawFailureFingerprint.firstOutputLine
                    : null);
            const normalizedOutputLine = rawFailureFingerprint.normalizedOutputLine === null
                ? null
                : (typeof rawFailureFingerprint.normalizedOutputLine === 'string'
                    ? rawFailureFingerprint.normalizedOutputLine
                    : null);
            const signature = typeof rawFailureFingerprint.signature === 'string'
                && rawFailureFingerprint.signature.trim().length > 0
                ? rawFailureFingerprint.signature
                : null;
            const hashAlgorithm = typeof rawFailureFingerprint.hashAlgorithm === 'string'
                ? rawFailureFingerprint.hashAlgorithm
                : null;
            const hash = typeof rawFailureFingerprint.hash === 'string'
                ? rawFailureFingerprint.hash
                : null;

            if (!stepId) {
                validationErrors.push('Self-check report summary.failureFingerprint.stepId is required.');
            }
            if (!command) {
                validationErrors.push('Self-check report summary.failureFingerprint.command is required.');
            }
            if (rawFailureFingerprint.exitCode !== null && !Number.isFinite(rawFailureFingerprint.exitCode)) {
                validationErrors.push('Self-check report summary.failureFingerprint.exitCode must be number or null.');
            }
            if (rawFailureFingerprint.firstOutputLine !== null && typeof rawFailureFingerprint.firstOutputLine !== 'string') {
                validationErrors.push('Self-check report summary.failureFingerprint.firstOutputLine must be string or null.');
            }
            if (
                rawFailureFingerprint.normalizedOutputLine !== null
                && typeof rawFailureFingerprint.normalizedOutputLine !== 'string'
            ) {
                validationErrors.push('Self-check report summary.failureFingerprint.normalizedOutputLine must be string or null.');
            }
            if (!signature) {
                validationErrors.push('Self-check report summary.failureFingerprint.signature is required.');
            }
            if (hashAlgorithm !== 'sha256') {
                validationErrors.push('Self-check report summary.failureFingerprint.hashAlgorithm must be sha256.');
            }
            if (!isSha256Hash(hash)) {
                validationErrors.push('Self-check report summary.failureFingerprint.hash must be a lowercase sha256 hex string.');
            }

            if (stepId && !stepIdSet.has(stepId)) {
                validationErrors.push(
                    `Self-check report summary.failureFingerprint.stepId not found in steps: ${stepId}.`,
                );
            }
            if (stepId && failedStepIds.length > 0 && !failedStepIds.includes(stepId)) {
                validationErrors.push(
                    `Self-check report summary.failureFingerprint.stepId must be within summary.failedStepIds: ${stepId}.`,
                );
            }
            if (signature && isSha256Hash(hash)) {
                const expectedHash = createHash('sha256').update(signature).digest('hex');
                if (expectedHash !== hash) {
                    validationErrors.push(
                        'Self-check report summary.failureFingerprint.hash mismatch with signature.',
                    );
                }
            }

            failureFingerprint = {
                stepId,
                command,
                exitCode,
                firstOutputLine,
                normalizedOutputLine,
                signature,
                hashAlgorithm,
                hash,
            };
        }
    }

    if (report.status === 'SUCCESS' && failedStepIds.length > 0) {
        validationErrors.push('Self-check report status SUCCESS cannot have failedStepIds.');
    }
    if (report.status === 'FAILED' && failedStepIds.length === 0) {
        warnings.push('Self-check report status FAILED has no failedStepIds.');
    }
    if (report.status === 'FAILED' && failedStepIds.length > 0 && !failureFingerprint) {
        validationErrors.push('Self-check report summary.failureFingerprint is required when failedStepIds is not empty.');
    }
    if (report.status === 'SUCCESS' && failureFingerprint) {
        warnings.push('Self-check report summary.failureFingerprint should be null when status is SUCCESS.');
    }
    if (failedStepIds.length === 0 && failureFingerprint) {
        warnings.push('Self-check report summary.failureFingerprint exists but summary.failedStepIds is empty.');
    }
    if (failureFingerprint?.stepId && stepById.has(failureFingerprint.stepId)) {
        const failedStep = stepById.get(failureFingerprint.stepId);
        const expectedCommand = buildStepCommand(failedStep);
        if (failureFingerprint.command && expectedCommand !== failureFingerprint.command) {
            validationErrors.push(
                `Self-check report summary.failureFingerprint.command mismatch: expected "${expectedCommand}", actual "${failureFingerprint.command}".`,
            );
        }
        const expectedFirstOutputLine = extractFirstOutputLine(failedStep?.outputTail);
        if ((expectedFirstOutputLine || null) !== failureFingerprint.firstOutputLine) {
            validationErrors.push(
                'Self-check report summary.failureFingerprint.firstOutputLine mismatch with failed step outputTail.',
            );
        }
        const expectedNormalizedOutputLine = normalizeFailureFingerprintLine(expectedFirstOutputLine);
        if ((expectedNormalizedOutputLine || null) !== failureFingerprint.normalizedOutputLine) {
            validationErrors.push(
                'Self-check report summary.failureFingerprint.normalizedOutputLine mismatch with failed step outputTail.',
            );
        }
        const expectedExitCode = Number.isFinite(failedStep?.exitCode) ? failedStep.exitCode : null;
        if (failureFingerprint.exitCode !== expectedExitCode) {
            validationErrors.push(
                `Self-check report summary.failureFingerprint.exitCode mismatch: expected ${String(expectedExitCode)}, actual ${String(failureFingerprint.exitCode)}.`,
            );
        }
    }

    return {
        schemaVersion: typeof report.schemaVersion === 'string' ? report.schemaVersion : null,
        status: typeof report.status === 'string' ? report.status : null,
        runId: typeof report.runId === 'string' ? report.runId : null,
        totalSteps: typeof summaryTotalSteps === 'number' ? summaryTotalSteps : null,
        executedSteps: steps ? steps.length : 0,
        successfulSteps: typeof summarySuccessfulSteps === 'number' ? summarySuccessfulSteps : null,
        failedSteps: typeof summaryFailedSteps === 'number' ? summaryFailedSteps : null,
        failedStepIds: Array.isArray(failedStepIds) ? failedStepIds : [],
        quickLocateCommandSourcePriority: quickLocatePriority,
        quickLocateCommandSource: quickLocateSource,
        quickLocateFirstFixRoute: quickLocateFirstFixRoute,
        quickLocateCommand: quickLocateCommand,
        quickLocateFirstFailedOutput: quickLocateFirstFailedOutput,
        hasFailureFingerprint: Boolean(failureFingerprint),
        failureFingerprintStepId: failureFingerprint?.stepId || null,
        failureFingerprintHashAlgorithm: failureFingerprint?.hashAlgorithm || null,
        failureFingerprintHash: failureFingerprint?.hash || null,
    };
};

const writeSummaryJson = async (summaryJsonAbsolutePath, summary) => {
    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
    console.log(`[workflow-summary-self-check-report-validate] validation summary json written to ${summaryJsonAbsolutePath}`);
};

async function main() {
    const reportFile = readArgValue('--report-file', DEFAULT_REPORT_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const expectedReportSchemaVersion = readArgValue(
        '--expected-report-schema-version',
        DEFAULT_EXPECTED_REPORT_SCHEMA_VERSION,
    );

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
        validationErrors.push(`Failed to read self-check report: ${message}`);
    }

    const reportSummary = validateReport(
        report,
        expectedReportSchemaVersion,
        validationErrors,
        warnings,
    );

    const summary = {
        schemaVersion: VALIDATION_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status: validationErrors.length > 0 ? 'FAILED' : 'SUCCESS',
        inputs: {
            reportFile,
            expectedReportSchemaVersion,
            summaryJsonFile,
        },
        report: reportSummary,
        warnings,
        validationErrors,
    };

    await writeSummaryJson(summaryJsonAbsolutePath, summary);

    if (validationErrors.length > 0) {
        console.error(
            `[workflow-summary-self-check-report-validate] failed: validation failed: ${validationErrors.join(' ')}`,
        );
        process.exitCode = 1;
        return;
    }

    console.log('[workflow-summary-self-check-report-validate] self-check report validation passed.');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-summary-self-check-report-validate] failed: ${message}`);
    process.exitCode = 1;
});
