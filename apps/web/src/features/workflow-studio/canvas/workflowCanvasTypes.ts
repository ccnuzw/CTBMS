import type { WorkflowDsl, WorkflowValidationResult } from '@packages/types';
import type { WorkflowDslChangeSummary } from './workflowDslChangeSummary';

export const WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY = 'ctbms.workflow-studio.view-level.v1';

export type WorkflowStudioViewLevel = 'business' | 'enhanced' | 'expert';
export type RuntimePreset = 'FAST' | 'BALANCED' | 'ROBUST';

export const runtimePresetPolicyMap: Record<
    RuntimePreset,
    {
        timeoutSeconds: number;
        retryCount: number;
        retryIntervalSeconds: number;
        onError: 'FAIL_FAST' | 'CONTINUE' | 'ROUTE_TO_ERROR';
    }
> = {
    FAST: { timeoutSeconds: 15, retryCount: 0, retryIntervalSeconds: 0, onError: 'FAIL_FAST' },
    BALANCED: { timeoutSeconds: 30, retryCount: 1, retryIntervalSeconds: 2, onError: 'CONTINUE' },
    ROBUST: {
        timeoutSeconds: 60,
        retryCount: 3,
        retryIntervalSeconds: 3,
        onError: 'ROUTE_TO_ERROR',
    },
};

export const AUTO_FIX_STEP_SEQUENCE: Array<{ title: string; codes: string[] }> = [
    { title: '结构连线修复', codes: ['WF003', 'WF004', 'WF005'] },
    { title: '编排骨架修复', codes: ['WF101', 'WF102'] },
    { title: '策略与风控修复', codes: ['WF106', 'WF104'] },
];

export type AutoFixPreviewState = {
    actions: string[];
    remainingIssueCount: number;
    generatedAt: string;
    changeSummary: WorkflowDslChangeSummary;
};

export type StepAutoFixReportStep = {
    title: string;
    codes: string[];
    actions: string[];
    remainingIssueCount: number;
    changeSummary: WorkflowDslChangeSummary;
};

export type StepAutoFixReportState = {
    generatedAt: string;
    finalIssueCount: number;
    steps: StepAutoFixReportStep[];
};

export interface WorkflowCanvasProps {
    initialDsl?: WorkflowDsl;
    onSave?: (dsl: WorkflowDsl) => void | Promise<void>;
    onValidate?: (
        dsl: WorkflowDsl,
        stage?: 'SAVE' | 'PUBLISH',
    ) => Promise<WorkflowValidationResult | undefined>;
    isReadOnly?: boolean;
    onRun?: (dsl: WorkflowDsl) => Promise<string | undefined>;
    currentVersionId?: string;
    currentDefinitionId?: string;
    viewLevel?: WorkflowStudioViewLevel;
    onViewLevelChange?: (level: WorkflowStudioViewLevel) => void;
    viewMode?: 'edit' | 'replay';
    executionData?: any;
}
