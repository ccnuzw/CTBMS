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
const selfCheckAllScript = path.resolve(repoRoot, 'scripts/workflow-summary-self-check-all.mjs');

const runNodeScript = (scriptFile, args, envOverride = {}) => new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptFile, ...args], {
        cwd: repoRoot,
        env: {
            ...process.env,
            ...envOverride,
        },
        shell: false,
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
        resolve({
            exitCode: 1,
            output: message,
        });
    });
});

const readJsonFile = async (filePath) => {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
};

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-summary-self-check-all-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('aggregate self-check succeeds and writes report', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            await mkdir(caseDir, { recursive: true });
            const reportFile = path.join(caseDir, 'summary-self-check-report.json');

            const result = await runNodeScript(selfCheckAllScript, [
                `--report-file=${reportFile}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);
            assert.ok(result.output.includes('all self-check steps passed'));

            const report = await readJsonFile(reportFile);
            assert.equal(report.status, 'SUCCESS');
            assert.equal(report.summary?.totalSteps, 7);
            assert.equal(report.summary?.failedSteps, 0);
            assert.deepEqual(report.summary?.failedStepIds, []);
            assert.equal(report.summary?.failureFingerprint, null);
            assert.deepEqual(report.summary?.quickLocateCommandSourcePriority, [
                'STEP_OVERRIDE',
                'FAILED_STEP',
                'N/A',
            ]);
            assert.equal(report.summary?.quickLocateCommandSource, 'N/A');
            assert.equal(report.summary?.quickLocateFirstFixRoute, 'INSPECT_SELF_CHECK_REPORT_STEPS');
            assert.equal(report.summary?.quickLocateCommand, null);
            assert.equal(report.summary?.quickLocateFirstFailedOutput, null);
            assert.equal(report.reportFile, reportFile);
            assert.equal(Array.isArray(report.steps), true);
            assert.equal(report.steps.length, 7);
            assert.ok(
                report.steps.some((step) => step?.id === 'quality-gate-validation-guidance-self-check'),
            );
        });

        await runCase('aggregate self-check failure still writes failed report', async () => {
            const caseDir = path.join(tempRoot, 'case-failed');
            await mkdir(caseDir, { recursive: true });
            const reportFile = path.join(caseDir, 'summary-self-check-report.json');

            const result = await runNodeScript(
                selfCheckAllScript,
                [`--report-file=${reportFile}`],
                {
                    PATH: '/nonexistent-path-for-workflow-self-check',
                },
            );
            assert.equal(result.exitCode, 1, result.output);
            assert.ok(result.output.includes('failed steps: report-validate-self-check'));
            assert.ok(result.output.includes('quick locate: command source priority: STEP_OVERRIDE > FAILED_STEP > N/A'));
            assert.ok(result.output.includes('quick locate: command source: STEP_OVERRIDE'));
            assert.ok(result.output.includes('quick locate: first fix route: RERUN_QUICK_LOCATE_COMMAND'));
            assert.ok(result.output.includes('quick locate: rerun pnpm workflow:reports:validate:self-check'));
            assert.ok(result.output.includes('quick locate: first failed output:'));
            assert.ok(result.output.includes('quick locate: failure fingerprint hash:'));

            const report = await readJsonFile(reportFile);
            assert.equal(report.status, 'FAILED');
            assert.equal(report.summary?.failedSteps, 1);
            assert.ok(Array.isArray(report.summary?.failedStepIds));
            assert.ok(report.summary.failedStepIds.includes('report-validate-self-check'));
            assert.deepEqual(report.summary?.quickLocateCommandSourcePriority, [
                'STEP_OVERRIDE',
                'FAILED_STEP',
                'N/A',
            ]);
            assert.equal(report.summary?.quickLocateCommandSource, 'STEP_OVERRIDE');
            assert.equal(report.summary?.quickLocateFirstFixRoute, 'RERUN_QUICK_LOCATE_COMMAND');
            assert.equal(
                report.summary?.quickLocateCommand,
                'pnpm workflow:reports:validate:self-check',
            );
            assert.equal(typeof report.summary?.quickLocateFirstFailedOutput, 'string');
            assert.ok(report.summary.quickLocateFirstFailedOutput.length > 0);
            const failedStep = Array.isArray(report.steps)
                ? report.steps.find((step) => step?.id === 'report-validate-self-check')
                : null;
            assert.ok(failedStep);
            assert.equal(failedStep.status, 'FAILED');
            assert.equal(failedStep.exitCode, 1);
            assert.ok(String(failedStep.outputTail || '').length > 0);
            assert.equal(report.summary?.failureFingerprint?.stepId, 'report-validate-self-check');
            assert.equal(
                report.summary?.failureFingerprint?.command,
                'pnpm workflow:reports:validate:self-check',
            );
            assert.equal(report.summary?.failureFingerprint?.exitCode, 1);
            assert.equal(typeof report.summary?.failureFingerprint?.signature, 'string');
            assert.ok(String(report.summary?.failureFingerprint?.signature || '').includes('stepId=report-validate-self-check'));
            assert.equal(report.summary?.failureFingerprint?.hashAlgorithm, 'sha256');
            assert.equal(typeof report.summary?.failureFingerprint?.hash, 'string');
            assert.equal(report.summary?.failureFingerprint?.hash.length, 64);
        });

        await runCase('aggregate self-check failure supports failed-step quick locate source', async () => {
            const caseDir = path.join(tempRoot, 'case-failed-step-quick-locate');
            await mkdir(caseDir, { recursive: true });
            const reportFile = path.join(caseDir, 'summary-self-check-report.json');

            const result = await runNodeScript(
                selfCheckAllScript,
                [
                    `--report-file=${reportFile}`,
                    '--quick-locate-disable-overrides',
                ],
                {
                    PATH: '/nonexistent-path-for-workflow-self-check',
                },
            );
            assert.equal(result.exitCode, 1, result.output);
            assert.ok(result.output.includes('quick locate: command source priority: STEP_OVERRIDE > FAILED_STEP > N/A'));
            assert.ok(result.output.includes('quick locate: command source: FAILED_STEP'));
            assert.ok(result.output.includes('quick locate: first fix route: RERUN_FAILED_STEP_COMMAND'));
            assert.ok(result.output.includes('quick locate: rerun pnpm workflow:reports:validate:self-check'));

            const report = await readJsonFile(reportFile);
            assert.equal(report.status, 'FAILED');
            assert.deepEqual(report.summary?.quickLocateCommandSourcePriority, [
                'STEP_OVERRIDE',
                'FAILED_STEP',
                'N/A',
            ]);
            assert.equal(report.summary?.quickLocateCommandSource, 'FAILED_STEP');
            assert.equal(report.summary?.quickLocateFirstFixRoute, 'RERUN_FAILED_STEP_COMMAND');
            assert.equal(
                report.summary?.quickLocateCommand,
                'pnpm workflow:reports:validate:self-check',
            );
            assert.equal(typeof report.summary?.quickLocateFirstFailedOutput, 'string');
            assert.ok(report.summary.quickLocateFirstFailedOutput.length > 0);
        });

        process.stdout.write('\n[self-check] all workflow-summary-self-check-all cases passed.\n');
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
