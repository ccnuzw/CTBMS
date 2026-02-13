#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SCHEMA_VERSION = '1.0';
const DEFAULT_STAGING_FULL_SUMMARY_FILE = 'logs/workflow-drill-staging-full-summary.json';
const DEFAULT_CI_STEP_SUMMARY_VALIDATION_FILE = 'logs/workflow-ci-step-summary-validation.json';
const DEFAULT_SUMMARY_MARKDOWN_FILE = 'logs/workflow-drill-staging-closeout.md';
const DEFAULT_SUMMARY_JSON_FILE = 'logs/workflow-drill-staging-closeout.json';

const args = process.argv.slice(2);

const readArgValue = (name, fallback = null) => {
    const matched = args.find((item) => item.startsWith(`${name}=`));
    if (!matched) {
        return fallback;
    }
    const value = matched.split('=').slice(1).join('=').trim();
    return value || fallback;
};

const hasFlag = (name) => args.includes(name);
const toAbsolutePath = (targetPath) => path.resolve(repoRoot, targetPath);

const readJsonFile = async (targetPath) => {
    try {
        const content = await readFile(targetPath, 'utf-8');
        return {
            exists: true,
            data: JSON.parse(content),
            error: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ENOENT/i.test(message)) {
            return {
                exists: false,
                data: null,
                error: null,
            };
        }
        return {
            exists: false,
            data: null,
            error: message,
        };
    }
};

const normalizeStatus = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : null);
const isSuccessStatus = (value) => normalizeStatus(value) === 'SUCCESS';

const deriveRunIdFromUrl = (value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }
    const matched = value.match(/\/runs\/(\d+)(?:\/|$)/);
    return matched ? matched[1] : null;
};

const resolveCiRunUrl = () => {
    const fromArg = readArgValue('--ci-run-url', null);
    if (fromArg) {
        return {
            runUrl: fromArg,
            source: 'ARGUMENT',
        };
    }

    const githubServerUrl = process.env.GITHUB_SERVER_URL;
    const githubRepository = process.env.GITHUB_REPOSITORY;
    const githubRunId = process.env.GITHUB_RUN_ID;
    if (githubServerUrl && githubRepository && githubRunId) {
        return {
            runUrl: `${githubServerUrl}/${githubRepository}/actions/runs/${githubRunId}`,
            source: 'ENVIRONMENT',
        };
    }

    return {
        runUrl: null,
        source: 'MISSING',
    };
};

