#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const REPORT_SCHEMA_VERSION = '1.0';
const DEFAULT_REPORT_FILE = 'logs/workflow-summary-self-check-report.json';
const args = process.argv.slice(2);

const nowIso = () => new Date().toISOString();
const toDurationMs = (startedAtNs) => Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
const toFixedMs = (durationMs) => Number(durationMs.toFixed(3));

const readArgValue = (name, fallback) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const parseOptions = () => {
    const noReport = args.includes('--no-report');
    const disableQuickLocateOverrides = args.includes('--quick-locate-disable-overrides');
    const reportFileFromArg = readArgValue('--report-file', DEFAULT_REPORT_FILE);
    const reportFileRelative = noReport ? null : reportFileFromArg;
    const reportFileAbsolute = reportFileRelative
        ? path.resolve(repoRoot, reportFileRelative)
        : null;

    return {
        reportFileRelative,
        reportFileAbsolute,
        disableQuickLocateOverrides,
    };
};

const extractOutputTail = (output, maxLines = 40, maxChars = 4_000) => {
    if (!output) {
        return '';
    }
    const normalized = output
        .split('\n')
        .slice(-maxLines)
        .join('\n')
        .trim();
    if (normalized.length <= maxChars) {
        return normalized;
    }
    return normalized.slice(normalized.length - maxChars);
};

const runCommand = (command, args) => new Promise((resolve) => {
    const child = spawn(command, args, {
        cwd: repoRoot,
        env: process.env,
        shell: process.platform === 'win32',
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
        resolve({ code: code ?? 1, output });
    });

    child.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        resolve({ code: 1, output: message });
    });
});

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

