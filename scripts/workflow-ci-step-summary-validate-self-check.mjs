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
const validateScript = path.resolve(repoRoot, 'scripts/workflow-ci-step-summary-validate.mjs');

const DEFAULT_REQUIRED_SECTIONS = [
    '## Workflow Quick Locate Index',
    '## Workflow Quality Gate',
    '## Workflow Quality Gate Report Validation',
    '## Workflow Execution Baseline',
    '## Workflow Execution Baseline Validation',
    '## Workflow Execution Baseline Reference Operation',
    '## Workflow Execution Baseline Trend',
    '## Workflow Summary Self-Check Suite',
    '## Workflow Summary Self-Check Report Validation',
    '## Workflow Staging Drill Closeout',
];

const runNodeScript = (scriptFile, scriptArgs) => new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptFile, ...scriptArgs], {
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

const readJsonFile = async (targetPath) => JSON.parse(await readFile(targetPath, 'utf-8'));

const runCase = async (name, handler) => {
    process.stdout.write(`\n[self-check] case: ${name}\n`);
    await handler();
    process.stdout.write(`[self-check] case passed: ${name}\n`);
};

async function main() {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'workflow-ci-step-summary-validate-self-check-'));
    const keepTemp = process.env.KEEP_WORKFLOW_SELF_CHECK_TEMP === '1';
    let shouldCleanup = !keepTemp;
    process.stdout.write(`[self-check] temp root: ${tempRoot}\n`);

    try {
        await runCase('validation success when all required sections exist', async () => {
            const caseDir = path.join(tempRoot, 'case-success');
            await mkdir(caseDir, { recursive: true });
            const summaryFile = path.join(caseDir, 'workflow-ci-step-summary.md');
            const summaryJsonFile = path.join(caseDir, 'workflow-ci-step-summary-validation.json');

            const markdown = DEFAULT_REQUIRED_SECTIONS.map((section, index) => `${section}\n\n- line ${index + 1}`).join('\n\n');
            await writeFile(summaryFile, `${markdown}\n`, 'utf-8');

            const result = await runNodeScript(validateScript, [
                `--summary-file=${summaryFile}`,
                `--summary-json-file=${summaryJsonFile}`,
            ]);
            assert.equal(result.exitCode, 0, result.output);

            const validation = await readJsonFile(summaryJsonFile);
            assert.equal(validation.status, 'SUCCESS');
            assert.equal(validation.validationErrorCount, 0);
            assert.equal(validation.report.summaryFileExists, true);
            assert.equal(validation.report.missingSections.length, 0);
            assert.equal(validation.report.foundSections.length, DEFAULT_REQUIRED_SECTIONS.length);
        });

        await runCase('validation failure still writes json when section missing', async () => {
            const caseDir = path.join(tempRoot, 'case-missing-sections');
            await mkdir(caseDir, { recursive: true });
            const summaryFile = path.join(caseDir, 'workflow-ci-step-summary.md');
            const summaryJsonFile = path.join(caseDir, 'workflow-ci-step-summary-validation.json');

            const markdown = [
                '## Workflow Quick Locate Index',
                '## Workflow Quality Gate',
                '## Workflow Quality Gate Report Validation',
                '## Workflow Execution Baseline',
            ].join('\n\n');
            await writeFile(summaryFile, `${markdown}\n`, 'utf-8');

            const result = await runNodeScript(validateScript, [
                `--summary-file=${summaryFile}`,
                `--summary-json-file=${summaryJsonFile}`,
            ]);
            assert.equal(result.exitCode, 1, result.output);

            const validation = await readJsonFile(summaryJsonFile);
            assert.equal(validation.status, 'FAILED');
            assert.ok(validation.validationErrorCount > 0);
            assert.ok(validation.report.missingSections.includes('## Workflow Execution Baseline Trend'));
            assert.ok(validation.report.missingSections.includes('## Workflow Summary Self-Check Suite'));
        });

        process.stdout.write('\n[self-check] all workflow-ci-step-summary-validate cases passed.\n');
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
