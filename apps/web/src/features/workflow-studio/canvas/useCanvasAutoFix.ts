import { useCallback, useEffect, useMemo, useState } from 'react';
import { message, notification } from 'antd';
import {
    canonicalizeWorkflowDsl,
    type WorkflowDsl,
} from '@packages/types';
import { type ValidationError } from './CanvasErrorList';
import {
    applyAutoFixesToDsl,
    extractIssueCode,
    getAutoFixableIssueCodes,
    hasAutoFixableIssues,
} from './workflowAutoFix';
import {
    summarizeWorkflowDslChange,
} from './workflowDslChangeSummary';
import {
    AUTO_FIX_STEP_SEQUENCE,
    type AutoFixPreviewState,
    type StepAutoFixReportStep,
    type StepAutoFixReportState,
} from './workflowCanvasTypes';
import type { Node, Edge } from '@xyflow/react';

export interface UseCanvasAutoFixParams {
    nodes: Node[];
    edges: Edge[];
    workflowMode: 'linear' | 'dag' | 'debate';
    buildCurrentDsl: () => WorkflowDsl;
    runValidation: (dsl: WorkflowDsl) => Promise<ValidationError[]>;
    loadDsl: (dsl: WorkflowDsl) => void;
    validationErrors: ValidationError[];
    setValidationErrors: (errors: ValidationError[]) => void;
}

/**
 * 自动修复相关逻辑（预览/一键修复/分步修复）
 */
