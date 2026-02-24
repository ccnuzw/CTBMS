import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { App, Button, Space, Tag, Typography, Tooltip, Popconfirm, Divider } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
    DebateRoundTraceDto,
    NodeExecutionDto,
    WorkflowFailureCategory,
    WorkflowRiskDegradeAction,
    WorkflowRiskLevel,
    WorkflowExecutionStatus,
    WorkflowTriggerType,
} from '@packages/types';

import {
    useCancelWorkflowExecution,
    useRerunWorkflowExecution,
    useWorkflowExecutionTimeline,
    useWorkflowExecutionDebateTimeline,
    useWorkflowExecutionDebateTraces,
    useWorkflowExecutionDetail,
    useWorkflowExecutions,
    WorkflowExecutionWithRelations,
} from '../../api';

import { useWorkflowDefinitions } from '../../../workflow-studio/api';

import {
    WorkflowBindingEntity,
    WorkflowRuntimeTimelineRow,
} from './types';

import {
    getBindingCode,
    getBindingType,
    getBindingSource,
    parseBooleanParam,
    parsePositiveIntParam,
    parseStartedAtRangeParam,
    parseWorkflowExecutionStatusParam,
    parseWorkflowTriggerTypeParam,
    parseWorkflowRiskLevelParam,
    parseWorkflowRiskDegradeActionParam,
    parseWorkflowFailureCategoryParam,
    getRiskGateSummary,
    getExecutionOutputRiskGateSummary,
    getLatestRiskGateNodeSummary,
    getRiskGateSummaryConsistency,
    getExecutionRiskGateSummary,
    buildRiskGateExportPayload,
    getExecutionStatusLabel,
    getTriggerTypeLabel,
    getFailureCategoryLabel,
    getRiskLevelLabel,
    getDegradeActionLabel,
    getNodeStatusLabel,
    getNodeTypeLabel,
    getNodeAttempts,
    getNodeRouteHint,
    parseBindingSnapshot,
    toObjectRecord,
    normalizeOptionalText,
} from './utils';

import {
    riskGateMismatchFieldLabelMap,
    runtimeEventLevelColorMap,
    runtimeEventLevelLabelMap,
    executionStatusColorMap,
    riskLevelColorMap,
    nodeStatusColorMap,
    executionStatusOptions,
    triggerTypeOptions,
    failureCategoryOptions,
    riskLevelOptions,
    degradeActionOptions,
    riskGatePresenceOptions,
    riskSummaryPresenceOptions,
} from './constants';

import { getAgentRoleLabel } from '../../../workflow-agent-center/constants';
import { getErrorMessage } from '../../../../api/client';

const { Text } = Typography;

