#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultReportDir = 'logs';
const REPORT_SCHEMA_VERSION = '1.1';

const TRANSIENT_DB_ERROR_PATTERN = /(P1001|Can't reach database server)/i;
const DATABASE_PRECHECK_MAX_ATTEMPTS = 3;
const DATABASE_PRECHECK_RETRY_DELAY_MS = 1_000;
const DATABASE_PRECHECK_CONNECT_TIMEOUT_MS = 1_500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

const toDurationMs = (startedAtNs) => Number(process.hrtime.bigint() - startedAtNs) / 1_000_000;
const toFixedMs = (durationMs) => Number(durationMs.toFixed(3));

const parseMode = () => {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!modeArg) {
    return 'base';
  }
  const mode = modeArg.split('=')[1];
  if (!['base', 'extended', 'gate'].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  return mode;
};

const parseOptions = () => {
  const mode = parseMode();
  const reportArg = process.argv.find((arg) => arg.startsWith('--report-file='));
  const noReport = process.argv.includes('--no-report');
  const reportFileFromArg = reportArg ? reportArg.split('=').slice(1).join('=').trim() : null;
  const defaultReportFile = path.join(defaultReportDir, `workflow-smoke-${mode}-report.json`);
  const reportFileRelative = noReport ? null : reportFileFromArg || defaultReportFile;
  const reportFileAbsolute = reportFileRelative ? path.resolve(repoRoot, reportFileRelative) : null;

  return {
    mode,
    reportFileRelative,
    reportFileAbsolute,
  };
};

const extractOutputTail = (output, maxLines = 40, maxChars = 4_000) => {
  if (!output) {
    return '';
  }
  const normalized = output.split('\n').slice(-maxLines).join('\n').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(normalized.length - maxChars);
};

const getDatabaseEndpoint = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      host: '127.0.0.1',
      port: 5433,
      source: 'DEFAULT',
    };
  }

  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname || '127.0.0.1';
    const port = Number(parsed.port) || 5432;
    return {
      host,
      port,
      source: 'DATABASE_URL',
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 5433,
      source: 'FALLBACK_AFTER_PARSE_ERROR',
    };
  }
};

const canConnectTcp = (host, port) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finalize = (connected) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(DATABASE_PRECHECK_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });

const ensureDatabaseReachable = async (stepName) => {
  const endpoint = getDatabaseEndpoint();
  for (let attempt = 1; attempt <= DATABASE_PRECHECK_MAX_ATTEMPTS; attempt += 1) {
    const reachable = await canConnectTcp(endpoint.host, endpoint.port);
    if (reachable) {
      return;
    }
    if (attempt < DATABASE_PRECHECK_MAX_ATTEMPTS) {
      console.warn(
        `[workflow-smoke] db precheck failed (${endpoint.host}:${endpoint.port}, attempt ${attempt}/${DATABASE_PRECHECK_MAX_ATTEMPTS}), retrying...`,
      );
      await sleep(DATABASE_PRECHECK_RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(
    `[workflow-smoke] ${stepName} blocked: database unreachable at ${endpoint.host}:${endpoint.port} (source=${endpoint.source})`,
  );
};

const runCommand = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      shell: process.platform === 'win32',
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
      resolve({ code: code ?? 1, output });
    });

    child.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      resolve({ code: 1, output: message });
    });
  });

const executeStep = async (step, stepReport) => {
  if (step.requiresDatabase) {
    await ensureDatabaseReachable(step.name);
  }

  const maxRetries = step.maxRetries ?? 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const attemptStartNs = process.hrtime.bigint();
    const attemptStartedAt = nowIso();
    console.log(`\n[workflow-smoke] ${step.name} (attempt ${attempt}/${maxRetries + 1})`);
    const result = await runCommand(step.command, step.args);
    const attemptDurationMs = toFixedMs(toDurationMs(attemptStartNs));
    const transientDbError = TRANSIENT_DB_ERROR_PATTERN.test(result.output);

    const shouldRetry = step.retryOnTransientDbError && transientDbError && attempt <= maxRetries;
    stepReport.attempts.push({
      attempt,
      startedAt: attemptStartedAt,
      finishedAt: nowIso(),
      durationMs: attemptDurationMs,
      exitCode: result.code,
      transientDbError,
      willRetry: shouldRetry,
      outputTail: extractOutputTail(result.output),
    });

    if (result.code === 0) {
      stepReport.status = 'SUCCESS';
      return;
    }

    if (!shouldRetry) {
      stepReport.status = 'FAILED';
      throw new Error(`[workflow-smoke] ${step.name} failed with exit code ${result.code}`);
    }

    stepReport.retryCount += 1;
    const waitMs = 3_000 * attempt;
    console.warn(
      `[workflow-smoke] transient DB error detected in ${step.name}, retrying in ${waitMs}ms...`,
    );
    await sleep(waitMs);
  }
};