const buildFailureFingerprint = (step) => {
    if (!step || typeof step !== 'object') {
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

const steps = [
    {
        id: 'report-validate-self-check',
        name: 'workflow report validate self-check',
        command: 'pnpm',
        args: ['workflow:reports:validate:self-check'],
    },
    {
        id: 'summary-renderers-self-check',
        name: 'workflow summary renderers self-check',
        command: 'pnpm',
        args: ['workflow:summary:renderers:self-check'],
    },
    {
        id: 'quality-gate-validation-guidance-self-check',
        name: 'workflow quality gate validation guidance self-check',
        command: 'pnpm',
        args: ['workflow:quality:validation:guidance:self-check'],
    },
    {
        id: 'report-summary-self-check',
        name: 'workflow report summary self-check',
        command: 'pnpm',
        args: ['workflow:reports:summary:self-check'],
    },
    {
        id: 'ci-step-summary-self-check',
        name: 'workflow CI summary self-check',
        command: 'pnpm',
        args: ['workflow:ci:step-summary:self-check'],
    },
    {
        id: 'quality-gate-self-check',
        name: 'workflow quality gate self-check',
        command: 'pnpm',
        args: ['workflow:quality:gate:self-check'],
    },
    {
        id: 'quality-gate-report-validate-self-check',
        name: 'workflow quality gate report validate self-check',
        command: 'pnpm',
        args: ['workflow:quality:report:validate:self-check'],
    },
];

const QUICK_LOCATE_COMMANDS = {
    'report-validate-self-check': 'pnpm workflow:reports:validate:self-check',
    'summary-renderers-self-check': 'pnpm workflow:summary:renderers:self-check',
    'quality-gate-validation-guidance-self-check': 'pnpm workflow:quality:validation:guidance:self-check',
    'report-summary-self-check': 'pnpm workflow:reports:summary:self-check',
    'ci-step-summary-self-check': 'pnpm workflow:ci:step-summary:self-check',
    'quality-gate-self-check': 'pnpm workflow:quality:gate:self-check',
    'quality-gate-report-validate-self-check': 'pnpm workflow:quality:report:validate:self-check',
};
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

const buildStepReport = (step) => ({
    id: step.id,
    name: step.name,
    command: step.command,
    args: step.args,
    startedAt: null,
    finishedAt: null,
    durationMs: 0,
    status: 'PENDING',
    outputTail: '',
    exitCode: null,
});

const resolveQuickLocateCommandInfo = (firstFailedStep, options = {}) => {
    const disableStepOverrides = options.disableStepOverrides === true;
    if (!firstFailedStep || typeof firstFailedStep !== 'object') {
        return {
            command: null,
            source: QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
            firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION,
        };
    }

    if (!disableStepOverrides) {
        const overrideCommand = QUICK_LOCATE_COMMANDS[firstFailedStep.id] || null;
        if (typeof overrideCommand === 'string' && overrideCommand.trim().length > 0) {
            return {
                command: overrideCommand.trim(),
                source: QUICK_LOCATE_COMMAND_SOURCE.STEP_OVERRIDE,
                firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.STEP_OVERRIDE_COMMAND,
            };
        }
    }

    const fallbackCommand = buildStepCommand(firstFailedStep);
    if (fallbackCommand.length > 0) {
        return {
            command: fallbackCommand,
            source: QUICK_LOCATE_COMMAND_SOURCE.FAILED_STEP,
            firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.FAILED_STEP_COMMAND,
        };
    }

    return {
        command: null,
        source: QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
        firstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION,
    };
};

const writeReportFile = async (reportPath, report) => {
    if (!reportPath) {
        return;
    }
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`[workflow-summary-self-check-all] report written to ${reportPath}`);
};

const main = async () => {
    const options = parseOptions();
    const runStartNs = process.hrtime.bigint();
    const report = {
        schemaVersion: REPORT_SCHEMA_VERSION,
        runId: randomUUID(),
        startedAt: nowIso(),
        finishedAt: null,
        durationMs: 0,
        status: 'FAILED',
        reportFile: options.reportFileRelative,
        steps: [],
        summary: {
            totalSteps: steps.length,
            successfulSteps: 0,
            failedSteps: 0,
            failedStepIds: [],
            failureFingerprint: null,
            quickLocateCommandSourcePriority: QUICK_LOCATE_COMMAND_SOURCE_PRIORITY.slice(),
            quickLocateCommandSource: QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE,
            quickLocateFirstFixRoute: QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION,
            quickLocateCommand: null,
            quickLocateFirstFailedOutput: null,
        },
    };

    let runtimeError = null;

    try {
        for (const step of steps) {
            const stepReport = buildStepReport(step);
            report.steps.push(stepReport);
            stepReport.startedAt = nowIso();
            const stepStartNs = process.hrtime.bigint();

            console.log(`\n[workflow-summary-self-check-all] running step: ${step.name}`);
            const result = await runCommand(step.command, step.args);

            stepReport.finishedAt = nowIso();
            stepReport.durationMs = toFixedMs(toDurationMs(stepStartNs));
            stepReport.exitCode = result.code;
            stepReport.outputTail = extractOutputTail(result.output);

            if (result.code === 0) {
                stepReport.status = 'SUCCESS';
                continue;
            }

            stepReport.status = 'FAILED';
            report.summary.failedStepIds.push(step.id);
            break;
        }
    } catch (error) {
        runtimeError = error instanceof Error ? error.message : String(error);
    } finally {
        report.finishedAt = nowIso();
        report.durationMs = toFixedMs(toDurationMs(runStartNs));
        report.summary.successfulSteps = report.steps.filter((step) => step.status === 'SUCCESS').length;
        report.summary.failedSteps = report.steps.filter((step) => step.status === 'FAILED').length;
        report.status = report.summary.failedSteps > 0 ? 'FAILED' : 'SUCCESS';
        const firstFailedStepId = report.summary.failedStepIds[0] || null;
        const firstFailedStep = firstFailedStepId
            ? report.steps.find((step) => step.id === firstFailedStepId) || null
            : null;
        report.summary.failureFingerprint = buildFailureFingerprint(firstFailedStep);
        const quickLocateCommandInfo = resolveQuickLocateCommandInfo(firstFailedStep, {
            disableStepOverrides: options.disableQuickLocateOverrides,
        });
        const firstFailedOutputLine = extractFirstOutputLine(firstFailedStep?.outputTail);
        report.summary.quickLocateCommandSourcePriority = QUICK_LOCATE_COMMAND_SOURCE_PRIORITY.slice();
        report.summary.quickLocateCommandSource = quickLocateCommandInfo.source;
        report.summary.quickLocateFirstFixRoute = quickLocateCommandInfo.firstFixRoute;
        report.summary.quickLocateCommand = quickLocateCommandInfo.command;
        report.summary.quickLocateFirstFailedOutput = firstFailedOutputLine;
        if (runtimeError) {
            report.status = 'FAILED';
            report.error = runtimeError;
        }
        await writeReportFile(options.reportFileAbsolute, report);
    }

    if (runtimeError) {
        console.error(`[workflow-summary-self-check-all] failed: ${runtimeError}`);
        process.exitCode = 1;
        return;
    }

    if (report.status === 'FAILED') {
        const firstFailedStepId = report.summary.failedStepIds[0] || null;
        const quickLocateCommandSourcePriority = Array.isArray(report.summary.quickLocateCommandSourcePriority)
            && report.summary.quickLocateCommandSourcePriority.length > 0
            ? report.summary.quickLocateCommandSourcePriority
            : QUICK_LOCATE_COMMAND_SOURCE_PRIORITY;
        const quickLocateCommandSource = typeof report.summary.quickLocateCommandSource === 'string'
            ? report.summary.quickLocateCommandSource
            : QUICK_LOCATE_COMMAND_SOURCE.NOT_AVAILABLE;
        const quickLocateFirstFixRoute = typeof report.summary.quickLocateFirstFixRoute === 'string'
            ? report.summary.quickLocateFirstFixRoute
            : QUICK_LOCATE_FIRST_FIX_ROUTE.MANUAL_INSPECTION;
        const quickLocateCommand = typeof report.summary.quickLocateCommand === 'string'
            && report.summary.quickLocateCommand.trim().length > 0
            ? report.summary.quickLocateCommand
            : null;
        const firstFailedOutputLine = typeof report.summary.quickLocateFirstFailedOutput === 'string'
            && report.summary.quickLocateFirstFailedOutput.trim().length > 0
            ? report.summary.quickLocateFirstFailedOutput
            : null;

        console.error(
            `[workflow-summary-self-check-all] failed steps: ${report.summary.failedStepIds.join(', ')}`,
        );
        console.error(
            '[workflow-summary-self-check-all] quick locate: command source priority: '
            + quickLocateCommandSourcePriority.join(' > '),
        );
        console.error(
            `[workflow-summary-self-check-all] quick locate: command source: ${quickLocateCommandSource}`,
        );
        console.error(
            `[workflow-summary-self-check-all] quick locate: first fix route: ${quickLocateFirstFixRoute}`,
        );
        if (quickLocateCommand) {
            console.error(`[workflow-summary-self-check-all] quick locate: rerun ${quickLocateCommand}`);
        }
        if (firstFailedOutputLine) {
            console.error(`[workflow-summary-self-check-all] quick locate: first failed output: ${firstFailedOutputLine}`);
        }
        if (typeof report.summary.failureFingerprint?.hash === 'string') {
            console.error(
                `[workflow-summary-self-check-all] quick locate: failure fingerprint hash: ${report.summary.failureFingerprint.hash}`,
            );
        }
        if (firstFailedStepId === 'quality-gate-report-validate-self-check') {
            console.error(
                '[workflow-summary-self-check-all] quick locate: inspect logs/workflow-quality-gate-report-validation.json -> failureIndexDiagnostics.consistency.mismatchReasons',
            );
        }
        process.exitCode = 1;
        return;
    }

    console.log('[workflow-summary-self-check-all] all self-check steps passed.');
};

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[workflow-summary-self-check-all] failed: ${message}`);
    process.exitCode = 1;
});
