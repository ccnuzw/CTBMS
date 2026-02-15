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
const scriptFile = path.resolve(repoRoot, 'scripts/workflow-staging-drill-closeout.mjs');

const runNodeScript = (targetScript, scriptArgs) => new Promise((resolve) => {
    const child = spawn(process.execPath, [targetScript, ...scriptArgs], {
        cwd: repoRoot,
        env: process.env,
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

const writeJson = async (targetPath, value) => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

const readJson = async (targetPath) => JSON.parse(await readFile(targetPath, 'utf-8'));

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

const createSuccessfulStagingFullSummary = () => ({
    schemaVersion: '1.0',
    status: 'SUCCESS',
    components: {
        precheckSummary: {
            status: 'SUCCESS',
        },
        rollbackSmoke: {
            status: 'SUCCESS',
        },
        rollbackBaselineReport: {
            status: 'SUCCESS',
        },
        rollbackBaselineValidation: {
            status: 'SUCCESS',
        },
        rollbackBaselineTrend: {
            status: 'SUCCESS',
        },
        ciStepSummaryValidation: {
            status: 'SUCCESS',
            missingSections: [],
        },
    },
});

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-staging-drill-closeout-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('closeout succeeds with complete drill artifacts and ci url', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            const stagingFullSummaryPath = path.join(caseDir, 'staging-full-summary.json');
            const ciValidationPath = path.join(caseDir, 'ci-step-summary-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'closeout.md');
            const summaryJsonPath = path.join(caseDir, 'closeout.json');

            await writeJson(stagingFullSummaryPath, createSuccessfulStagingFullSummary());
            await writeJson(ciValidationPath, {
                schemaVersion: '1.0',
                status: 'SUCCESS',
                report: {
                    missingSections: [],
                },
            });

            const result = await runNodeScript(scriptFile, [
                `--staging-full-summary-file=${stagingFullSummaryPath}`,
                `--ci-step-summary-validation-file=${ciValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                '--ci-run-url=https://github.com/example/repo/actions/runs/123456789',
                '--ci-run-conclusion=SUCCESS',
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const summary = await readJson(summaryJsonPath);
            const markdown = await readFile(summaryMarkdownPath, 'utf-8');
            assert.equal(summary.status, 'SUCCESS');
            assert.equal(summary.releaseDecision, 'READY_TO_PROMOTE');
            assert.equal(summary.checklist?.stagingFullSummaryPassed, true);
            assert.equal(summary.checklist?.ciStepSummaryValidationPassed, true);
            assert.equal(summary.checklist?.ciRunUrlAttached, true);
            assert.equal(summary.ciEvidence?.runId, '123456789');
            assert.equal(summary.validationErrorCount, 0);
            assert.ok(markdown.includes('## Workflow Staging Drill Closeout'));
        });

        await runCase('closeout fails when ci run url is required but missing', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-ci-url');
            const stagingFullSummaryPath = path.join(caseDir, 'staging-full-summary.json');
            const ciValidationPath = path.join(caseDir, 'ci-step-summary-validation.json');
            const summaryMarkdownPath = path.join(caseDir, 'closeout.md');
            const summaryJsonPath = path.join(caseDir, 'closeout.json');

            await writeJson(stagingFullSummaryPath, createSuccessfulStagingFullSummary());
            await writeJson(ciValidationPath, {
                schemaVersion: '1.0',
                status: 'SUCCESS',
                report: {
                    missingSections: [],
                },
            });

            const result = await runNodeScript(scriptFile, [
                `--staging-full-summary-file=${stagingFullSummaryPath}`,
                `--ci-step-summary-validation-file=${ciValidationPath}`,
                `--summary-markdown-file=${summaryMarkdownPath}`,
                `--summary-json-file=${summaryJsonPath}`,
                '--require-ci-run-url',
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const summary = await readJson(summaryJsonPath);
            assert.equal(summary.status, 'FAILED');
            assert.equal(summary.releaseDecision, 'BLOCKED');
            assert.ok(
                summary.validationErrors.some((item) => item.includes('CI run URL is required')),
            );
        });

        process.stdout.write('\n[self-check] all workflow-staging-drill-closeout cases passed.\n');
    } catch (error) {
        shouldCleanup = false;
        process.stderr.write(`\n[self-check] failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.stderr.write(`[self-check] temp root preserved for debugging: ${tempRoot}\n`);
        process.exitCode = 1;
    } finally {
        if (shouldCleanup) {
            await rm(tempRoot, { recursive: true, force: true });
        }
    }
}

main();
