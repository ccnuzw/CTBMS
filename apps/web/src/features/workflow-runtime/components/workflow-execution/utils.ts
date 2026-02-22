import dayjs, { Dayjs } from 'dayjs';
import {
    NodeExecutionDto,
    WorkflowFailureCategory,
    WorkflowRiskDegradeAction,
    WorkflowRiskLevel,
    WorkflowExecutionStatus,
    WorkflowTriggerType,
} from '@packages/types';
import {
    WorkflowBindingEntity,
    WorkflowBindingSnapshot,
    RiskGateSummary,
    RiskGateSummaryConsistency,
} from './types';
import { getAgentRoleLabel, getTemplateSourceLabel } from '../../../workflow-agent-center/constants';
import { WorkflowExecutionDetail, WorkflowExecutionWithRelations } from '../../api';

import {
    workflowExecutionStatusLabelMap,
    workflowTriggerTypeLabelMap,
    workflowFailureCategoryLabelMap,
    workflowRiskLevelLabelMap,
    workflowRiskDegradeActionLabelMap,
    nodeStatusLabelMap,
    nodeTypeLabelMap,
    riskLevelPriorityMap,
} from './constants';

export const getBindingCode = (record: WorkflowBindingEntity): string =>
    readString(record.agentCode) ||
    readString(record.setCode) ||
    readString(record.connectorCode) ||
    '-';

export const getBindingType = (record: WorkflowBindingEntity): string => {
    const roleType = readString(record.roleType);
    if (roleType) {
        return getAgentRoleLabel(roleType);
    }
    return readString(record.connectorType) || '-';
};

export const getBindingSource = (record: WorkflowBindingEntity): string => {
    const templateSource = readString(record.templateSource);
    if (templateSource) {
        return getTemplateSourceLabel(templateSource);
    }
    return readString(record.ownerType) || '-';
};

export const toObjectRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

export const getNodeRouteHint = (
    nodeExecution: NodeExecutionDto,
): { label: string; color: string } | null => {
    const outputSnapshot = toObjectRecord(nodeExecution.outputSnapshot);
    if (!outputSnapshot) {
        return null;
    }

    const skipType = outputSnapshot.skipType;
    if (skipType === 'ROUTE_TO_ERROR') {
        return { label: '错误分支跳过', color: 'warning' };
    }

    const meta = toObjectRecord(outputSnapshot._meta);
    if (meta?.onErrorRouting === 'ROUTE_TO_ERROR') {
        return { label: '触发错误分支', color: 'magenta' };
    }

    return null;
};

export const getNodeAttempts = (nodeExecution: NodeExecutionDto): number | null => {
    const outputSnapshot = toObjectRecord(nodeExecution.outputSnapshot);
    if (!outputSnapshot) {
        return null;
    }
    const meta = toObjectRecord(outputSnapshot._meta);
    return typeof meta?.attempts === 'number' ? meta.attempts : null;
};

export const readString = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
};

export const readBoolean = (value: unknown): boolean | null => {
    if (typeof value === 'boolean') {
        return value;
    }
    return null;
};

export const readNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return null;
};

export const readStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => readString(item)).filter((item): item is string => Boolean(item));
};

export const parseBindingSnapshot = (value: unknown): WorkflowBindingSnapshot | null => {
    const record = toObjectRecord(value);
    if (!record) {
        return null;
    }
    return record as WorkflowBindingSnapshot;
};

export const normalizeOptionalText = (value: string | null): string | undefined => {
    if (!value) {
        return undefined;
    }
    const normalized = value.trim();
    return normalized ? normalized : undefined;
};

export const parseBooleanParam = (value: string | null): boolean | undefined => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === 'true' || normalized === '1') {
        return true;
    }
    if (normalized === 'false' || normalized === '0') {
        return false;
    }
    return undefined;
};

export const parsePositiveIntParam = (value: string | null, fallback: number): number => {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
};

export const parseStartedAtRangeParam = (
    startedAtFrom: string | null,
    startedAtTo: string | null,
): [Dayjs, Dayjs] | null => {
    if (!startedAtFrom || !startedAtTo) {
        return null;
    }
    const from = dayjs(startedAtFrom);
    const to = dayjs(startedAtTo);
    if (!from.isValid() || !to.isValid()) {
        return null;
    }
    return [from, to];
};

export const parseWorkflowExecutionStatusParam = (
    value: string | null,
): WorkflowExecutionStatus | undefined => {
    if (
        value === 'PENDING' ||
        value === 'RUNNING' ||
        value === 'SUCCESS' ||
        value === 'FAILED' ||
        value === 'CANCELED'
    ) {
        return value;
    }
    return undefined;
};