export function useCanvasAutoFix({
    nodes,
    edges,
    workflowMode,
    buildCurrentDsl,
    runValidation,
    loadDsl,
    validationErrors,
    setValidationErrors,
}: UseCanvasAutoFixParams) {
    const [autoFixPreview, setAutoFixPreview] = useState<AutoFixPreviewState | null>(null);
    const [previewAutoFixLoading, setPreviewAutoFixLoading] = useState(false);
    const [lastAutoFixActions, setLastAutoFixActions] = useState<string[]>([]);
    const [selectedAutoFixCodes, setSelectedAutoFixCodes] = useState<string[]>([]);
    const [stepAutoFixLoading, setStepAutoFixLoading] = useState(false);
    const [stepAutoFixReport, setStepAutoFixReport] = useState<StepAutoFixReportState | null>(null);

    const autoFixableIssueCodes = useMemo(
        () => getAutoFixableIssueCodes(validationErrors),
        [validationErrors],
    );

    useEffect(() => {
        setSelectedAutoFixCodes((prev) => {
            const kept = prev.filter((code) => autoFixableIssueCodes.includes(code));
            if (kept.length > 0) return kept;
            return autoFixableIssueCodes;
        });
    }, [autoFixableIssueCodes]);

    const selectedAutoFixIssues = useMemo(() => {
        if (selectedAutoFixCodes.length === 0) return [];
        const selectedCodeSet = new Set(selectedAutoFixCodes);
        return validationErrors.filter((item) => {
            const code = extractIssueCode(item.message);
            return Boolean(code && selectedCodeSet.has(code));
        });
    }, [validationErrors, selectedAutoFixCodes]);

    // Reset preview when relevant state changes
    useEffect(() => {
        setAutoFixPreview(null);
    }, [nodes, edges, workflowMode, selectedAutoFixCodes]);

    const handleAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixIssues.length === 0) {
            message.info('请先选择要修复的问题类型');
            return;
        }
        const dsl = buildCurrentDsl();
        const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(dsl, selectedAutoFixIssues, selectedAutoFixCodes);
        if (actions.length === 0) {
            setStepAutoFixReport(null);
            setAutoFixPreview(null);
            setLastAutoFixActions([]);
            message.info('当前问题暂不支持自动修复，请根据提示手动处理');
            return;
        }
        setStepAutoFixReport(null);
        setAutoFixPreview(null);
        setLastAutoFixActions(actions);
        const canonicalFixedDsl = canonicalizeWorkflowDsl(fixedDsl);
        const changeSummary = summarizeWorkflowDslChange(dsl, canonicalFixedDsl);
        loadDsl(canonicalFixedDsl);
        message.success(`已自动修复 ${actions.length} 项问题`);

        let descriptionText = `节点 +${changeSummary.addedNodeIds.length} / -${changeSummary.removedNodeIds.length}，`;
        descriptionText += `连线 +${changeSummary.addedEdgeIds.length} / -${changeSummary.removedEdgeIds.length}，`;
        descriptionText += `策略更新 ${changeSummary.updatedRuntimePolicyNodeIds.length}。\n`;
        descriptionText += actions.map((a, i) => `${i + 1}. ${a}`).join('\n');

        notification.success({
            message: `自动修复明细（${actions.length} 项）`,
            duration: 5,
            description: descriptionText,
            style: { whiteSpace: 'pre-wrap' },
        });
        const nextErrors = await runValidation(canonicalFixedDsl);
        setValidationErrors(nextErrors);
    }, [buildCurrentDsl, loadDsl, runValidation, selectedAutoFixIssues, selectedAutoFixCodes, setValidationErrors]);

    const handlePreviewAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixIssues.length === 0) {
            message.info('请先选择要预览修复的问题类型');
            return;
        }
        const dsl = buildCurrentDsl();
        const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(dsl, selectedAutoFixIssues, selectedAutoFixCodes);
        if (actions.length === 0) {
            setStepAutoFixReport(null);
            setAutoFixPreview(null);
            message.info('当前问题暂不支持预览修复');
            return;
        }
        setStepAutoFixReport(null);
        setPreviewAutoFixLoading(true);
        try {
            const canonicalFixedDsl = canonicalizeWorkflowDsl(fixedDsl);
            const nextErrors = await runValidation(canonicalFixedDsl);
            const changeSummary = summarizeWorkflowDslChange(dsl, canonicalFixedDsl);
            setAutoFixPreview({
                actions,
                remainingIssueCount: nextErrors.length,
                generatedAt: new Date().toLocaleString(),
                changeSummary,
            });
            message.success('已生成修复预览');
        } finally {
            setPreviewAutoFixLoading(false);
        }
    }, [buildCurrentDsl, runValidation, selectedAutoFixIssues, selectedAutoFixCodes]);

    const handleStepAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixCodes.length === 0) {
            message.info('请先选择要分步修复的问题类型');
            return;
        }
        setStepAutoFixLoading(true);
        try {
            let workingDsl = buildCurrentDsl();
            let workingErrors = validationErrors;
            const stepReports: StepAutoFixReportStep[] = [];

            for (const step of AUTO_FIX_STEP_SEQUENCE) {
                const stepCodes = step.codes.filter((code) => selectedAutoFixCodes.includes(code));
                if (stepCodes.length === 0) continue;
                const stepCodeSet = new Set(stepCodes);
                const stepIssues = workingErrors.filter((issue) => {
                    const code = extractIssueCode(issue.message);
                    return Boolean(code && stepCodeSet.has(code));
                });
                if (stepIssues.length === 0) continue;

                const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(workingDsl, stepIssues, stepCodes);
                if (actions.length === 0) continue;

                const canonicalFixedDsl = canonicalizeWorkflowDsl(fixedDsl);
                const nextErrors = await runValidation(canonicalFixedDsl);
                const changeSummary = summarizeWorkflowDslChange(workingDsl, canonicalFixedDsl);
                workingDsl = canonicalFixedDsl;
                workingErrors = nextErrors;

                stepReports.push({
                    title: step.title,
                    codes: stepCodes,
                    actions,
                    remainingIssueCount: nextErrors.length,
                    changeSummary,
                });
            }

            if (stepReports.length === 0) {
                setStepAutoFixReport(null);
                setAutoFixPreview(null);
                message.info('所选问题暂无可执行的分步修复');
                return;
            }

            loadDsl(workingDsl);
            setValidationErrors(workingErrors);
            setAutoFixPreview(null);
            const mergedActions = stepReports.flatMap((item) => item.actions);
            setLastAutoFixActions(mergedActions);
            setStepAutoFixReport({
                generatedAt: new Date().toLocaleString(),
                finalIssueCount: workingErrors.length,
                steps: stepReports,
            });
            message.success(`分步修复完成，共执行 ${stepReports.length} 步`);

            const descriptionText = stepReports.map((item, index) =>
                `${index + 1}. ${item.title}，执行 ${item.actions.length} 项，剩余 ${item.remainingIssueCount} 项`
            ).join('\n');

            notification.success({
                message: `分步修复报告（${stepReports.length} 步）`,
                duration: 6,
                description: descriptionText,
                style: { whiteSpace: 'pre-wrap' },
            });
        } finally {
            setStepAutoFixLoading(false);
        }
    }, [buildCurrentDsl, loadDsl, runValidation, selectedAutoFixCodes, validationErrors, setValidationErrors]);

    return {
        state: {
            autoFixPreview,
            previewAutoFixLoading,
            lastAutoFixActions,
            selectedAutoFixCodes,
            stepAutoFixLoading,
            stepAutoFixReport,
        },
        computed: {
            hasAutoFixable: hasAutoFixableIssues(selectedAutoFixIssues),
            autoFixableIssueCodes,
        },
        setters: {
            setSelectedAutoFixCodes,
            setStepAutoFixReport,
            setAutoFixPreview,
            setLastAutoFixActions,
        },
        actions: {
            handleAutoFixValidationIssues,
            handlePreviewAutoFixValidationIssues,
            handleStepAutoFixValidationIssues,
        },
    };
}
