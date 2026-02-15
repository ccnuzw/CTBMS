#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const REPORT_SCHEMA_VERSION = '1.0';
const DEFAULT_SUMMARY_MARKDOWN_FILE = 'logs/workflow-reports-summary.md';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-reports-summary.json';
const DEFAULT_REPORT_FILE = 'logs/workflow-quality-gate-report.json';
const DEFAULT_SUMMARY_JSON_SCHEMA_VERSION = '1.0';

const nowIso = () => new Date().toISOString();
const toDurationMs = (startedAtNs) => Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
const toFixedMs = (durationMs) => Number(durationMs.toFixed(3));
const toRunTag = (iso, pid) => `${iso.replace(/[-:.TZ]/g, '').slice(0, 14)}-${pid}`;
const DEFAULT_DB_PREFLIGHT_TIMEOUT_MS = 3_000;

const args = process.argv.slice(2);

const getArgValue = (name, fallbackValue) => {
    const match = args.find((item) => item.startsWith(`${name}=`));
    if (!match) {
        return fallbackValue;
    }
    const value = match.split('=').slice(1).join('=').trim();
    return value || fallbackValue;
};

const hasFlag = (name) => args.includes(name);
const parseOptionalPositiveNumber = (name, fallbackValue) => {
    const raw = getArgValue(name, '').trim();
    if (!raw) {
        return fallbackValue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${name} value: ${raw}`);
    }
    return Math.floor(parsed);
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

const runCommand = (command, commandArgs) => new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
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
        resolve({
            exitCode: code ?? 1,
            output,
        });
    });

    child.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        resolve({
            exitCode: 1,
            output: message,
        });
    });
});

const parseDatabaseEndpoint = (databaseUrl) => {
    try {
        const parsed = new URL(databaseUrl);
        const protocol = parsed.protocol.replace(':', '');
        if (!['postgres', 'postgresql'].includes(protocol)) {
            return null;
        }
        const host = parsed.hostname;
        const port = parsed.port ? Number(parsed.port) : 5432;
        if (!host || !Number.isFinite(port) || port <= 0) {
            return null;
        }
        return { host, port };
    } catch {
        return null;
    }
};

const checkTcpReachable = ({ host, port, timeoutMs }) => new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finalize = (reachable, message) => {
        if (settled) {
            return;
        }
        settled = true;
        socket.destroy();
        resolve({ reachable, message });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true, null));
    socket.once('timeout', () => finalize(false, `timeout after ${timeoutMs}ms`));
    socket.once('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        finalize(false, message);
    });
});

const createStep = (step) => ({
    ...step,
    status: 'PENDING',
    startedAt: null,
    finishedAt: null,
    durationMs: 0,
    exitCode: null,
    outputTail: '',
});

const runStep = async (step) => {
    const startedAt = nowIso();
    const startedAtNs = process.hrtime.bigint();
    console.log(`\n[workflow-quality-gate] running step: ${step.name}`);
    const result = await runCommand(step.command, step.args);
    const durationMs = toFixedMs(toDurationMs(startedAtNs));
    return {
        ...step,
        startedAt,
        finishedAt: nowIso(),
        durationMs,
        status: result.exitCode === 0 ? 'SUCCESS' : 'FAILED',
        exitCode: result.exitCode,
        outputTail: extractOutputTail(result.output),
    };
};

const runDbPreflightStep = async (options) => {
    const step = createStep({
        id: 'db-preflight',
        name: 'workflow db preflight',
        command: 'internal',
        args: [`timeoutMs=${options.dbPreflightTimeoutMs}`],
    });
    const stepStartedAt = nowIso();
    const stepStartedAtNs = process.hrtime.bigint();

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return {
            ...step,
            startedAt: stepStartedAt,
            finishedAt: nowIso(),
            durationMs: toFixedMs(toDurationMs(stepStartedAtNs)),
            status: 'FAILED',
            exitCode: 1,
            outputTail: 'DATABASE_URL is required for smoke gate DB preflight.',
        };
    }

    const endpoint = parseDatabaseEndpoint(databaseUrl);
    if (!endpoint) {
        return {
            ...step,
            startedAt: stepStartedAt,
            finishedAt: nowIso(),
            durationMs: toFixedMs(toDurationMs(stepStartedAtNs)),
            status: 'FAILED',
            exitCode: 1,
            outputTail: 'DATABASE_URL is invalid for DB preflight.',
        };
    }

    console.log(
        `[workflow-quality-gate] db preflight: checking ${endpoint.host}:${endpoint.port} (timeout=${options.dbPreflightTimeoutMs}ms)`,
    );
    const preflight = await checkTcpReachable({
        host: endpoint.host,
        port: endpoint.port,
        timeoutMs: options.dbPreflightTimeoutMs,
    });

    if (!preflight.reachable) {
        return {
            ...step,
            startedAt: stepStartedAt,
            finishedAt: nowIso(),
            durationMs: toFixedMs(toDurationMs(stepStartedAtNs)),
            status: 'FAILED',
            exitCode: 1,
            outputTail: `db preflight failed for ${endpoint.host}:${endpoint.port}: ${preflight.message}`,
        };
    }

    return {
        ...step,
        startedAt: stepStartedAt,
        finishedAt: nowIso(),
        durationMs: toFixedMs(toDurationMs(stepStartedAtNs)),
        status: 'SUCCESS',
        exitCode: 0,
        outputTail: `db preflight reachable: ${endpoint.host}:${endpoint.port}`,
    };
};

const runSummaryJsonAssertStep = async (options) => {
    const step = createStep({
        id: 'summary-json-assert',
        name: 'workflow summary json assert',
        command: 'internal',
        args: [options.summaryJsonFile],
    });
    const stepStartedAt = nowIso();
    const stepStartedAtNs = process.hrtime.bigint();
    const summaryJsonAbsolutePath = path.resolve(repoRoot, options.summaryJsonFile);
    const buildStepResult = ({
        status,
        exitCode,
        outputTail,
        assertion,
    }) => ({
        ...step,
        startedAt: stepStartedAt,
        finishedAt: nowIso(),
        durationMs: toFixedMs(toDurationMs(stepStartedAtNs)),
        status,
        exitCode,
        outputTail,
        assertion,
    });

    try {
        const content = await readFile(summaryJsonAbsolutePath, 'utf-8');
        const summary = JSON.parse(content);
        const status = summary?.status;
        const validationErrors = Array.isArray(summary?.validationErrors)
            ? summary.validationErrors
            : [];
        const schemaVersion = typeof summary?.schemaVersion === 'string'
            ? summary.schemaVersion
            : null;

        if (schemaVersion !== options.validateSummaryJsonSchemaVersion) {
            return buildStepResult({
                status: 'FAILED',
                exitCode: 1,
                outputTail: `summary json schema mismatch: expected=${options.validateSummaryJsonSchemaVersion}, actual=${schemaVersion ?? 'N/A'}`,
                assertion: {
                    reasonCode: 'SCHEMA_MISMATCH',
                    expectedSchemaVersion: options.validateSummaryJsonSchemaVersion,
                    actualSchemaVersion: schemaVersion,
                    summaryStatus: typeof status === 'string' ? status : null,
                    validationErrorCount: validationErrors.length,
                },
            });
        }

        if (status !== 'SUCCESS') {
            return buildStepResult({
                status: 'FAILED',
                exitCode: 1,
                outputTail: `summary json status must be SUCCESS, got ${status ?? 'N/A'}`,
                assertion: {
                    reasonCode: 'SUMMARY_STATUS_NOT_SUCCESS',
                    expectedSchemaVersion: options.validateSummaryJsonSchemaVersion,
                    actualSchemaVersion: schemaVersion,
                    summaryStatus: typeof status === 'string' ? status : null,
                    validationErrorCount: validationErrors.length,
                },
            });
        }

        if (validationErrors.length > 0) {
            return buildStepResult({
                status: 'FAILED',
                exitCode: 1,
                outputTail: `summary json has validationErrors: ${validationErrors.join(' | ')}`,
                assertion: {
                    reasonCode: 'VALIDATION_ERRORS_PRESENT',
                    expectedSchemaVersion: options.validateSummaryJsonSchemaVersion,
                    actualSchemaVersion: schemaVersion,
                    summaryStatus: typeof status === 'string' ? status : null,
                    validationErrorCount: validationErrors.length,
                },
            });
        }

        return buildStepResult({
            status: 'SUCCESS',
            exitCode: 0,
            outputTail: `summary json assert passed: ${options.summaryJsonFile}`,
            assertion: {
                reasonCode: 'OK',
                expectedSchemaVersion: options.validateSummaryJsonSchemaVersion,
                actualSchemaVersion: schemaVersion,
                summaryStatus: typeof status === 'string' ? status : null,
                validationErrorCount: validationErrors.length,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildStepResult({
            status: 'FAILED',
            exitCode: 1,
            outputTail: `summary json assert failed: ${message}`,
            assertion: {
                reasonCode: 'READ_OR_PARSE_ERROR',
                expectedSchemaVersion: options.validateSummaryJsonSchemaVersion,
                actualSchemaVersion: null,
                summaryStatus: null,
                validationErrorCount: null,
            },
        });
    }
};

const buildSteps = (options) => {
    const steps = [];

    if (!options.skipSmoke) {
        steps.push(createStep({
            id: 'smoke-gate',
            name: 'workflow smoke gate',
            command: 'pnpm',
            args: [
                'workflow:smoke:gate',
                '--',
                `--report-file=${options.smokeReportFile}`,
            ],
        }));
    }

    if (!options.skipPerf) {
        const perfGateArgs = [
            'workflow:perf:risk-gate',
            '--',
            `--report-file=${options.perfReportFileAbsolute}`,
            '--max-p95-pass-low-risk=0.03',
            '--max-p95-soft-block-high-risk=0.03',
            '--max-p95-hard-block-by-rule=0.04',
        ];
        steps.push(createStep({
            id: 'perf-gate',
            name: 'workflow perf gate',
            command: 'pnpm',
            args: perfGateArgs,
        }));
    }

    if (!options.skipValidate) {
        const validateArgs = ['workflow:reports:validate', '--'];
        if (options.summaryMarkdownFile) {
            validateArgs.push(`--summary-markdown-file=${options.summaryMarkdownFile}`);
        }
        if (options.summaryJsonFile) {
            validateArgs.push(`--summary-json-file=${options.summaryJsonFile}`);
        }
        validateArgs.push(`--smoke-report=${options.smokeReportFile}`);
        validateArgs.push(`--perf-report=${options.perfReportFile}`);
        validateArgs.push(`--quality-gate-report=${options.reportFile}`);
        validateArgs.push(`--require-reports-generated-after=${options.runStartedAt}`);
        validateArgs.push(`--summary-json-schema-version=${options.validateSummaryJsonSchemaVersion}`);
        if (options.validateMaxReportAgeMs !== null) {
            validateArgs.push(`--max-report-age-ms=${options.validateMaxReportAgeMs}`);
        }
        if (options.skipSmoke) {
            validateArgs.push('--allow-missing-smoke-report');
        }
        if (options.skipPerf) {
            validateArgs.push('--allow-missing-perf-report');
        }
        if (!options.relaxedValidate) {
            if (!options.skipSmoke) {
                validateArgs.push('--require-smoke-success');
                validateArgs.push('--require-smoke-mode=gate');
            }
            if (!options.skipPerf) {
                validateArgs.push('--require-perf-no-violations');
            }
        }
        steps.push(createStep({
            id: 'report-validate',
            name: 'workflow report validate',
            command: 'pnpm',
            args: validateArgs,
        }));
    }

    return steps;
};

const writeReport = async (reportPath, report) => {
    const absolutePath = path.resolve(repoRoot, reportPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`[workflow-quality-gate] report written to ${absolutePath}`);
};

const persistProgressReport = async (reportPath, report) => {
    finalizeSummary(report);
    await writeReport(reportPath, report);
};

const finalizeSummary = (report) => {
    const successfulSteps = report.steps.filter((step) => step.status === 'SUCCESS');
    const failedSteps = report.steps.filter((step) => step.status === 'FAILED');
    const summaryJsonAssertStep = report.steps.find((step) => step.id === 'summary-json-assert');
    const assertion = summaryJsonAssertStep?.assertion || null;
    report.summary = {
        totalSteps: report.steps.length,
        successfulSteps: successfulSteps.length,
        failedSteps: failedSteps.length,
        failedStepIds: failedSteps.map((step) => step.id),
        summaryJsonAssert: summaryJsonAssertStep
            ? {
                status: summaryJsonAssertStep.status,
                reasonCode: assertion?.reasonCode ?? null,
                reason: summaryJsonAssertStep.outputTail || null,
                expectedSchemaVersion: assertion?.expectedSchemaVersion ?? null,
                actualSchemaVersion: assertion?.actualSchemaVersion ?? null,
                summaryStatus: assertion?.summaryStatus ?? null,
                validationErrorCount: Number.isFinite(assertion?.validationErrorCount)
                    ? assertion.validationErrorCount
                    : null,
            }
            : null,
    };
    report.status = failedSteps.length === 0 ? 'SUCCESS' : 'FAILED';
};

async function main() {
    const runStartedAt = nowIso();
    const runTag = toRunTag(runStartedAt, process.pid);
    const defaultSmokeReportFile = `logs/workflow-smoke-gate-report-${runTag}.json`;
    const defaultPerfReportFile = `apps/api/logs/workflow-perf-risk-gate-baseline-${runTag}.json`;

    const options = {
        runStartedAt,
        skipSmoke: hasFlag('--skip-smoke'),
        skipPerf: hasFlag('--skip-perf'),
        skipValidate: hasFlag('--skip-validate'),
        relaxedValidate: hasFlag('--relaxed-validate'),
        requireSummaryJsonSuccess: hasFlag('--require-summary-json-success'),
        skipDbPreflight: hasFlag('--skip-db-preflight'),
        dbPreflightTimeoutMs: parseOptionalPositiveNumber(
            '--db-preflight-timeout-ms',
            DEFAULT_DB_PREFLIGHT_TIMEOUT_MS,
        ),
        validateMaxReportAgeMs: parseOptionalPositiveNumber(
            '--validate-max-report-age-ms',
            null,
        ),
        validateSummaryJsonSchemaVersion: getArgValue(
            '--validate-summary-json-schema-version',
            DEFAULT_SUMMARY_JSON_SCHEMA_VERSION,
        ),
        summaryMarkdownFile: getArgValue('--summary-markdown-file', DEFAULT_SUMMARY_MARKDOWN_FILE),
        summaryJsonFile: getArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE),
        reportFile: getArgValue('--report-file', DEFAULT_REPORT_FILE),
        smokeReportFile: getArgValue('--smoke-report-file', defaultSmokeReportFile),
        perfReportFile: getArgValue('--perf-report-file', defaultPerfReportFile),
    };
    options.perfReportFileAbsolute = path.resolve(repoRoot, options.perfReportFile);

    const steps = buildSteps(options);
    if (steps.length === 0) {
        throw new Error('No workflow quality gate steps enabled.');
    }

    const startedAtNs = process.hrtime.bigint();
    const report = {
        schemaVersion: REPORT_SCHEMA_VERSION,
        runId: randomUUID(),
        startedAt: nowIso(),
        finishedAt: null,
        durationMs: 0,
        status: 'FAILED',
        options,
        artifacts: {
            smokeReportFile: options.smokeReportFile,
            perfReportFile: options.perfReportFile,
            summaryMarkdownFile: options.summaryMarkdownFile,
            summaryJsonFile: options.summaryJsonFile,
            qualityGateReportFile: options.reportFile,
        },
        errorMessage: null,
        steps: [],
        summary: {
            totalSteps: 0,
            successfulSteps: 0,
            failedSteps: 0,
            failedStepIds: [],
            summaryJsonAssert: null,
        },
    };
    await persistProgressReport(options.reportFile, report);

    try {
        if (!options.skipSmoke && !options.skipDbPreflight) {
            const preflightStep = await runDbPreflightStep(options);
            report.steps.push(preflightStep);
            await persistProgressReport(options.reportFile, report);
            if (preflightStep.status === 'FAILED') {
                throw new Error(preflightStep.outputTail || 'db preflight failed');
            }
        }

        for (const step of steps) {
            const stepResult = await runStep(step);
            report.steps.push(stepResult);
            await persistProgressReport(options.reportFile, report);
        }

        if (options.requireSummaryJsonSuccess) {
            const summaryJsonAssertStep = await runSummaryJsonAssertStep(options);
            report.steps.push(summaryJsonAssertStep);
            await persistProgressReport(options.reportFile, report);
            if (summaryJsonAssertStep.status === 'FAILED') {
                throw new Error(summaryJsonAssertStep.outputTail || 'summary json assert failed');
            }
        }
    } catch (error) {
        report.errorMessage = error instanceof Error ? error.message : String(error);
        const hasFailedStep = report.steps.some((step) => step.status === 'FAILED');
        if (!hasFailedStep) {
            report.steps.push({
                id: 'runner-error',
                name: 'workflow quality gate runner error',
                command: 'internal',
                args: [],
                status: 'FAILED',
                startedAt: nowIso(),
                finishedAt: nowIso(),
                durationMs: 0,
                exitCode: 1,
                outputTail: report.errorMessage,
            });
        }
    }

    report.finishedAt = nowIso();
    report.durationMs = toFixedMs(toDurationMs(startedAtNs));
    finalizeSummary(report);
    await writeReport(options.reportFile, report);

    if (report.status === 'FAILED') {
        throw new Error(
            `[workflow-quality-gate] failed steps: ${report.summary.failedStepIds.join(', ') || 'unknown'}${report.errorMessage ? `; reason=${report.errorMessage}` : ''}`,
        );
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});