export const parseWorkflowTriggerTypeParam = (value: string | null): WorkflowTriggerType | undefined => {
    if (
        value === 'MANUAL' ||
        value === 'API' ||
        value === 'SCHEDULE' ||
        value === 'EVENT' ||
        value === 'ON_DEMAND'
    ) {
        return value;
    }
    return undefined;
};

export const parseWorkflowRiskLevelParam = (value: string | null): WorkflowRiskLevel | undefined => {
    if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'EXTREME') {
        return value;
    }
    return undefined;
};

export const parseWorkflowRiskDegradeActionParam = (
    value: string | null,
): WorkflowRiskDegradeAction | undefined => {
    if (value === 'HOLD' || value === 'REDUCE' || value === 'REVIEW_ONLY') {
        return value;
    }
    return undefined;
};

export const parseWorkflowFailureCategoryParam = (
    value: string | null,
): WorkflowFailureCategory | undefined => {
    if (
        value === 'VALIDATION' ||
        value === 'EXECUTOR' ||
        value === 'TIMEOUT' ||
        value === 'CANCELED' ||
        value === 'INTERNAL'
    ) {
        return value;
    }
    return undefined;
};

export const parseRiskGateSummaryRecord = (
    raw: Record<string, unknown> | null,
): RiskGateSummary | null => {
    if (!raw) {
        return null;
    }

    const meta = toObjectRecord(raw._meta);
    const riskGateMeta = toObjectRecord(meta?.riskGate);
    const blockers = readStringArray(raw.blockers);
    const blockerCount = readNumber(raw.blockerCount);

    return {
        summarySchemaVersion: readString(raw.summarySchemaVersion),
        riskLevel: readString(raw.riskLevel),
        passed: readBoolean(raw.riskGatePassed),
        blocked: readBoolean(raw.riskGateBlocked),
        blockReason: readString(raw.blockReason),
        degradeAction: readString(raw.degradeAction),
        blockers,
        blockerCount: blockerCount ?? blockers.length,
        riskProfileCode: readString(raw.riskProfileCode) ?? readString(riskGateMeta?.riskProfileCode),
        threshold: readString(raw.threshold) ?? readString(riskGateMeta?.threshold),
        blockedByRiskLevel:
            readBoolean(raw.blockedByRiskLevel) ?? readBoolean(riskGateMeta?.blockedByRiskLevel),
        hardBlock: readBoolean(raw.hardBlock) ?? readBoolean(riskGateMeta?.hardBlock),
        riskEvaluatedAt: readString(raw.riskEvaluatedAt),
    };
};

export const getRiskGateSummary = (executionDetail?: WorkflowExecutionDetail): RiskGateSummary | null => {
    if (!executionDetail) {
        return null;
    }

    const executionOutput = toObjectRecord(executionDetail.outputSnapshot);
    const riskGateFromExecutionOutput = toObjectRecord(executionOutput?.riskGate);
    if (riskGateFromExecutionOutput) {
        return parseRiskGateSummaryRecord(riskGateFromExecutionOutput);
    }

    if (!executionDetail.nodeExecutions?.length) {
        return null;
    }

    const riskGateNodeExecution = [...executionDetail.nodeExecutions]
        .reverse()
        .find((item) => item.nodeType === 'risk-gate');
    if (!riskGateNodeExecution) {
        return null;
    }

    const outputSnapshot = toObjectRecord(riskGateNodeExecution.outputSnapshot);
    return parseRiskGateSummaryRecord(outputSnapshot);
};

export const getExecutionOutputRiskGateSummary = (
    executionDetail?: WorkflowExecutionDetail,
): RiskGateSummary | null => {
    if (!executionDetail) {
        return null;
    }

    const executionOutput = toObjectRecord(executionDetail.outputSnapshot);
    const riskGate = toObjectRecord(executionOutput?.riskGate);
    return parseRiskGateSummaryRecord(riskGate);
};

export const getLatestRiskGateNodeSummary = (
    executionDetail?: WorkflowExecutionDetail,
): RiskGateSummary | null => {
    if (!executionDetail?.nodeExecutions?.length) {
        return null;
    }

    const riskGateNodeExecution = [...executionDetail.nodeExecutions]
        .reverse()
        .find((item) => item.nodeType === 'risk-gate');

    if (!riskGateNodeExecution) {
        return null;
    }

    const outputSnapshot = toObjectRecord(riskGateNodeExecution.outputSnapshot);
    return parseRiskGateSummaryRecord(outputSnapshot);
};