async function main() {
    const stagingFullSummaryFile = readArgValue(
        '--staging-full-summary-file',
        DEFAULT_STAGING_FULL_SUMMARY_FILE,
    );
    const ciStepSummaryValidationFile = readArgValue(
        '--ci-step-summary-validation-file',
        DEFAULT_CI_STEP_SUMMARY_VALIDATION_FILE,
    );
    const summaryMarkdownFile = readArgValue('--summary-markdown-file', DEFAULT_SUMMARY_MARKDOWN_FILE);
    const summaryJsonFile = readArgValue('--summary-json-file', DEFAULT_SUMMARY_JSON_FILE);
    const requireCiRunUrl = hasFlag('--require-ci-run-url');
    const requireCiRunSuccess = hasFlag('--require-ci-run-success');

    const stagingFullSummaryAbsolutePath = toAbsolutePath(stagingFullSummaryFile);
    const ciStepSummaryValidationAbsolutePath = toAbsolutePath(ciStepSummaryValidationFile);
    const summaryMarkdownAbsolutePath = toAbsolutePath(summaryMarkdownFile);
    const summaryJsonAbsolutePath = toAbsolutePath(summaryJsonFile);

    const warnings = [];
    const validationErrors = [];

    const stagingFullSummaryResult = await readJsonFile(stagingFullSummaryAbsolutePath);
    const ciStepSummaryValidationResult = await readJsonFile(ciStepSummaryValidationAbsolutePath);

    if (stagingFullSummaryResult.error) {
        validationErrors.push(`staging full summary read failed: ${stagingFullSummaryResult.error}`);
    } else if (!stagingFullSummaryResult.exists) {
        validationErrors.push(`staging full summary missing: ${stagingFullSummaryAbsolutePath}`);
    }

    if (ciStepSummaryValidationResult.error) {
        validationErrors.push(`CI step summary validation read failed: ${ciStepSummaryValidationResult.error}`);
    } else if (!ciStepSummaryValidationResult.exists) {
        validationErrors.push(`CI step summary validation missing: ${ciStepSummaryValidationAbsolutePath}`);
    }

    const stagingFullStatus = stagingFullSummaryResult.exists
        ? normalizeStatus(stagingFullSummaryResult.data?.status) || 'UNKNOWN'
        : 'MISSING';
    const precheckStatus = normalizeStatus(stagingFullSummaryResult.data?.components?.precheckSummary?.status)
        || 'MISSING';
    const rollbackSmokeStatus = normalizeStatus(stagingFullSummaryResult.data?.components?.rollbackSmoke?.status)
        || 'MISSING';
    const rollbackBaselineReportStatus = normalizeStatus(
        stagingFullSummaryResult.data?.components?.rollbackBaselineReport?.status,
    ) || 'MISSING';
    const rollbackBaselineValidationStatus = normalizeStatus(
        stagingFullSummaryResult.data?.components?.rollbackBaselineValidation?.status,
    ) || 'MISSING';
    const rollbackBaselineTrendStatus = normalizeStatus(
        stagingFullSummaryResult.data?.components?.rollbackBaselineTrend?.status,
    ) || 'MISSING';
    const ciValidationStatus = ciStepSummaryValidationResult.exists
        ? normalizeStatus(ciStepSummaryValidationResult.data?.status) || 'UNKNOWN'
        : 'MISSING';
    const ciValidationMissingSections = Array.isArray(ciStepSummaryValidationResult.data?.report?.missingSections)
        ? ciStepSummaryValidationResult.data.report.missingSections
        : [];

    if (!isSuccessStatus(stagingFullStatus)) {
        validationErrors.push(`staging full summary status is ${stagingFullStatus}.`);
    }
    if (!isSuccessStatus(precheckStatus)) {
        validationErrors.push(`precheck summary status is ${precheckStatus}.`);
    }
    if (!isSuccessStatus(rollbackSmokeStatus)) {
        validationErrors.push(`rollback smoke status is ${rollbackSmokeStatus}.`);
    }
    if (!isSuccessStatus(rollbackBaselineReportStatus)) {
        validationErrors.push(`rollback baseline report status is ${rollbackBaselineReportStatus}.`);
    }
    if (!isSuccessStatus(rollbackBaselineValidationStatus)) {
        validationErrors.push(
            `rollback baseline validation status is ${rollbackBaselineValidationStatus}.`,
        );
    }
    if (!isSuccessStatus(rollbackBaselineTrendStatus)) {
        validationErrors.push(`rollback baseline trend status is ${rollbackBaselineTrendStatus}.`);
    }
    if (!isSuccessStatus(ciValidationStatus)) {
        validationErrors.push(`CI step summary validation status is ${ciValidationStatus}.`);
    }
    if (ciValidationMissingSections.length > 0) {
        validationErrors.push(
            `CI step summary validation missing sections: ${ciValidationMissingSections.join(' | ')}`,
        );
    }

    const ciRunUrlInfo = resolveCiRunUrl();
    const ciRunUrl = ciRunUrlInfo.runUrl;
    const ciRunId = readArgValue('--ci-run-id', null)
        || process.env.GITHUB_RUN_ID
        || deriveRunIdFromUrl(ciRunUrl);
    const ciRunAttempt = readArgValue('--ci-run-attempt', null)
        || process.env.GITHUB_RUN_ATTEMPT
        || null;
    const ciRunConclusion = readArgValue('--ci-run-conclusion', null)
        || process.env.GITHUB_WORKFLOW_CONCLUSION
        || null;
    const ciRunAt = readArgValue('--ci-run-at', null) || null;

    if (!ciRunUrl) {
        warnings.push('CI run URL missing. Add --ci-run-url for final release closeout evidence.');
    }
    if (requireCiRunUrl && !ciRunUrl) {
        validationErrors.push('CI run URL is required by --require-ci-run-url.');
    }

    const ciRunSuccess = isSuccessStatus(ciRunConclusion) || normalizeStatus(ciRunConclusion) === 'PASSED';
    if (requireCiRunSuccess) {
        if (!ciRunConclusion) {
            validationErrors.push('CI run conclusion is required by --require-ci-run-success.');
        } else if (!ciRunSuccess) {
            validationErrors.push(`CI run conclusion must be SUCCESS/PASSED, got ${ciRunConclusion}.`);
        }
    } else if (ciRunConclusion && !ciRunSuccess) {
        warnings.push(`CI run conclusion is ${ciRunConclusion}; verify this is expected.`);
    }

    const checklist = {
        stagingFullSummaryPassed: isSuccessStatus(stagingFullStatus),
        precheckPassed: isSuccessStatus(precheckStatus),
        rollbackSmokePassed: isSuccessStatus(rollbackSmokeStatus),
        rollbackBaselineReportPassed: isSuccessStatus(rollbackBaselineReportStatus),
        rollbackBaselineValidationPassed: isSuccessStatus(rollbackBaselineValidationStatus),
        rollbackBaselineTrendPassed: isSuccessStatus(rollbackBaselineTrendStatus),
        ciStepSummaryValidationPassed: isSuccessStatus(ciValidationStatus)
            && ciValidationMissingSections.length === 0,
        ciRunUrlAttached: Boolean(ciRunUrl),
        ciRunPassed: ciRunConclusion ? ciRunSuccess : null,
    };

    const status = validationErrors.length > 0 ? 'FAILED' : 'SUCCESS';
    const releaseDecision = status === 'SUCCESS' ? 'READY_TO_PROMOTE' : 'BLOCKED';

    const summary = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        status,
        releaseDecision,
        inputs: {
            stagingFullSummaryFile,
            ciStepSummaryValidationFile,
            summaryMarkdownFile,
            summaryJsonFile,
            requireCiRunUrl,
            requireCiRunSuccess,
        },
        checklist,
        components: {
            stagingFullSummary: {
                exists: stagingFullSummaryResult.exists,
                status: stagingFullStatus,
            },
            precheckSummary: {
                status: precheckStatus,
            },
            rollbackSmoke: {
                status: rollbackSmokeStatus,
            },
            rollbackBaselineReport: {
                status: rollbackBaselineReportStatus,
            },
            rollbackBaselineValidation: {
                status: rollbackBaselineValidationStatus,
            },
            rollbackBaselineTrend: {
                status: rollbackBaselineTrendStatus,
            },
            ciStepSummaryValidation: {
                exists: ciStepSummaryValidationResult.exists,
                status: ciValidationStatus,
                missingSections: ciValidationMissingSections,
            },
        },
        ciEvidence: {
            runUrl: ciRunUrl,
            runUrlSource: ciRunUrlInfo.source,
            runId: ciRunId,
            runAttempt: ciRunAttempt,
            runConclusion: ciRunConclusion,
            runAt: ciRunAt,
        },
        warningCount: warnings.length,
        validationErrorCount: validationErrors.length,
        warnings,
        validationErrors,
    };

    const markdownBlocks = [
        '## Workflow Staging Drill Closeout',
        '',
        `- Status: \`${status}\``,
        `- Release Decision: \`${releaseDecision}\``,
        `- Generated At: \`${summary.generatedAt}\``,
        `- Staging Full Summary: \`${stagingFullStatus}\``,
        `- Precheck Summary: \`${precheckStatus}\``,
        `- Rollback Smoke: \`${rollbackSmokeStatus}\``,
        `- Rollback Baseline Report: \`${rollbackBaselineReportStatus}\``,
        `- Rollback Baseline Validation: \`${rollbackBaselineValidationStatus}\``,
        `- Rollback Baseline Trend: \`${rollbackBaselineTrendStatus}\``,
        `- CI Step Summary Validation: \`${ciValidationStatus}\``,
        `- CI Validation Missing Sections: \`${ciValidationMissingSections.length}\``,
        `- CI Run URL: \`${ciRunUrl || 'N/A'}\``,
        `- CI Run ID: \`${ciRunId || 'N/A'}\``,
        `- CI Run Attempt: \`${ciRunAttempt || 'N/A'}\``,
        `- CI Run Conclusion: \`${ciRunConclusion || 'N/A'}\``,
        `- Validation Error Count: \`${validationErrors.length}\``,
        `- Warning Count: \`${warnings.length}\``,
    ];

    if (validationErrors.length > 0) {
        markdownBlocks.push('');
        markdownBlocks.push('### Validation Errors');
        markdownBlocks.push('');
        for (const item of validationErrors.slice(0, 8)) {
            markdownBlocks.push(`- ${item}`);
        }
    }

    if (warnings.length > 0) {
        markdownBlocks.push('');
        markdownBlocks.push('### Warnings');
        markdownBlocks.push('');
        for (const item of warnings.slice(0, 5)) {
            markdownBlocks.push(`- ${item}`);
        }
    }

    markdownBlocks.push('');
    markdownBlocks.push('### Evidence Files');
    markdownBlocks.push('');
    markdownBlocks.push(`- staging full summary: \`${stagingFullSummaryFile}\``);
    markdownBlocks.push(`- CI step summary validation: \`${ciStepSummaryValidationFile}\``);
    markdownBlocks.push(`- closeout markdown: \`${summaryMarkdownFile}\``);
    markdownBlocks.push(`- closeout json: \`${summaryJsonFile}\``);

    await mkdir(path.dirname(summaryJsonAbsolutePath), { recursive: true });
    await writeFile(summaryJsonAbsolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

    await mkdir(path.dirname(summaryMarkdownAbsolutePath), { recursive: true });
    await writeFile(summaryMarkdownAbsolutePath, `${markdownBlocks.join('\n')}\n`, 'utf-8');

    process.stdout.write(
        `[workflow-staging-drill-closeout] status=${status} decision=${releaseDecision} warnings=${warnings.length} errors=${validationErrors.length} markdown=${summaryMarkdownAbsolutePath} summary=${summaryJsonAbsolutePath}\n`,
    );

    if (status === 'FAILED') {
        process.stderr.write(`[workflow-staging-drill-closeout] failed: ${validationErrors.join(' | ')}\n`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[workflow-staging-drill-closeout] fatal: ${message}\n`);
    process.exitCode = 1;
});
