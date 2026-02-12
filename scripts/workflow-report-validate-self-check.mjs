#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const validateScript = path.resolve(repoRoot, 'scripts/workflow-report-validate.mjs');

const nowIso = () => new Date().toISOString();

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

const readJson = async (targetPath) => JSON.parse(await readFile(targetPath, 'utf-8'));

const createSmokeReport = ({ status }) => {
    const timestamp = nowIso();
    return {
        schemaVersion: '1.1',
        runId: 'self-check-smoke',
        mode: 'gate',
        startedAt: timestamp,
        finishedAt: timestamp,
        durationMs: 12.34,
        status,
        steps: [
            {
                id: 'smoke-step',
                name: 'smoke step',
                command: 'internal',
                args: [],
                maxRetries: 0,
                retryOnTransientDbError: false,
                startedAt: timestamp,
                finishedAt: timestamp,
                durationMs: 12.34,
                status,
                retryCount: 0,
                attempts: [
                    {
                        attempt: 1,
                        startedAt: timestamp,
                        finishedAt: timestamp,
                        durationMs: 12.34,
                        exitCode: status === 'SUCCESS' ? 0 : 1,
                        transientDbError: false,
                        willRetry: false,
                        outputTail: '',
                    },
                ],
            },
        ],
        summary: {
            totalSteps: 1,
            successfulSteps: status === 'SUCCESS' ? 1 : 0,
            failedSteps: status === 'SUCCESS' ? 0 : 1,
            totalRetries: 0,
            failedStepName: status === 'SUCCESS' ? null : 'smoke step',
        },
        errorMessage: status === 'SUCCESS' ? null : 'mock smoke failure',
    };
};

const createPerfReport = ({ generatedAt, violations = [] }) => ({
    schemaVersion: '1.0',
    generatedAt,
    environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
    },
    iterations: 1,
    warmupRuns: 0,
    metrics: [
        {
            id: 'pass-low-risk',
            description: 'pass',
            sampleSize: 1,
            p50Ms: 0.01,
            p95Ms: 0.01,
            p99Ms: 0.01,
            avgMs: 0.01,
            minMs: 0.01,
            maxMs: 0.01,
        },
        {
            id: 'soft-block-high-risk',
            description: 'soft block',
            sampleSize: 1,
            p50Ms: 0.02,
            p95Ms: 0.02,
            p99Ms: 0.02,
            avgMs: 0.02,
            minMs: 0.02,
            maxMs: 0.02,
        },
        {
            id: 'hard-block-by-rule',
            description: 'hard block',
            sampleSize: 1,
            p50Ms: 0.03,
            p95Ms: 0.03,
            p99Ms: 0.03,
            avgMs: 0.03,
            minMs: 0.03,
            maxMs: 0.03,
        },
    ],
    thresholdCheck: {
        enabled: true,
        limits: [],
        violations,
    },
});

const createQualityGateReport = ({
    status = 'SUCCESS',
    smokeReportFile,
    perfReportFile,
    summaryMarkdownFile,
    summaryJsonFile,
}) => ({
    schemaVersion: '1.0',
    runId: 'self-check-quality-gate',
    startedAt: nowIso(),
    finishedAt: nowIso(),
    durationMs: 1.11,
    status,
    artifacts: {
        smokeReportFile,
        perfReportFile,
        summaryMarkdownFile,
        summaryJsonFile,
        qualityGateReportFile: '/tmp/quality-report.json',
    },
    summary: {
        totalSteps: 1,
        successfulSteps: status === 'SUCCESS' ? 1 : 0,
        failedSteps: status === 'SUCCESS' ? 0 : 1,
        failedStepIds: status === 'SUCCESS' ? [] : ['mock-step'],
    },
});

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

