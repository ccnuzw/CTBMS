import { WorkflowRuntimeEventLevel } from '@packages/types';

export type WorkflowBindingEntity = {
    id: string;
    version: number;
} & Record<string, unknown>;

export type WorkflowBindingSnapshot = {
    workflowBindings?: {
        agentBindings?: string[];
        paramSetBindings?: string[];
        dataConnectorBindings?: string[];
    };
    resolvedBindings?: {
        agents?: WorkflowBindingEntity[];
        parameterSets?: WorkflowBindingEntity[];
        dataConnectors?: WorkflowBindingEntity[];
    };
    unresolvedBindings?: {
        agents?: string[];
        parameterSets?: string[];
        dataConnectors?: string[];
    };
};

export type RiskGateSummary = {
    summarySchemaVersion: string | null;
    riskLevel: string | null;
    passed: boolean | null;
    blocked: boolean | null;
    blockReason: string | null;
    degradeAction: string | null;
    blockers: string[];
    blockerCount: number | null;
    riskProfileCode: string | null;
    threshold: string | null;
    blockedByRiskLevel: boolean | null;
    hardBlock: boolean | null;
    riskEvaluatedAt: string | null;
};

export type RiskGateSummaryConsistency = {
    hasRiskGateNode: boolean;
    hasExecutionSummary: boolean;
    mismatchFields: string[];
};

export type WorkflowRuntimeTimelineRow = {
    id: string;
    eventType: string;
    level: WorkflowRuntimeEventLevel;
    message: string;
    occurredAt?: Date | string;
    nodeExecutionId?: string | null;
};
