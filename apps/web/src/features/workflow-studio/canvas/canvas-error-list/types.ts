export type ChangeSummary = {
    addedNodeIds: string[];
    removedNodeIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
    updatedRuntimePolicyNodeIds: string[];
};

export type ChangeDetailViewMode = 'ALL' | 'ADDED' | 'REMOVED' | 'RUNTIME';
export type BatchActionScopeMode = 'ALL' | 'CURRENT_VIEW';
export type ChangeDetailSectionKey =
    | 'focus-node-added'
    | 'focus-node-removed'
    | 'focus-node-runtime'
    | 'focus-edge-added'
    | 'focus-edge-removed';

export interface ValidationError {
    message: string;
    nodeId?: string;
    edgeId?: string;
    severity?: 'ERROR' | 'WARNING';
}

export interface CanvasErrorListProps {
    errors: ValidationError[];
    onFocusNode?: (nodeId: string) => void;
    onFocusEdge?: (edgeId: string) => void;
    onAutoFix?: () => void;
    autoFixEnabled?: boolean;
    onStepAutoFix?: () => void;
    stepAutoFixLoading?: boolean;
    stepAutoFixEnabled?: boolean;
    stepAutoFixReport?: {
        generatedAt: string;
        finalIssueCount: number;
        steps: Array<{
            title: string;
            codes: string[];
            actions: string[];
            remainingIssueCount: number;
            changeSummary: ChangeSummary;
        }>;
    } | null;
    onClearStepAutoFixReport?: () => void;
    onPreviewAutoFix?: () => void;
    previewAutoFixLoading?: boolean;
    previewAutoFixEnabled?: boolean;
    autoFixPreview?: {
        actions: string[];
        remainingIssueCount: number;
        generatedAt: string;
        changeSummary: ChangeSummary;
    } | null;
    onClearAutoFixPreview?: () => void;
    autoFixCodeOptions?: string[];
    selectedAutoFixCodes?: string[];
    onSelectedAutoFixCodesChange?: (codes: string[]) => void;
    lastAutoFixActions?: string[];
    onClearAutoFixActions?: () => void;
}