const assertSummaryFileHasError = (summary, expectedMessagePart) => {
    assert.equal(summary.status, 'FAILED');
    assert.ok(
        Array.isArray(summary.validationErrors)
        && summary.validationErrors.some((item) => item.includes(expectedMessagePart)),
        `expected validationErrors to include "${expectedMessagePart}"`,
    );
};

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-report-validate-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('strict success with json summary', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            await mkdir(caseDir, { recursive: true });

            const smokeReportPath = path.join(caseDir, 'smoke.json');
            const perfReportPath = path.join(caseDir, 'perf.json');
            const qualityGateReportPath = path.join(caseDir, 'quality.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');
            const generatedAt = nowIso();

            await writeJson(smokeReportPath, createSmokeReport({ status: 'SUCCESS' }));
            await writeJson(perfReportPath, createPerfReport({ generatedAt }));
            await writeJson(qualityGateReportPath, createQualityGateReport({
                status: 'SUCCESS',
                smokeReportFile: smokeReportPath,
                perfReportFile: perfReportPath,
                summaryMarkdownFile: summaryMarkdownPath,
                summaryJsonFile: summaryJsonPath,
            }));

            const result = await runNodeScript(validateScript, [
                `--smoke-report=${smokeReportPath}`,
                `--perf-report=${perfReportPath}`,
                `--quality-gate-report=${qualityGateReportPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                '--require-quality-gate-success',
                '--require-smoke-success',
                '--require-smoke-mode=gate',
                '--require-perf-no-violations',
                `--require-reports-generated-after=${generatedAt}`,
                '--max-report-age-ms=600000',
                '--summary-json-schema-version=1.0',
            ]);

            assert.equal(result.exitCode, 0, result.output);
            const summary = await readJson(summaryJsonPath);
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.validationErrors.length, 0);
        });

        await runCase('summary json path mismatch still writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-summary-json-mismatch');
            await mkdir(caseDir, { recursive: true });

            const smokeReportPath = path.join(caseDir, 'smoke.json');
            const perfReportPath = path.join(caseDir, 'perf.json');
            const qualityGateReportPath = path.join(caseDir, 'quality.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const qualitySummaryJsonPath = path.join(caseDir, 'summary-in-quality.json');
            const validateSummaryJsonPath = path.join(caseDir, 'summary-from-validate.json');

            await writeJson(smokeReportPath, createSmokeReport({ status: 'SUCCESS' }));
            await writeJson(perfReportPath, createPerfReport({ generatedAt: nowIso() }));
            await writeJson(qualityGateReportPath, createQualityGateReport({
                status: 'SUCCESS',
                smokeReportFile: smokeReportPath,
                perfReportFile: perfReportPath,
                summaryMarkdownFile: summaryMarkdownPath,
                summaryJsonFile: qualitySummaryJsonPath,
            }));

            const result = await runNodeScript(validateScript, [
                `--smoke-report=${smokeReportPath}`,
                `--perf-report=${perfReportPath}`,
                `--quality-gate-report=${qualityGateReportPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${validateSummaryJsonPath}`,
                '--require-quality-gate-success',
            ]);

            assert.notEqual(result.exitCode, 0, 'mismatch case should fail');
            const summary = await readJson(validateSummaryJsonPath);
            assertSummaryFileHasError(summary, 'Quality gate summary json path mismatch');
        });

        await runCase('strict failure still writes markdown and json summary', async () => {
            const caseDir = path.join(tempRoot, 'case-strict-failure-summary');
            await mkdir(caseDir, { recursive: true });

            const smokeReportPath = path.join(caseDir, 'smoke.json');
            const perfReportPath = path.join(caseDir, 'perf.json');
            const qualityGateReportPath = path.join(caseDir, 'quality.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            await writeJson(smokeReportPath, createSmokeReport({ status: 'FAILED' }));
            await writeJson(perfReportPath, createPerfReport({ generatedAt: nowIso() }));
            await writeJson(qualityGateReportPath, createQualityGateReport({
                status: 'SUCCESS',
                smokeReportFile: smokeReportPath,
                perfReportFile: perfReportPath,
                summaryMarkdownFile: summaryMarkdownPath,
                summaryJsonFile: summaryJsonPath,
            }));

            const result = await runNodeScript(validateScript, [
                `--smoke-report=${smokeReportPath}`,
                `--perf-report=${perfReportPath}`,
                `--quality-gate-report=${qualityGateReportPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                '--require-quality-gate-success',
                '--require-smoke-success',
            ]);

            assert.notEqual(result.exitCode, 0, 'strict failure case should fail');
            const markdown = await readFile(summaryMarkdownPath, 'utf-8');
            assert.ok(markdown.includes('## Validation Errors'));
            const summary = await readJson(summaryJsonPath);
            assertSummaryFileHasError(summary, 'Smoke report status must be SUCCESS');
        });

        await runCase('summary json schema version mismatch still writes summary', async () => {
            const caseDir = path.join(tempRoot, 'case-summary-schema-mismatch');
            await mkdir(caseDir, { recursive: true });

            const smokeReportPath = path.join(caseDir, 'smoke.json');
            const perfReportPath = path.join(caseDir, 'perf.json');
            const qualityGateReportPath = path.join(caseDir, 'quality.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            await writeJson(smokeReportPath, createSmokeReport({ status: 'SUCCESS' }));
            await writeJson(perfReportPath, createPerfReport({ generatedAt: nowIso() }));
            await writeJson(qualityGateReportPath, createQualityGateReport({
                status: 'SUCCESS',
                smokeReportFile: smokeReportPath,
                perfReportFile: perfReportPath,
                summaryMarkdownFile: summaryMarkdownPath,
                summaryJsonFile: summaryJsonPath,
            }));

            const result = await runNodeScript(validateScript, [
                `--smoke-report=${smokeReportPath}`,
                `--perf-report=${perfReportPath}`,
                `--quality-gate-report=${qualityGateReportPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                '--summary-json-schema-version=9.9',
            ]);

            assert.notEqual(result.exitCode, 0, 'schema mismatch case should fail');
            const summary = await readJson(summaryJsonPath);
            assertSummaryFileHasError(summary, 'Summary json schema version mismatch');
        });

        process.stdout.write('\n[self-check] all workflow-report-validate cases passed.\n');
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