export const useWorkflowExecutionViewModel = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
    const [selectedReplayExecutionId, setSelectedReplayExecutionId] = useState<string | null>(null);

    const [selectedWorkflowDefinitionId, setSelectedWorkflowDefinitionId] = useState<string | undefined>(() => normalizeOptionalText(searchParams.get('workflowDefinitionId')));
    const [selectedStatus, setSelectedStatus] = useState<WorkflowExecutionStatus | undefined>(() => parseWorkflowExecutionStatusParam(searchParams.get('status')));
    const [selectedFailureCategory, setSelectedFailureCategory] = useState<WorkflowFailureCategory | undefined>(() => parseWorkflowFailureCategoryParam(searchParams.get('failureCategory')));
    const [failureCodeInput, setFailureCodeInput] = useState(() => normalizeOptionalText(searchParams.get('failureCode')) || '');
    const [failureCode, setFailureCode] = useState<string | undefined>(() => normalizeOptionalText(searchParams.get('failureCode')));
    const [selectedTriggerType, setSelectedTriggerType] = useState<WorkflowTriggerType | undefined>(() => parseWorkflowTriggerTypeParam(searchParams.get('triggerType')));
    const [selectedRiskLevel, setSelectedRiskLevel] = useState<WorkflowRiskLevel | undefined>(() => parseWorkflowRiskLevelParam(searchParams.get('riskLevel')));
    const [selectedDegradeAction, setSelectedDegradeAction] = useState<WorkflowRiskDegradeAction | undefined>(() => parseWorkflowRiskDegradeActionParam(searchParams.get('degradeAction')));
    const [selectedRiskGatePresence, setSelectedRiskGatePresence] = useState<boolean | undefined>(() => parseBooleanParam(searchParams.get('hasRiskGateNode')));
    const [selectedRiskSummaryPresence, setSelectedRiskSummaryPresence] = useState<boolean | undefined>(() => parseBooleanParam(searchParams.get('hasRiskSummary')));
    const [riskProfileCodeInput, setRiskProfileCodeInput] = useState(() => normalizeOptionalText(searchParams.get('riskProfileCode')) || '');
    const [riskProfileCode, setRiskProfileCode] = useState<string | undefined>(() => normalizeOptionalText(searchParams.get('riskProfileCode')));
    const [riskReasonKeywordInput, setRiskReasonKeywordInput] = useState(() => normalizeOptionalText(searchParams.get('riskReasonKeyword')) || '');
    const [riskReasonKeyword, setRiskReasonKeyword] = useState<string | undefined>(() => normalizeOptionalText(searchParams.get('riskReasonKeyword')));
    const [versionCodeInput, setVersionCodeInput] = useState(() => normalizeOptionalText(searchParams.get('versionCode')) || '');
    const [versionCode, setVersionCode] = useState<string | undefined>(() => normalizeOptionalText(searchParams.get('versionCode')));
    const [keywordInput, setKeywordInput] = useState(() => normalizeOptionalText(searchParams.get('keyword')) || '');
    const [keyword, setKeyword] = useState<string | undefined>(() => normalizeOptionalText(searchParams.get('keyword')));
    const [startedAtRange, setStartedAtRange] = useState<[Dayjs, Dayjs] | null>(() => parseStartedAtRangeParam(searchParams.get('startedAtFrom'), searchParams.get('startedAtTo')));
    const [onlySoftFailure, setOnlySoftFailure] = useState(() => parseBooleanParam(searchParams.get('hasSoftFailure')) === true);
    const [onlyErrorRoute, setOnlyErrorRoute] = useState(() => parseBooleanParam(searchParams.get('hasErrorRoute')) === true);
    const [onlyRiskBlocked, setOnlyRiskBlocked] = useState(() => parseBooleanParam(searchParams.get('hasRiskBlocked')) === true);

    const [rerunningExecutionId, setRerunningExecutionId] = useState<string | null>(null);
    const [cancelingExecutionId, setCancelingExecutionId] = useState<string | null>(null);
    const [page, setPage] = useState(() => parsePositiveIntParam(searchParams.get('page'), 1));
    const [pageSize, setPageSize] = useState(() => parsePositiveIntParam(searchParams.get('pageSize'), 20));

    const [timelineEventTypeInput, setTimelineEventTypeInput] = useState('');
    const [timelineEventType, setTimelineEventType] = useState<string | undefined>();
    const [timelineLevel, setTimelineLevel] = useState<import('@packages/types').WorkflowRuntimeEventLevel | undefined>();
    const [timelinePage, setTimelinePage] = useState(1);
    const [timelinePageSize, setTimelinePageSize] = useState(20);

    const [debateRoundNumber, setDebateRoundNumber] = useState<number | undefined>();
    const [debateParticipantCode, setDebateParticipantCode] = useState<string | undefined>();
    const [debateParticipantRole, setDebateParticipantRole] = useState<string | undefined>();
    const [debateKeyword, setDebateKeyword] = useState<string | undefined>();
    const [debateJudgementOnly, setDebateJudgementOnly] = useState(false);

    const { data: definitionPage } = useWorkflowDefinitions({ includePublic: true, page: 1, pageSize: 200 });

    const executionQuery = useMemo(() => ({
        workflowDefinitionId: selectedWorkflowDefinitionId,
        versionCode,
        triggerType: selectedTriggerType,
        status: selectedStatus,
        failureCategory: selectedFailureCategory,
        failureCode,
        riskLevel: selectedRiskLevel,
        degradeAction: selectedDegradeAction,
        riskProfileCode,
        riskReasonKeyword,
        hasRiskGateNode: selectedRiskGatePresence,
        hasRiskSummary: selectedRiskSummaryPresence,
        hasSoftFailure: onlySoftFailure ? true : undefined,
        hasErrorRoute: onlyErrorRoute ? true : undefined,
        hasRiskBlocked: onlyRiskBlocked ? true : undefined,
        keyword,
        startedAtFrom: startedAtRange?.[0]?.startOf('day').toISOString(),
        startedAtTo: startedAtRange?.[1]?.endOf('day').toISOString(),
        page,
        pageSize,
    }), [selectedWorkflowDefinitionId, versionCode, selectedTriggerType, selectedStatus, selectedFailureCategory, failureCode, selectedRiskLevel, selectedDegradeAction, riskProfileCode, riskReasonKeyword, selectedRiskGatePresence, selectedRiskSummaryPresence, onlySoftFailure, onlyErrorRoute, onlyRiskBlocked, keyword, startedAtRange, page, pageSize]);

    const searchParamsText = searchParams.toString();

    useEffect(() => {
        const next = new URLSearchParams();
        const setQuery = (key: string, value?: string | number | boolean) => {
            if (value === undefined || value === null || value === '') return;
            next.set(key, String(value));
        };

        setQuery('workflowDefinitionId', selectedWorkflowDefinitionId);
        setQuery('versionCode', versionCode);
        setQuery('triggerType', selectedTriggerType);
        setQuery('status', selectedStatus);
        setQuery('failureCategory', selectedFailureCategory);
        setQuery('failureCode', failureCode);
        setQuery('riskLevel', selectedRiskLevel);
        setQuery('degradeAction', selectedDegradeAction);
        setQuery('riskProfileCode', riskProfileCode);
        setQuery('riskReasonKeyword', riskReasonKeyword);
        if (selectedRiskGatePresence !== undefined) setQuery('hasRiskGateNode', selectedRiskGatePresence);
        if (selectedRiskSummaryPresence !== undefined) setQuery('hasRiskSummary', selectedRiskSummaryPresence);
        if (onlySoftFailure) setQuery('hasSoftFailure', true);
        if (onlyErrorRoute) setQuery('hasErrorRoute', true);
        if (onlyRiskBlocked) setQuery('hasRiskBlocked', true);
        setQuery('keyword', keyword);
        if (startedAtRange) {
            setQuery('startedAtFrom', startedAtRange[0].startOf('day').toISOString());
            setQuery('startedAtTo', startedAtRange[1].endOf('day').toISOString());
        }
        if (page !== 1) setQuery('page', page);
        if (pageSize !== 20) setQuery('pageSize', pageSize);

        const nextText = next.toString();
        if (nextText !== searchParamsText) {
            setSearchParams(next, { replace: true });
        }
    }, [selectedWorkflowDefinitionId, versionCode, selectedTriggerType, selectedStatus, selectedFailureCategory, failureCode, selectedRiskLevel, selectedDegradeAction, riskProfileCode, riskReasonKeyword, selectedRiskGatePresence, selectedRiskSummaryPresence, onlySoftFailure, onlyErrorRoute, onlyRiskBlocked, keyword, startedAtRange, page, pageSize, searchParamsText, setSearchParams]);

    const { data: executionPage, isLoading } = useWorkflowExecutions(executionQuery);
    const rerunMutation = useRerunWorkflowExecution();
    const cancelMutation = useCancelWorkflowExecution();

    const { data: executionDetail, isLoading: isDetailLoading } = useWorkflowExecutionDetail(selectedExecutionId || undefined);
    const { data: executionTimeline, isLoading: isTimelineLoading } = useWorkflowExecutionTimeline(selectedExecutionId || undefined, {
        eventType: timelineEventType,
        level: timelineLevel,
        page: timelinePage,
        pageSize: timelinePageSize,
    });
    const { data: debateTimeline, isLoading: isDebateTimelineLoading } = useWorkflowExecutionDebateTimeline(selectedExecutionId || undefined);
    const { data: debateTraces, isLoading: isDebateTracesLoading } = useWorkflowExecutionDebateTraces(selectedExecutionId || undefined, {
        roundNumber: debateRoundNumber,
        participantCode: debateParticipantCode,
        participantRole: debateParticipantRole,
        keyword: debateKeyword,
        isJudgement: debateJudgementOnly ? true : undefined,
    });

    useEffect(() => {
        setTimelineEventTypeInput('');
        setTimelineEventType(undefined);
        setTimelineLevel(undefined);
        setTimelinePage(1);
        setTimelinePageSize(20);
        setDebateRoundNumber(undefined);
        setDebateParticipantCode(undefined);
        setDebateParticipantRole(undefined);
        setDebateKeyword(undefined);
        setDebateJudgementOnly(false);
    }, [selectedExecutionId]);

    const riskGateSummary = useMemo(() => getRiskGateSummary(executionDetail), [executionDetail]);
    const executionOutputRiskGateSummary = useMemo(() => getExecutionOutputRiskGateSummary(executionDetail), [executionDetail]);
    const latestRiskGateNodeSummary = useMemo(() => getLatestRiskGateNodeSummary(executionDetail), [executionDetail]);
    const riskGateSummaryConsistency = useMemo(() => getRiskGateSummaryConsistency(executionDetail), [executionDetail]);

    const riskGateMismatchFieldLabels = useMemo(() => riskGateSummaryConsistency.mismatchFields.map((field) => riskGateMismatchFieldLabelMap[field] || field), [riskGateSummaryConsistency.mismatchFields]);
    const executionOutputRiskGateSummaryJson = useMemo(() => executionOutputRiskGateSummary ? JSON.stringify(buildRiskGateExportPayload(executionOutputRiskGateSummary), null, 2) : null, [executionOutputRiskGateSummary]);
    const latestRiskGateNodeSummaryJson = useMemo(() => latestRiskGateNodeSummary ? JSON.stringify(buildRiskGateExportPayload(latestRiskGateNodeSummary), null, 2) : null, [latestRiskGateNodeSummary]);
    const riskGateSummaryJson = useMemo(() => riskGateSummary ? JSON.stringify(buildRiskGateExportPayload(riskGateSummary), null, 2) : null, [riskGateSummary]);

    const workflowBindingSnapshotJson = useMemo(() => {
        const paramSnapshot = toObjectRecord(executionDetail?.paramSnapshot);
        const bindingSnapshot = parseBindingSnapshot(paramSnapshot?._workflowBindings);
        if (!bindingSnapshot) return null;
        return JSON.stringify(bindingSnapshot, null, 2);
    }, [executionDetail?.paramSnapshot]);

    const workflowBindingSnapshot = useMemo(() => {
        const paramSnapshot = toObjectRecord(executionDetail?.paramSnapshot);
        return parseBindingSnapshot(paramSnapshot?._workflowBindings);
    }, [executionDetail?.paramSnapshot]);

    const debateRounds = useMemo(() => debateTimeline?.rounds || [], [debateTimeline?.rounds]);
    const debateTraceData = useMemo(() => debateTraces || [], [debateTraces]);

    const resolvedAgents = useMemo(() => (workflowBindingSnapshot?.resolvedBindings?.agents || []) as WorkflowBindingEntity[], [workflowBindingSnapshot?.resolvedBindings?.agents]);
    const resolvedParameterSets = useMemo(() => (workflowBindingSnapshot?.resolvedBindings?.parameterSets || []) as WorkflowBindingEntity[], [workflowBindingSnapshot?.resolvedBindings?.parameterSets]);
    const resolvedDataConnectors = useMemo(() => (workflowBindingSnapshot?.resolvedBindings?.dataConnectors || []) as WorkflowBindingEntity[], [workflowBindingSnapshot?.resolvedBindings?.dataConnectors]);

    const bindingColumns = useMemo<ColumnsType<WorkflowBindingEntity>>(() => [
        { title: 'ID', dataIndex: 'id', width: 280 },
        { title: '版本', dataIndex: 'version', width: 90 },
        { title: '主键编码', key: 'code', render: (_, record) => getBindingCode(record) },
        { title: '类型信息', key: 'bindingType', width: 160, render: (_, record) => getBindingType(record) },
        { title: '来源', key: 'bindingSource', width: 120, render: (_, record) => getBindingSource(record) },
        {
            title: '操作', key: 'actions', width: 100, render: (_, record) => {
                const code = getBindingCode(record);
                return (
                    <Button
                        type="link"
                        size="small"
                        disabled={code === '-'
                        }
                        onClick={async () => {
                            if (code === '-') return;
                            try {
                                await navigator.clipboard.writeText(code);
                                message.success('绑定编码已复制');
                            } catch {
                                message.warning('复制失败，请手动复制');
                            }
                        }}
                    >
                        复制编码
                    </Button>
                );
            },
        },
    ], [message]);

    const handleRerun = async (executionId: string) => {
        try {
            setRerunningExecutionId(executionId);
            const rerunExecution = await rerunMutation.mutateAsync(executionId);
            message.success(`重跑成功，实例 ID: ${rerunExecution.id.slice(0, 8)}`);
            setSelectedExecutionId(rerunExecution.id);
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setRerunningExecutionId(null);
        }
    };

    const handleCancel = async (executionId: string) => {
        try {
            setCancelingExecutionId(executionId);
            const canceledExecution = await cancelMutation.mutateAsync({ executionId, reason: '页面手动取消' });
            message.success(`已取消实例 ${canceledExecution.id.slice(0, 8)}`);
            setSelectedExecutionId(canceledExecution.id);
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setCancelingExecutionId(null);
        }
    };

    const workflowDefinitionOptions = useMemo(() => (definitionPage?.data || []).map((item) => ({ label: `${item.name} (${item.workflowId})`, value: item.id })), [definitionPage?.data]);

    const timelineColumns = useMemo<ColumnsType<WorkflowRuntimeTimelineRow>>(() => [
        { title: '时间', dataIndex: 'occurredAt', width: 190, render: (value?: Date | string) => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-' },
        { title: '级别', dataIndex: 'level', width: 100, render: (value: import('@packages/types').WorkflowRuntimeEventLevel) => <Tag color={runtimeEventLevelColorMap[value] ?? 'default'} > {runtimeEventLevelLabelMap[value] || value} </Tag> },
        { title: '事件类型', dataIndex: 'eventType', width: 220 },
        { title: '消息', dataIndex: 'message' },
        { title: '节点执行', dataIndex: 'nodeExecutionId', width: 120, render: (value?: string | null) => (value ? value.slice(0, 8) : '-') },
    ], []);

    const debateTraceColumns = useMemo<ColumnsType<DebateRoundTraceDto>>(() => [
        { title: '轮次', dataIndex: 'roundNumber', width: 80 },
        { title: '参与者', dataIndex: 'participantCode', width: 160 },
        { title: '角色', dataIndex: 'participantRole', width: 140, render: (value: string) => <div style={{ whiteSpace: 'nowrap' }}> {getAgentRoleLabel(value)} </div> },
        { title: '置信度', dataIndex: 'confidence', width: 100, render: (value?: number | null) => (typeof value === 'number' ? value.toFixed(3) : '-') },
        { title: '裁决', dataIndex: 'isJudgement', width: 90, render: (value: boolean) => (value ? <Tag color="purple" > 裁判 </Tag> : '-') },
        { title: '发言摘要', dataIndex: 'statementText', render: (value: string) => <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}> {value} </div> },
    ], []);

    const timelineData = useMemo(() => executionTimeline?.data || executionDetail?.runtimeEvents || [], [executionTimeline?.data, executionDetail?.runtimeEvents]);

    const executionColumns = useMemo<ColumnsType<WorkflowExecutionWithRelations>>(() => [
        {
            title: '实例', dataIndex: 'id', width: 180, fixed: 'left', render: (value: string, record) => (
                <Space direction="vertical" size={2} >
                    <Space>
                        <Text strong copyable> {value.slice(0, 8)} </Text>
                        < Tag style={{ margin: 0 }}> {getTriggerTypeLabel(record.triggerType)} </Tag>
                    </Space>
                    {record.sourceExecutionId && <Text type="secondary" style={{ fontSize: 12 }}> 来自: {record.sourceExecutionId.slice(0, 8)} </Text>}
                </Space>
            ),
        },
        {
            title: '流程', key: 'workflow', width: 200, render: (_, record) => (
                <Space direction="vertical" size={2} >
                    <Text ellipsis style={{ maxWidth: 180 }
                    }> {record.workflowVersion?.workflowDefinition?.name || record.workflowVersion?.workflowDefinition?.workflowId || '-'} </Text>
                    < Tag style={{ margin: 0 }}> {record.workflowVersion?.versionCode} </Tag>
                </Space>
            ),
        },
        {
            title: '状态', key: 'status', width: 120, render: (_, record) => (
                <Space direction="vertical" size={2} >
                    <Tag color={executionStatusColorMap[record.status] ?? 'default'} style={{ margin: 0 }
                    }> {getExecutionStatusLabel(record.status)} </Tag>
                    {
                        record.status === 'FAILED' && (
                            <Tooltip title={`${getFailureCategoryLabel(record.failureCategory)}: ${record.failureCode || '未知错误'}`}>
                                <Text type="danger" style={{ fontSize: 12, maxWidth: 110 }
                                } ellipsis > {record.failureCode || getFailureCategoryLabel(record.failureCategory) || '执行失败'} </Text>
                            </Tooltip>
                        )}
                </Space>
            ),
        },
        {
            title: '执行时间', key: 'time', width: 150, render: (_, record) => {
                let durationTx = '-';
                if (record.completedAt && record.startedAt) {
                    const diff = dayjs(record.completedAt).diff(dayjs(record.startedAt), 'second');
                    durationTx = `${diff}s`;
                } else if (record.startedAt) {
                    const diff = dayjs().diff(dayjs(record.startedAt), 'minute');
                    durationTx = `运行 ${diff}m`;
                }
                return (
                    <Space direction="vertical" size={0} >
                        <Text style={{ fontSize: 13 }}> {record.startedAt ? dayjs(record.startedAt).format('MM-DD HH:mm') : '-'} </Text>
                        < Text type="secondary" style={{ fontSize: 12 }
                        }> {durationTx} </Text>
                    </Space>
                );
            },
        },
        {
            title: '风控结果', key: 'risk', width: 240, render: (_, record) => {
                const summary = getExecutionRiskGateSummary(record);
                if (!summary) return '-';
                return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }
                    }>
                        <Space>
                            {summary.blocked ? <Tag color="error">阻断</Tag> : <Tag color="success">通过</Tag>}
                            {summary.riskLevel && <Tag color={riskLevelColorMap[summary.riskLevel] || 'default'}>{getRiskLevelLabel(summary.riskLevel)}</Tag>}
                        </Space>
                        {
                            summary.blocked && summary.blockReason ? (
                                <Tooltip title={summary.blockReason} >
                                    <Text type="secondary" style={{ fontSize: 12, maxWidth: 220 }
                                    } ellipsis > 原因: {summary.blockReason} </Text>
                                </Tooltip>
                            ) : summary.degradeAction && summary.degradeAction !== 'REVIEW_ONLY' ? (
                                <Text type="warning" style={{ fontSize: 12 }
                                }> 降级: {getDegradeActionLabel(summary.degradeAction)} </Text>
                            ) : null}
                    </Space>
                );
            },
        },
        {
            title: '操作', key: 'actions', width: 220, fixed: 'right', render: (_, record) => (
                <Space size={0} split={< Divider type="vertical" />}>
                    <Typography.Link onClick={() => setSelectedExecutionId(record.id)}> 详情 </Typography.Link>
                    < Typography.Link onClick={() => setSelectedReplayExecutionId(record.id)}> 回放 </Typography.Link>
                    {
                        record.status === 'FAILED' && (
                            <Typography.Link onClick={() => handleRerun(record.id)} disabled={rerunMutation.isPending && rerunningExecutionId === record.id} > 重跑 </Typography.Link>
                        )
                    }
                    {
                        (record.status === 'RUNNING' || record.status === 'PENDING') && (
                            <Popconfirm title="确认取消？" onConfirm={() => handleCancel(record.id)
                            }>
                                <Typography.Link type="danger" > 取消 </Typography.Link>
                            </Popconfirm>
                        )}
                </Space>
            ),
        },
    ], [navigate, rerunMutation.isPending, rerunningExecutionId, cancelMutation.isPending, cancelingExecutionId]);

    const nodeColumns = useMemo<ColumnsType<NodeExecutionDto>>(() => [
        { title: '节点 ID', dataIndex: 'nodeId', width: 180 },
        { title: '节点类型', dataIndex: 'nodeType', width: 180, render: (value: string) => getNodeTypeLabel(value) },
        { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag color={nodeStatusColorMap[value] ?? 'default'} > {getNodeStatusLabel(value)} </Tag> },
        { title: '耗时(秒)', dataIndex: 'durationMs', width: 120, render: (value?: number | null) => value ?? '-' },
        { title: '尝试次数', key: 'attempts', width: 100, render: (_, record) => getNodeAttempts(record) ?? '-' },
        { title: '路径标记', key: 'routeHint', width: 160, render: (_, record) => { const hint = getNodeRouteHint(record); return hint ? <Tag color={hint.color}> {hint.label} </Tag> : '-'; } },
        { title: '错误信息', dataIndex: 'errorMessage', render: (value?: string | null) => value || '-' },
    ], []);

    const handleResetFilters = () => {
        setVersionCodeInput('');
        setVersionCode(undefined);
        setKeywordInput('');
        setKeyword(undefined);
        setSelectedWorkflowDefinitionId(undefined);
        setSelectedStatus(undefined);
        setSelectedFailureCategory(undefined);
        setFailureCodeInput('');
        setFailureCode(undefined);
        setSelectedTriggerType(undefined);
        setSelectedRiskLevel(undefined);
        setSelectedDegradeAction(undefined);
        setSelectedRiskGatePresence(undefined);
        setSelectedRiskSummaryPresence(undefined);
        setStartedAtRange(null);
        setOnlySoftFailure(false);
        setOnlyErrorRoute(false);
        setOnlyRiskBlocked(false);
        setRiskProfileCodeInput('');
        setRiskProfileCode(undefined);
        setRiskReasonKeywordInput('');
        setRiskReasonKeyword(undefined);
        setPage(1);
        setPageSize(20);
    };

    return {
        state: {
            selectedExecutionId, setSelectedExecutionId,
            selectedReplayExecutionId, setSelectedReplayExecutionId,
            selectedWorkflowDefinitionId, setSelectedWorkflowDefinitionId,
            selectedStatus, setSelectedStatus,
            selectedFailureCategory, setSelectedFailureCategory,
            failureCodeInput, setFailureCodeInput,
            failureCode, setFailureCode,
            selectedTriggerType, setSelectedTriggerType,
            selectedRiskLevel, setSelectedRiskLevel,
            selectedDegradeAction, setSelectedDegradeAction,
            selectedRiskGatePresence, setSelectedRiskGatePresence,
            selectedRiskSummaryPresence, setSelectedRiskSummaryPresence,
            riskProfileCodeInput, setRiskProfileCodeInput,
            riskProfileCode, setRiskProfileCode,
            riskReasonKeywordInput, setRiskReasonKeywordInput,
            riskReasonKeyword, setRiskReasonKeyword,
            versionCodeInput, setVersionCodeInput,
            versionCode, setVersionCode,
            keywordInput, setKeywordInput,
            keyword, setKeyword,
            startedAtRange, setStartedAtRange,
            onlySoftFailure, setOnlySoftFailure,
            onlyErrorRoute, setOnlyErrorRoute,
            onlyRiskBlocked, setOnlyRiskBlocked,
            rerunningExecutionId, setRerunningExecutionId,
            cancelingExecutionId, setCancelingExecutionId,
            page, setPage,
            pageSize, setPageSize,
            timelineEventTypeInput, setTimelineEventTypeInput,
            timelineEventType, setTimelineEventType,
            timelineLevel, setTimelineLevel,
            timelinePage, setTimelinePage,
            timelinePageSize, setTimelinePageSize,
            debateRoundNumber, setDebateRoundNumber,
            debateParticipantCode, setDebateParticipantCode,
            debateParticipantRole, setDebateParticipantRole,
            debateKeyword, setDebateKeyword,
            debateJudgementOnly, setDebateJudgementOnly,
        },
        queries: {
            definitionPage,
            executionPage, isLoading,
            executionDetail, isDetailLoading,
            executionTimeline, isTimelineLoading,
            debateTimeline, isDebateTimelineLoading,
            debateTraces, isDebateTracesLoading,
        },
        computed: {
            riskGateSummary,
            executionOutputRiskGateSummary,
            latestRiskGateNodeSummary,
            riskGateSummaryConsistency,
            riskGateMismatchFieldLabels,
            executionOutputRiskGateSummaryJson,
            latestRiskGateNodeSummaryJson,
            riskGateSummaryJson,
            workflowBindingSnapshotJson,
            workflowBindingSnapshot,
            debateRounds,
            debateTraceData,
            resolvedAgents,
            resolvedParameterSets,
            resolvedDataConnectors,
            timelineData,
            workflowDefinitionOptions,
        },
        options: {
            executionStatusOptions, triggerTypeOptions, failureCategoryOptions, riskLevelOptions, degradeActionOptions, riskGatePresenceOptions, riskSummaryPresenceOptions
        },
        actions: {
            handleRerun, handleCancel, handleResetFilters
        },
        columns: {
            executionColumns, nodeColumns, timelineColumns, debateTraceColumns, bindingColumns
        }
    };
};
