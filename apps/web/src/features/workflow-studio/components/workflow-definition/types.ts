import { Dayjs } from 'dayjs';
import {
    CreateWorkflowDefinitionDto,
    WorkflowDefinitionDto,
    WorkflowValidationResult,
    WorkflowVersionDto,
    WorkflowDsl,
    WorkflowNodeOnErrorPolicy,
} from '@packages/types';

export interface CreateWorkflowDefinitionFormValues extends CreateWorkflowDefinitionDto {
    starterTemplate?: 'QUICK_DECISION' | 'RISK_REVIEW' | 'DEBATE_ANALYSIS';
    defaultTimeoutMs?: number;
    defaultRetryCount?: number;
    defaultRetryBackoffMs?: number;
    defaultOnError?: WorkflowNodeOnErrorPolicy;
    defaultRulePackCode?: string;
    defaultAgentBindings?: string[];
    defaultParamSetBindings?: string[];
    defaultDataConnectorBindings?: string[];
}

export interface WorkflowDependencyGroup {
    rulePacks: string[];
    parameterSets: string[];
    agentProfiles: string[];
}

export interface WorkflowDependencyCheckResult {
    unpublished: WorkflowDependencyGroup;
    unavailable: WorkflowDependencyGroup;
}

export interface PublishDryRunPreview {
    generatedAt: Date;
    dependencyResult: WorkflowDependencyCheckResult;
    validationResult: WorkflowValidationResult | null;
    blockers: string[];
    readyToPublish: boolean;
}

export type DependencyLookupItem = {
    isActive?: boolean;
    version?: number | null;
};
