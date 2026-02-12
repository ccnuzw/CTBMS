#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const qualityGateRunnerScript = path.resolve(repoRoot, 'scripts/workflow-quality-gate-runner.mjs');

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

const readJson = async (targetPath) => JSON.parse(await readFile(targetPath, 'utf-8'));

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

const getStepById = (qualityGateReport, stepId) => (
    Array.isArray(qualityGateReport.steps)
        ? qualityGateReport.steps.find((step) => step?.id === stepId)
        : null
);

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-quality-gate-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('require summary json success passes with schema=1.0', async () => {
            const caseDir = path.join(tempRoot, 'case-summary-json-pass');
            await mkdir(caseDir, { recursive: true });

            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            const result = await runNodeScript(qualityGateRunnerScript, [
                '--skip-smoke',
                '--skip-perf',
                '--require-summary-json-success',
                '--validate-summary-json-schema-version=1.0',
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--report-file=${qualityReportPath}`,
            ]);

            assert.equal(result.exitCode, 0, result.output);
            const qualityReport = await readJson(qualityReportPath);
            assert.equal(qualityReport.status, 'SUCCESS');
            const summaryAssertStep = getStepById(qualityReport, 'summary-json-assert');
            assert.ok(summaryAssertStep, 'summary-json-assert step is required');
            assert.equal(summaryAssertStep.status, 'SUCCESS');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.status, 'SUCCESS');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.reasonCode, 'OK');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.expectedSchemaVersion, '1.0');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.actualSchemaVersion, '1.0');

            const summaryJson = await readJson(summaryJsonPath);
            assert.equal(summaryJson.schemaVersion, '1.0');
            assert.equal(summaryJson.status, 'SUCCESS');
        });

        await runCase('schema mismatch fails and records summary-json-assert failure', async () => {
            const caseDir = path.join(tempRoot, 'case-summary-json-schema-mismatch');
            await mkdir(caseDir, { recursive: true });

            const qualityReportPath = path.join(caseDir, 'quality-report.json');
            const summaryMarkdownPath = path.join(caseDir, 'summary.md');
            const summaryJsonPath = path.join(caseDir, 'summary.json');

            const result = await runNodeScript(qualityGateRunnerScript, [
                '--skip-smoke',
                '--skip-perf',
                '--require-summary-json-success',
                '--validate-summary-json-schema-version=9.9',
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                `--report-file=${qualityReportPath}`,
            ]);

            assert.notEqual(result.exitCode, 0, 'schema mismatch case should fail');

            const qualityReport = await readJson(qualityReportPath);
            assert.equal(qualityReport.status, 'FAILED');
            assert.ok(
                Array.isArray(qualityReport.summary?.failedStepIds)
                && qualityReport.summary.failedStepIds.includes('summary-json-assert'),
                'failedStepIds should include summary-json-assert',
            );
            const summaryAssertStep = getStepById(qualityReport, 'summary-json-assert');
            assert.ok(summaryAssertStep, 'summary-json-assert step is required');
            assert.equal(summaryAssertStep.status, 'FAILED');
            assert.ok(
                typeof summaryAssertStep.outputTail === 'string'
                && summaryAssertStep.outputTail.includes('schema mismatch'),
                'summary-json-assert should contain schema mismatch reason',
            );
            assert.equal(qualityReport.summary?.summaryJsonAssert?.status, 'FAILED');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.reasonCode, 'SCHEMA_MISMATCH');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.expectedSchemaVersion, '9.9');
            assert.equal(qualityReport.summary?.summaryJsonAssert?.actualSchemaVersion, '1.0');

            const summaryJson = await readJson(summaryJsonPath);
            assert.equal(summaryJson.status, 'FAILED');
            assert.ok(
                Array.isArray(summaryJson.validationErrors)
                && summaryJson.validationErrors.some((error) => error.includes('Summary json schema version mismatch')),
                'summary json should include schema mismatch validation error',
            );
        });

        process.stdout.write('\n[self-check] all workflow-quality-gate cases passed.\n');
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