export const getRiskGateSummaryConsistency = (
    executionDetail?: WorkflowExecutionDetail,
): RiskGateSummaryConsistency => {
    const executionSummary = getExecutionOutputRiskGateSummary(executionDetail);
    const latestNodeSummary = getLatestRiskGateNodeSummary(executionDetail);

    if (!latestNodeSummary) {
        return {
            hasRiskGateNode: false,
            hasExecutionSummary: Boolean(executionSummary),
            mismatchFields: [],
        };
    }

    if (!executionSummary) {
        return {
            hasRiskGateNode: true,
            hasExecutionSummary: false,
            mismatchFields: [],
        };
    }

    const mismatchFields: string[] = [];
    if (executionSummary.riskLevel !== latestNodeSummary.riskLevel) {
        mismatchFields.push('riskLevel');
    }
    if (executionSummary.blocked !== latestNodeSummary.blocked) {
        mismatchFields.push('riskGateBlocked');
    }
    if (executionSummary.degradeAction !== latestNodeSummary.degradeAction) {
        mismatchFields.push('degradeAction');
    }
    if (executionSummary.blockReason !== latestNodeSummary.blockReason) {
        mismatchFields.push('blockReason');
    }

    return {
        hasRiskGateNode: true,
        hasExecutionSummary: true,
        mismatchFields,
    };
};

export const getExecutionRiskGateSummary = (
    execution: WorkflowExecutionWithRelations,
): RiskGateSummary | null => {
    const executionOutput = toObjectRecord(execution.outputSnapshot);
    const riskGate = toObjectRecord(executionOutput?.riskGate);
    return parseRiskGateSummaryRecord(riskGate);
};

export const buildRiskGateExportPayload = (summary: RiskGateSummary) => {
    return {
        summarySchemaVersion: summary.summarySchemaVersion,
        riskLevel: summary.riskLevel,
        riskGatePassed: summary.passed,
        riskGateBlocked: summary.blocked,
        blockReason: summary.blockReason,
        degradeAction: summary.degradeAction,
        blockers: summary.blockers,
        blockerCount: summary.blockerCount,
        riskProfileCode: summary.riskProfileCode,
        threshold: summary.threshold,
        blockedByRiskLevel: summary.blockedByRiskLevel,
        hardBlock: summary.hardBlock,
        riskEvaluatedAt: summary.riskEvaluatedAt,
    };
};

export const getExecutionStatusLabel = (status?: WorkflowExecutionStatus | string | null): string => {
    if (!status) {
        return '-';
    }
    return workflowExecutionStatusLabelMap[status as WorkflowExecutionStatus] || status;
};

export const getTriggerTypeLabel = (triggerType?: WorkflowTriggerType | string | null): string => {
    if (!triggerType) {
        return '-';
    }
    return workflowTriggerTypeLabelMap[triggerType as WorkflowTriggerType] || triggerType;
};

export const getFailureCategoryLabel = (
    failureCategory?: WorkflowFailureCategory | string | null,
): string => {
    if (!failureCategory) {
        return '-';
    }
    return workflowFailureCategoryLabelMap[failureCategory as WorkflowFailureCategory] || failureCategory;
};

export const getRiskLevelLabel = (riskLevel?: WorkflowRiskLevel | string | null): string => {
    if (!riskLevel) {
        return '-';
    }
    return workflowRiskLevelLabelMap[riskLevel as WorkflowRiskLevel] || riskLevel;
};

export const getDegradeActionLabel = (
    degradeAction?: WorkflowRiskDegradeAction | string | null,
): string => {
    if (!degradeAction) {
        return '-';
    }
    return workflowRiskDegradeActionLabelMap[degradeAction as WorkflowRiskDegradeAction] || degradeAction;
};

export const getNodeStatusLabel = (status?: string | null): string => {
    if (!status) {
        return '-';
    }
    return nodeStatusLabelMap[status] || status;
};

export const getNodeTypeLabel = (nodeType?: string | null): string => {
    if (!nodeType) {
        return '-';
    }
    return nodeTypeLabelMap[nodeType] || nodeType;
};

export const getRiskGateSortScore = (summary: RiskGateSummary | null): number => {
    if (!summary) {
        return 0;
    }

    const blockedScore = summary.blocked ? 100 : 0;
    const riskLevelScore = summary.riskLevel ? riskLevelPriorityMap[summary.riskLevel] || 0 : 0;
    return blockedScore + riskLevelScore;
};
