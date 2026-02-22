import {
    WorkflowMode,
    WorkflowUsageMethod,
    WorkflowDefinitionStatus,
    WorkflowNodeOnErrorPolicy,
} from '@packages/types';
import { CreateWorkflowDefinitionFormValues } from './types';

export const modeOptions: { label: string; value: WorkflowMode }[] = [
    { label: '线性', value: 'LINEAR' },
    { label: '并行', value: 'DAG' },
    { label: '辩论', value: 'DEBATE' },
];

export const usageMethodOptions: { label: string; value: WorkflowUsageMethod }[] = [
    { label: '后台自动', value: 'HEADLESS' },
    { label: '人机协同', value: 'COPILOT' },
    { label: '按需触发', value: 'ON_DEMAND' },
];

export const starterTemplateOptions: {
    label: string;
    value: NonNullable<CreateWorkflowDefinitionFormValues['starterTemplate']>;
    description: string;
}[] = [
        {
            label: '快速决策（推荐）',
            value: 'QUICK_DECISION',
            description: '手工触发 -> 规则评估 -> 风险闸门 -> 结果输出',
        },
        {
            label: '风控评审',
            value: 'RISK_REVIEW',
            description: '增加数据采集节点，适合规则和风控校验流程',
        },
        {
            label: '多智能体辩论',
            value: 'DEBATE_ANALYSIS',
            description: '上下文构建 -> 辩论 -> 裁判输出 -> 风险闸门',
        },
    ];

export const runtimeOnErrorOptions: { label: string; value: WorkflowNodeOnErrorPolicy }[] = [
    { label: '失败即中断 (FAIL_FAST)', value: 'FAIL_FAST' },
    { label: '失败后继续 (CONTINUE)', value: 'CONTINUE' },
    { label: '失败路由错误分支 (ROUTE_TO_ERROR)', value: 'ROUTE_TO_ERROR' },
];

export const definitionStatusColorMap: Record<string, string> = {
    DRAFT: 'default',
    ACTIVE: 'green',
    ARCHIVED: 'red',
};

export const versionStatusColorMap: Record<string, string> = {
    DRAFT: 'default',
    PUBLISHED: 'green',
    ARCHIVED: 'orange',
};

export const definitionStatusOptions: { label: string; value: WorkflowDefinitionStatus }[] = [
    { label: '草稿', value: 'DRAFT' },
    { label: '启用', value: 'ACTIVE' },
    { label: '归档', value: 'ARCHIVED' },
];

export const workflowModeLabelMap: Record<WorkflowMode, string> = {
    LINEAR: '线性',
    DAG: '并行',
    DEBATE: '辩论',
};

export const workflowUsageMethodLabelMap: Record<WorkflowUsageMethod, string> = {
    HEADLESS: '后台自动',
    COPILOT: '人机协同',
    ON_DEMAND: '按需触发',
};

export const workflowDefinitionStatusLabelMap: Record<WorkflowDefinitionStatus, string> = {
    DRAFT: '草稿',
    ACTIVE: '启用',
    ARCHIVED: '归档',
};

export const workflowVersionStatusLabelMap: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '归档',
};

export const workflowPublishOperationLabelMap: Record<string, string> = {
    PUBLISH: '发布',
};