const buildSteps = (mode) => {
  const typesBuildStep = {
    id: 'types-build',
    name: 'types build',
    command: 'pnpm',
    args: ['--filter', '@packages/types', 'build'],
  };

  const riskGateSmokeStep = {
    id: 'risk-gate-smoke',
    name: 'risk gate smoke',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'workflow:risk-gate:smoke'],
    requiresDatabase: true,
    maxRetries: 1,
    retryOnTransientDbError: true,
  };

  const riskGateContractSmokeStep = {
    id: 'risk-gate-contract-smoke',
    name: 'risk gate contract smoke',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'workflow:risk-gate:contract:smoke'],
    requiresDatabase: true,
  };

  const hasRiskSummarySmokeStep = {
    id: 'has-risk-summary-smoke',
    name: 'has-risk-summary smoke',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'workflow:has-risk-summary:smoke'],
    requiresDatabase: true,
    maxRetries: 1,
    retryOnTransientDbError: true,
  };

  const executionFiltersSmokeStep = {
    id: 'execution-filters-smoke',
    name: 'execution-filters smoke',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'workflow:execution-filters:smoke'],
    requiresDatabase: true,
    maxRetries: 1,
    retryOnTransientDbError: true,
  };

  const executionFiltersE2eStep = {
    id: 'execution-filters-e2e',
    name: 'execution-filters e2e',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'test:e2e:workflow-execution-filters'],
    requiresDatabase: true,
    maxRetries: 2,
    retryOnTransientDbError: true,
  };

  const workflowDagE2eStep = {
    id: 'workflow-dag-e2e',
    name: 'workflow dag e2e',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'test:e2e:workflow-dag'],
    requiresDatabase: true,
    maxRetries: 1,
    retryOnTransientDbError: true,
  };

  const workflowDebateExecutionE2eStep = {
    id: 'workflow-debate-execution-e2e',
    name: 'workflow debate execution e2e',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'test:e2e:workflow-debate-execution'],
    requiresDatabase: true,
    maxRetries: 1,
    retryOnTransientDbError: true,
  };

  const workflowApiAliasE2eStep = {
    id: 'workflow-api-alias-e2e',
    name: 'workflow api alias e2e',
    command: 'pnpm',
    args: ['--filter', 'api', 'run', 'test:e2e:workflow-api-alias'],
    requiresDatabase: true,
    maxRetries: 1,
    retryOnTransientDbError: true,
  };

  const baseSteps = [
    typesBuildStep,
    riskGateSmokeStep,
    riskGateContractSmokeStep,
    hasRiskSummarySmokeStep,
  ];

  if (mode === 'base') {
    return baseSteps;
  }

  if (mode === 'extended') {
    return [...baseSteps, executionFiltersSmokeStep];
  }

  // Gate mode keeps full workflow core coverage plus execution filters e2e.
  return [
    typesBuildStep,
    riskGateSmokeStep,
    riskGateContractSmokeStep,
    hasRiskSummarySmokeStep,
    executionFiltersSmokeStep,
    executionFiltersE2eStep,
    workflowDagE2eStep,
    workflowDebateExecutionE2eStep,
    workflowApiAliasE2eStep,
  ];
};

const buildStepReport = (step) => ({
  id: step.id,
  name: step.name,
  command: step.command,
  args: step.args,
  maxRetries: step.maxRetries ?? 0,
  retryOnTransientDbError: Boolean(step.retryOnTransientDbError),
  requiresDatabase: Boolean(step.requiresDatabase),
  startedAt: nowIso(),
  finishedAt: null,
  durationMs: 0,
  status: 'PENDING',
  retryCount: 0,
  attempts: [],
});

const finalizeSummary = (report) => {
  const totalRetries = report.steps.reduce((sum, step) => sum + step.retryCount, 0);
  const successfulSteps = report.steps.filter((step) => step.status === 'SUCCESS').length;
  const failedStep = report.steps.find((step) => step.status === 'FAILED');

  report.summary = {
    totalSteps: report.steps.length,
    successfulSteps,
    failedSteps: report.steps.length - successfulSteps,
    totalRetries,
    failedStepName: failedStep?.name ?? null,
  };
};

const writeReportFile = async (reportPath, report) => {
  if (!reportPath) {
    return;
  }
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`[workflow-smoke] report written to ${reportPath}`);
};

const main = async () => {
  const options = parseOptions();
  const steps = buildSteps(options.mode);
  const runStartNs = process.hrtime.bigint();

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId: randomUUID(),
    mode: options.mode,
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: 0,
    status: 'FAILED',
    reportFile: options.reportFileRelative,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    steps: [],
    summary: {
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      totalRetries: 0,
      failedStepName: null,
    },
    errorMessage: null,
  };

  try {
    for (const step of steps) {
      const stepReport = buildStepReport(step);
      report.steps.push(stepReport);
      const stepStartNs = process.hrtime.bigint();
      try {
        await executeStep(step, stepReport);
      } finally {
        stepReport.finishedAt = nowIso();
        stepReport.durationMs = toFixedMs(toDurationMs(stepStartNs));
        if (stepReport.status === 'PENDING') {
          stepReport.status = 'FAILED';
        }
      }
    }
    report.status = 'SUCCESS';
    console.log(`\n[workflow-smoke] mode=${options.mode} completed successfully.`);
  } catch (error) {
    report.status = 'FAILED';
    report.errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = nowIso();
    report.durationMs = toFixedMs(toDurationMs(runStartNs));
    finalizeSummary(report);
    await writeReportFile(options.reportFileAbsolute, report);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
