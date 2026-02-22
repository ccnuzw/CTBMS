import { WorkflowDsl, WorkflowNodeOnErrorPolicy } from '@packages/types';
import {
    CreateWorkflowDefinitionFormValues,
    DependencyLookupItem,
    WorkflowDependencyCheckResult,
    WorkflowDependencyGroup,
} from './types';
import { workflowVersionStatusLabelMap, workflowPublishOperationLabelMap } from './constants';

export const normalizeBindingValues = (value?: string[] | null): string[] | undefined => {
    if (!value || !Array.isArray(value)) {
        return undefined;
    }
    const list = value
        .map((item) => item.trim())
        .filter(Boolean);
    if (list.length === 0) {
        return undefined;
    }
    return [...new Set(list)];
};

export const slugifyWorkflowId = (name?: string): string => {
    const normalized = (name || '')
        .trim()
        .toLowerCase()
        .replace(/[\s/\\]+/g, '_')
        .replace(/[^\w-]+/g, '')
        .replace(/_+/g, '_')
        .replace(/^-+|-+$/g, '');
    if (!normalized) {
        return '';
    }
    return normalized.startsWith('wf_') ? normalized : `wf_${normalized}`;
};

export const getWorkflowVersionStatusLabel = (status?: string | null): string => {
    if (!status) {
        return '-';
    }
    return workflowVersionStatusLabelMap[status] || status;
};

export const getWorkflowPublishOperationLabel = (operation?: string | null): string => {
    if (!operation) {
        return '-';
    }
    return workflowPublishOperationLabelMap[operation] || operation;
};

