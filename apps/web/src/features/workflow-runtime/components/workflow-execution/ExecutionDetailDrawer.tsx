import React, { useMemo } from 'react';
import { Drawer, Tabs, Space, Alert, Descriptions, Tag, Tooltip, Card, Table, Input, Select, Checkbox, Collapse, Typography, Empty } from 'antd';
import dayjs from 'dayjs';

const { Paragraph } = Typography;

import { useWorkflowExecutionViewModel } from './useWorkflowExecutionViewModel';
import {
    getTriggerTypeLabel,
    getExecutionStatusLabel,
    getFailureCategoryLabel,
    getRiskLevelLabel,
    getDegradeActionLabel
} from './utils';
import { executionStatusColorMap, riskLevelColorMap } from './constants';
import { getAgentRoleLabel } from '../../../workflow-agent-center/constants';

interface ExecutionDetailDrawerProps {
    viewModel: ReturnType<typeof useWorkflowExecutionViewModel>;
}

export const ExecutionDetailDrawer: React.FC<ExecutionDetailDrawerProps> = ({ viewModel }) => {
    const { state, queries, computed, columns } = viewModel;

    const {
        selectedExecutionId, setSelectedExecutionId,
        timelineEventTypeInput, setTimelineEventTypeInput,
        timelineEventType, setTimelineEventType,
        timelineLevel, setTimelineLevel,
        timelinePage, setTimelinePage,
        timelinePageSize, setTimelinePageSize,
        debateRoundNumber, setDebateRoundNumber,
        debateParticipantCode, setDebateParticipantCode,
        debateJudgementOnly, setDebateJudgementOnly,
    } = state;

    const {
        executionDetail, isDetailLoading,
        executionTimeline, isTimelineLoading,
        isDebateTracesLoading,
    } = queries;

    const {
        riskGateSummaryConsistency,
        riskGateMismatchFieldLabels,
        riskGateSummary,
        workflowBindingSnapshotJson,
        debateRounds,
        debateTraceData,
        timelineData,
    } = computed;

    const { nodeColumns, timelineColumns, debateTraceColumns } = columns;

    const debateRoundCollapseItems = useMemo(
        () =>
             
            debateRounds.map((round: any) => ({
                key: String(round.roundNumber),
                label: `第 ${round.roundNumber} 轮 · 参与者 ${round.roundSummary.participantCount} · 裁决 ${round.roundSummary.hasJudgement ? '是' : '否'
                    } · 平均置信度 ${typeof round.roundSummary.avgConfidence === 'number'
                        ? round.roundSummary.avgConfidence.toFixed(3)
                        : '-'
                    }`,
                children: (
                    <Table
                        rowKey="id"
                        columns={debateTraceColumns}
                        dataSource={round.entries}
                        pagination={false}
                        size="small"
                    />
                ),
            })),
        [debateRounds, debateTraceColumns],
    );

    return (
        <Drawer
            title={`运行详情 - ${selectedExecutionId?.slice(0, 8) || ''}`}
            width={1400}
            open={Boolean(selectedExecutionId)}
            onClose={() => setSelectedExecutionId(null)}
        >
            <Tabs
                defaultActiveKey="overview"
                items={[
                    {
                        key: 'overview',
                        label: '概览',
                        children: (
                            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                {riskGateSummaryConsistency.hasRiskGateNode &&
                                    (!riskGateSummaryConsistency.hasExecutionSummary ||
                                        riskGateSummaryConsistency.mismatchFields.length) ? (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        message="风控摘要一致性告警"
                                        description={
                                            !riskGateSummaryConsistency.hasExecutionSummary
                                                ? '检测到 risk-gate 节点执行记录，但实例 outputSnapshot.riskGate 缺失。'
                                                : `实例 outputSnapshot.riskGate 与最新 risk-gate 节点摘要不一致（字段：${riskGateMismatchFieldLabels.join(
                                                    ', ',
                                                )}）。`
                                        }
                                    />
                                ) : null}
                                <Descriptions
                                    column={2}
                                    bordered
                                    size="small"
                                    items={[
                                        {
                                            key: 'workflow',
                                            label: '流程',
                                            children: executionDetail?.workflowVersion?.workflowDefinition?.name || '-',
                                        },
                                        {
                                            key: 'version',
                                            label: '版本',
                                            children: executionDetail?.workflowVersion?.versionCode || '-',
                                        },
                                        {
                                            key: 'triggerType',
                                            label: '触发类型',
                                            children: getTriggerTypeLabel(executionDetail?.triggerType),
                                        },
                                        {
                                            key: 'sourceExecutionId',
                                            label: '来源实例',
                                            children: executionDetail?.sourceExecutionId
                                                ? executionDetail.sourceExecutionId.slice(0, 8)
                                                : '-',
                                        },
                                        {
                                            key: 'status',
                                            label: '执行状态',
                                            children: executionDetail?.status ? (
                                                <Tag color={executionStatusColorMap[executionDetail.status] ?? 'default'}>
                                                    {getExecutionStatusLabel(executionDetail.status)}
                                                </Tag>
                                            ) : (
                                                '-'
                                            ),
                                        },
                                        {
                                            key: 'failureCategory',
                                            label: '失败分类',
                                            children: getFailureCategoryLabel(executionDetail?.failureCategory),
                                        },
                                        {
                                            key: 'failureCode',
                                            label: '失败代码',
                                            children: executionDetail?.failureCode || '-',
                                        },
                                        {
                                            key: 'startedAt',
                                            label: '开始时间',
                                            children: executionDetail?.startedAt
                                                ? dayjs(executionDetail.startedAt).format('YYYY-MM-DD HH:mm:ss')
                                                : '-',
                                        },
                                        {
                                            key: 'completedAt',
                                            label: '结束时间',
                                            span: 2,
                                            children: executionDetail?.completedAt
                                                ? dayjs(executionDetail.completedAt).format('YYYY-MM-DD HH:mm:ss')
                                                : '-',
                                        },
                                        {
                                            key: 'errorMessage',
                                            label: '错误信息',
                                            span: 2,
                                            children: executionDetail?.errorMessage || '-',
                                        },
                                    ]}
                                />

                                <Card size="small" title="风控信息">
                                    <Descriptions
                                        column={2}
                                        bordered
                                        size="small"
                                        items={[
                                            {
                                                key: 'riskGateResult',
                                                label: '风控结论',
                                                children: riskGateSummary ? (
                                                    <Tag color={riskGateSummary.passed ? 'success' : 'error'}>
                                                        {riskGateSummary.passed ? '通过' : riskGateSummary.blocked ? '阻断' : '待定'}
                                                    </Tag>
                                                ) : (
                                                    '-'
                                                ),
                                            },
                                            {
                                                key: 'riskLevel',
                                                label: '风险等级',
                                                children: riskGateSummary?.riskLevel ? (
                                                    <Tag color={riskLevelColorMap[riskGateSummary.riskLevel] || 'default'}>
                                                        {getRiskLevelLabel(riskGateSummary.riskLevel)}
                                                    </Tag>
                                                ) : (
                                                    '-'
                                                ),
                                            },
                                            {
                                                key: 'degradeAction',
                                                label: '降级动作',
                                                children: getDegradeActionLabel(riskGateSummary?.degradeAction),
                                            },
                                            {
                                                key: 'riskProfileCode',
                                                label: '风控模板',
                                                children: riskGateSummary?.riskProfileCode || '-',
                                            },
                                            {
                                                key: 'blockReason',
                                                label: '阻断原因',
                                                span: 2,
                                                children: riskGateSummary?.blockReason || '-',
                                            },
                                            {
                                                key: 'blockers',
                                                label: '阻断项',
                                                span: 2,
                                                children: riskGateSummary?.blockers.length
                                                    ? riskGateSummary.blockers.join(', ')
                                                    : '-',
                                            },
                                        ]}
                                    />
                                </Card>
                            </Space>
                        ),
                    },
                    {
                        key: 'nodes',
                        label: '节点执行',
                        children: (
                            <Table
                                rowKey="id"
                                loading={isDetailLoading}
                                columns={nodeColumns}
                                dataSource={executionDetail?.nodeExecutions || []}
                                pagination={false}
                            />
                        ),
                    },
                    {
                        key: 'timeline',
                        label: '时间线',
                        children: (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Space wrap>
                                    <Input.Search
                                        allowClear
                                        placeholder="按事件类型筛选"
                                        value={timelineEventTypeInput}
                                        onChange={(e) => {
                                            setTimelineEventTypeInput(e.target.value);
                                            if (!e.target.value.trim()) {
                                                setTimelineEventType(undefined);
                                                setTimelinePage(1);
                                            }
                                        }}
                                        onSearch={(value) => {
                                            setTimelineEventType(value.trim() || undefined);
                                            setTimelinePage(1);
                                        }}
                                    />
                                    <Select
                                        allowClear
                                        style={{ width: 120 }}
                                        placeholder="按级别"
                                        options={[{ label: '信息', value: 'INFO' }, { label: '警告', value: 'WARN' }, { label: '错误', value: 'ERROR' }]}
                                        value={timelineLevel}
                                        onChange={(value) => { setTimelineLevel(value); setTimelinePage(1); }}
                                    />
                                </Space>
                                <Table
                                    rowKey="id"
                                    loading={isTimelineLoading}
                                    columns={timelineColumns}
                                    dataSource={timelineData}
                                    pagination={{
                                        current: executionTimeline?.page || timelinePage,
                                        pageSize: executionTimeline?.pageSize || timelinePageSize,
                                        total: executionTimeline?.total ?? executionDetail?.runtimeEvents?.length ?? 0,
                                        showSizeChanger: true,
                                        onChange: (nextPage, nextPageSize) => {
                                            setTimelinePage(nextPage);
                                            setTimelinePageSize(nextPageSize);
                                        },
                                    }}
                                    scroll={{ x: 860 }}
                                />
                            </Space>
                        ),
                    },
                    {
                        key: 'debate',
                        label: '辩论回放',
                        children: (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Space wrap>
                                    <Input placeholder="轮次" style={{ width: 100 }} value={debateRoundNumber ?? ''} onChange={e => {
                                        const v = Number(e.target.value);
                                        setDebateRoundNumber(Number.isFinite(v) && e.target.value ? v : undefined);
                                    }} />
                                    <Input placeholder="参与者编码" value={debateParticipantCode} onChange={e => setDebateParticipantCode(e.target.value || undefined)} />
                                    <Checkbox checked={debateJudgementOnly} onChange={e => setDebateJudgementOnly(e.target.checked)}>仅裁决</Checkbox>
                                </Space>

                                <Collapse
                                    items={debateRoundCollapseItems}
                                     
                                    defaultActiveKey={debateRoundCollapseItems.slice(0, 1).map((item: any) => item.key)}
                                />

                                <Table
                                    rowKey="id"
                                    loading={isDebateTracesLoading}
                                    columns={debateTraceColumns}
                                    dataSource={debateTraceData}
                                    pagination={{ pageSize: 20 }}
                                />
                            </Space>
                        )
                    },
                    {
                        key: 'bindings',
                        label: '绑定快照',
                        children: workflowBindingSnapshotJson ? (
                            <Card size="small" title="运行绑定快照">
                                <Paragraph copyable={{ text: workflowBindingSnapshotJson }}>
                                    <pre>{workflowBindingSnapshotJson}</pre>
                                </Paragraph>
                            </Card>
                        ) : <Empty description="无绑定数据" />
                    }
                ]}
            />
        </Drawer>
    );
};