export const buildInitialDslSnapshot = (
    values: CreateWorkflowDefinitionFormValues,
    runtimePolicy: {
        timeoutMs: number;
        retryCount: number;
        retryBackoffMs: number;
        onError: WorkflowNodeOnErrorPolicy;
    },
): WorkflowDsl => {
    const normalizedRulePackCode = values.defaultRulePackCode?.trim();
    const agentBindings = normalizeBindingValues(values.defaultAgentBindings);
    const paramSetBindings = normalizeBindingValues(values.defaultParamSetBindings);
    const dataConnectorBindings = normalizeBindingValues(values.defaultDataConnectorBindings);
    const starterTemplate = values.starterTemplate ?? 'QUICK_DECISION';
    const hasRulePackNode = Boolean(normalizedRulePackCode);
    const riskProfileCode = 'CORN_RISK_BASE';
    let nodes: WorkflowDsl['nodes'] = [];
    let edges: WorkflowDsl['edges'] = [];

    if (starterTemplate === 'DEBATE_ANALYSIS') {
        nodes = [
            { id: 'n_trigger', type: 'manual-trigger', name: '手工触发', enabled: true, config: {}, runtimePolicy },
            { id: 'n_context', type: 'context-builder', name: '上下文构建', enabled: true, config: {}, runtimePolicy },
            { id: 'n_debate', type: 'debate-round', name: '辩论回合', enabled: true, config: { maxRounds: 3, judgePolicy: 'WEIGHTED' }, runtimePolicy },
            { id: 'n_judge', type: 'judge-agent', name: '裁判输出', enabled: true, config: { agentProfileCode: agentBindings?.[0] || undefined }, runtimePolicy },
            { id: 'n_risk_gate', type: 'risk-gate', name: '风险闸门', enabled: true, config: { riskProfileCode, degradeAction: 'HOLD' }, runtimePolicy },
            { id: 'n_notify', type: 'notify', name: '结果输出', enabled: true, config: { channels: ['DASHBOARD'] }, runtimePolicy },
        ];
        edges = [
            { id: 'e_trigger_context', from: 'n_trigger', to: 'n_context', edgeType: 'control-edge' },
            { id: 'e_context_debate', from: 'n_context', to: 'n_debate', edgeType: 'data-edge' },
            { id: 'e_debate_judge', from: 'n_debate', to: 'n_judge', edgeType: 'data-edge' },
            { id: 'e_judge_risk', from: 'n_judge', to: 'n_risk_gate', edgeType: 'control-edge' },
            { id: 'e_risk_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
        ];
    } else if (starterTemplate === 'RISK_REVIEW') {
        nodes = [
            { id: 'n_trigger', type: 'manual-trigger', name: '手工触发', enabled: true, config: {}, runtimePolicy },
            { id: 'n_fetch_data', type: 'data-fetch', name: '数据采集', enabled: true, config: { dataSourceCode: dataConnectorBindings?.[0] || '', lookbackDays: 7 }, runtimePolicy },
            ...(hasRulePackNode ? [{ id: 'n_rule_pack', type: 'rule-pack-eval', name: '规则包评估', enabled: true, config: { rulePackCode: normalizedRulePackCode, ruleVersionPolicy: 'LOCKED', minHitScore: 60 }, runtimePolicy }] : []),
            { id: 'n_risk_gate', type: 'risk-gate', name: '风险闸门', enabled: true, config: { riskProfileCode, degradeAction: 'HOLD' }, runtimePolicy },
            { id: 'n_notify', type: 'notify', name: '结果输出', enabled: true, config: { channels: ['DASHBOARD'] }, runtimePolicy },
        ];
        edges = hasRulePackNode
            ? [
                { id: 'e_trigger_fetch', from: 'n_trigger', to: 'n_fetch_data', edgeType: 'control-edge' },
                { id: 'e_fetch_rule_pack', from: 'n_fetch_data', to: 'n_rule_pack', edgeType: 'data-edge' },
                { id: 'e_rule_pack_risk_gate', from: 'n_rule_pack', to: 'n_risk_gate', edgeType: 'control-edge' },
                { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
            ]
            : [
                { id: 'e_trigger_fetch', from: 'n_trigger', to: 'n_fetch_data', edgeType: 'control-edge' },
                { id: 'e_fetch_risk_gate', from: 'n_fetch_data', to: 'n_risk_gate', edgeType: 'data-edge' },
                { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
            ];
    } else {
        nodes = [
            { id: 'n_trigger', type: 'manual-trigger', name: '手工触发', enabled: true, config: {}, runtimePolicy },
            ...(hasRulePackNode ? [{ id: 'n_rule_pack', type: 'rule-pack-eval', name: '规则包评估', enabled: true, config: { rulePackCode: normalizedRulePackCode, ruleVersionPolicy: 'LOCKED', minHitScore: 60 }, runtimePolicy }] : []),
            { id: 'n_risk_gate', type: 'risk-gate', name: '风险闸门', enabled: true, config: { riskProfileCode, degradeAction: 'HOLD' }, runtimePolicy },
            { id: 'n_notify', type: 'notify', name: '结果输出', enabled: true, config: { channels: ['DASHBOARD'] }, runtimePolicy },
        ];
        edges = hasRulePackNode
            ? [
                { id: 'e_trigger_rule_pack', from: 'n_trigger', to: 'n_rule_pack', edgeType: 'control-edge' },
                { id: 'e_rule_pack_risk_gate', from: 'n_rule_pack', to: 'n_risk_gate', edgeType: 'control-edge' },
                { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
            ]
            : [
                { id: 'e_trigger_risk_gate', from: 'n_trigger', to: 'n_risk_gate', edgeType: 'control-edge' },
                { id: 'e_risk_gate_notify', from: 'n_risk_gate', to: 'n_notify', edgeType: 'control-edge' },
            ];
    }

    return {
        workflowId: values.workflowId,
        name: values.name,
        mode: values.mode,
        usageMethod: values.usageMethod,
        version: '1.0.0',
        status: 'DRAFT',
        templateSource: 'PRIVATE',
        nodes,
        edges,
        runPolicy: {
            nodeDefaults: runtimePolicy,
        },
        agentBindings,
        paramSetBindings,
        dataConnectorBindings,
    };
};

export const isPublished = (version?: number): boolean =>
    Number.isInteger(version) && Number(version) >= 2;

export const readBindingCodes = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    const deduped = new Set<string>();
    for (const item of value) {
        if (typeof item !== 'string') {
            continue;
        }
        const normalized = item.trim();
        if (!normalized) {
            continue;
        }
        deduped.add(normalized);
    }
    return [...deduped];
};

export const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

export const extractRulePackCodesFromDsl = (dslSnapshot: WorkflowDsl): string[] => {
    const ruleNodeTypes = new Set(['rule-pack-eval', 'rule-eval', 'alert-check']);
    const deduped = new Set<string>();
    for (const node of dslSnapshot.nodes) {
        if (!ruleNodeTypes.has(node.type)) {
            continue;
        }
        const config = asRecord(node.config);
        const rawCode = config?.rulePackCode;
        if (typeof rawCode !== 'string') {
            continue;
        }
        const normalized = rawCode.trim();
        if (normalized) {
            deduped.add(normalized);
        }
    }
    return [...deduped];
};

export const extractAgentCodesFromDsl = (dslSnapshot: WorkflowDsl): string[] => {
    const deduped = new Set(readBindingCodes(dslSnapshot.agentBindings));
    const agentNodeTypes = new Set(['single-agent', 'agent-call', 'agent-group', 'judge-agent']);
    for (const node of dslSnapshot.nodes) {
        if (!agentNodeTypes.has(node.type)) {
            continue;
        }
        const config = asRecord(node.config);
        const rawCode = config?.agentProfileCode;
        if (typeof rawCode !== 'string') {
            continue;
        }
        const normalized = rawCode.trim();
        if (normalized) {
            deduped.add(normalized);
        }
    }
    return [...deduped];
};

export const extractParameterSetCodesFromDsl = (dslSnapshot: WorkflowDsl): string[] =>
    readBindingCodes(dslSnapshot.paramSetBindings);

export const hasDependencyIssues = (group: WorkflowDependencyGroup): boolean =>
    group.rulePacks.length > 0 || group.parameterSets.length > 0 || group.agentProfiles.length > 0;

export const countDependencyIssues = (group: WorkflowDependencyGroup): number =>
    group.rulePacks.length + group.parameterSets.length + group.agentProfiles.length;

export const hasBlockingDependencyIssues = (
    result?: WorkflowDependencyCheckResult | null,
): boolean =>
    Boolean(
        result &&
        (hasDependencyIssues(result.unpublished) || hasDependencyIssues(result.unavailable)),
    );

export const classifyDependencyCodes = (
    codes: string[],
    lookup: Map<string, DependencyLookupItem>,
): { unpublished: string[]; unavailable: string[] } => {
    const unpublished: string[] = [];
    const unavailable: string[] = [];
    for (const code of codes) {
        const item = lookup.get(code);
        if (!item || !item.isActive) {
            unavailable.push(code);
            continue;
        }
        if (!isPublished(item.version ?? undefined)) {
            unpublished.push(code);
        }
    }
    return { unpublished, unavailable };
};

export const checkPublishDependenciesByLookups = (
    dslSnapshot: WorkflowDsl,
    lookups: {
        rulePacks: Map<string, DependencyLookupItem>;
        parameterSets: Map<string, DependencyLookupItem>;
        agentProfiles: Map<string, DependencyLookupItem>;
    },
): WorkflowDependencyCheckResult => {
    const rulePackCodes = extractRulePackCodesFromDsl(dslSnapshot);
    const parameterSetCodes = extractParameterSetCodesFromDsl(dslSnapshot);
    const agentCodes = extractAgentCodesFromDsl(dslSnapshot);

    const rulePackCheck = classifyDependencyCodes(rulePackCodes, lookups.rulePacks);
    const parameterSetCheck = classifyDependencyCodes(parameterSetCodes, lookups.parameterSets);
    const agentProfileCheck = classifyDependencyCodes(agentCodes, lookups.agentProfiles);

    return {
        unpublished: {
            rulePacks: rulePackCheck.unpublished,
            parameterSets: parameterSetCheck.unpublished,
            agentProfiles: agentProfileCheck.unpublished,
        },
        unavailable: {
            rulePacks: rulePackCheck.unavailable,
            parameterSets: parameterSetCheck.unavailable,
            agentProfiles: agentProfileCheck.unavailable,
        },
    };
};
