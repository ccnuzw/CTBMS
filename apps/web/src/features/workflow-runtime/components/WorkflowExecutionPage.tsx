import React, { useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
    App,
    Button,
    Card,
    Checkbox,
    DatePicker,
    Descriptions,
    Drawer,
    Input,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import {
    NodeExecutionDto,
    WorkflowExecutionStatus,
    WorkflowTriggerType,
} from '@packages/types';
import {
    WorkflowExecutionWithRelations,
    useRerunWorkflowExecution,
    useWorkflowExecutionDetail,
    useWorkflowExecutions,
} from '../api';
import { useWorkflowDefinitions } from '../../workflow-studio/api';
import { getErrorMessage } from '../../../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const toObjectRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

const getNodeRouteHint = (nodeExecution: NodeExecutionDto): { label: string; color: string } | null => {
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

const getNodeAttempts = (nodeExecution: NodeExecutionDto): number | null => {
    const outputSnapshot = toObjectRecord(nodeExecution.outputSnapshot);
    if (!outputSnapshot) {
        return null;
    }
    const meta = toObjectRecord(outputSnapshot._meta);
    return typeof meta?.attempts === 'number' ? meta.attempts : null;
};

const executionStatusColorMap: Record<string, string> = {
    PENDING: 'default',
    RUNNING: 'processing',
    SUCCESS: 'success',
    FAILED: 'error',
    CANCELED: 'warning',
};

const nodeStatusColorMap: Record<string, string> = {
    PENDING: 'default',
    RUNNING: 'processing',
    SUCCESS: 'success',
    FAILED: 'error',
    SKIPPED: 'warning',
};

const executionStatusOptions: { label: string; value: WorkflowExecutionStatus }[] = [
    { label: 'PENDING', value: 'PENDING' },
    { label: 'RUNNING', value: 'RUNNING' },
    { label: 'SUCCESS', value: 'SUCCESS' },
    { label: 'FAILED', value: 'FAILED' },
    { label: 'CANCELED', value: 'CANCELED' },
];

const triggerTypeOptions: { label: string; value: WorkflowTriggerType }[] = [
    { label: 'MANUAL', value: 'MANUAL' },
    { label: 'API', value: 'API' },
    { label: 'SCHEDULE', value: 'SCHEDULE' },
    { label: 'EVENT', value: 'EVENT' },
    { label: 'ON_DEMAND', value: 'ON_DEMAND' },
];

export const WorkflowExecutionPage: React.FC = () => {
    const { message } = App.useApp();
    const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
    const [selectedWorkflowDefinitionId, setSelectedWorkflowDefinitionId] = useState<string | undefined>();
    const [selectedStatus, setSelectedStatus] = useState<WorkflowExecutionStatus | undefined>();
    const [selectedTriggerType, setSelectedTriggerType] = useState<WorkflowTriggerType | undefined>();
    const [versionCodeInput, setVersionCodeInput] = useState('');
    const [versionCode, setVersionCode] = useState<string | undefined>();
    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword] = useState<string | undefined>();
    const [startedAtRange, setStartedAtRange] = useState<[Dayjs, Dayjs] | null>(null);
    const [onlySoftFailure, setOnlySoftFailure] = useState(false);
    const [onlyErrorRoute, setOnlyErrorRoute] = useState(false);
    const [rerunningExecutionId, setRerunningExecutionId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const { data: definitionPage } = useWorkflowDefinitions({
        includePublic: true,
        page: 1,
        pageSize: 200,
    });
    const executionQuery = useMemo(
        () => ({
            workflowDefinitionId: selectedWorkflowDefinitionId,
            versionCode,
            triggerType: selectedTriggerType,
            status: selectedStatus,
            hasSoftFailure: onlySoftFailure ? true : undefined,
            hasErrorRoute: onlyErrorRoute ? true : undefined,
            keyword,
            startedAtFrom: startedAtRange?.[0]?.startOf('day').toISOString(),
            startedAtTo: startedAtRange?.[1]?.endOf('day').toISOString(),
            page,
            pageSize,
        }),
        [
            selectedWorkflowDefinitionId,
            versionCode,
            selectedTriggerType,
            selectedStatus,
            onlySoftFailure,
            onlyErrorRoute,
            keyword,
            startedAtRange,
            page,
            pageSize,
        ],
    );
    const { data: executionPage, isLoading } = useWorkflowExecutions(executionQuery);
    const rerunMutation = useRerunWorkflowExecution();
    const { data: executionDetail, isLoading: isDetailLoading } = useWorkflowExecutionDetail(
        selectedExecutionId || undefined,
    );

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

    const workflowDefinitionOptions = useMemo(
        () =>
            (definitionPage?.data || []).map((item) => ({
                label: `${item.name} (${item.workflowId})`,
                value: item.id,
            })),
        [definitionPage?.data],
    );

    const executionColumns = useMemo<ColumnsType<WorkflowExecutionWithRelations>>(
        () => [
            {
                title: '实例 ID',
                dataIndex: 'id',
                width: 220,
                render: (value: string) => value.slice(0, 8),
            },
            {
                title: '流程',
                key: 'workflow',
                width: 260,
                render: (_, record) =>
                    record.workflowVersion?.workflowDefinition?.name ||
                    record.workflowVersion?.workflowDefinition?.workflowId ||
                    '-',
            },
            {
                title: '版本',
                key: 'version',
                width: 120,
                render: (_, record) => record.workflowVersion?.versionCode || '-',
            },
            {
                title: '触发类型',
                dataIndex: 'triggerType',
                width: 120,
                render: (value: string) => <Tag>{value}</Tag>,
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: WorkflowExecutionStatus) => (
                    <Tag color={executionStatusColorMap[value] ?? 'default'}>{value}</Tag>
                ),
            },
            {
                title: '开始时间',
                dataIndex: 'startedAt',
                width: 180,
                render: (value?: Date | null) =>
                    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
            {
                title: '结束时间',
                dataIndex: 'completedAt',
                width: 180,
                render: (value?: Date | null) =>
                    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
            {
                title: '来源实例',
                dataIndex: 'sourceExecutionId',
                width: 120,
                render: (value?: string | null) => (value ? value.slice(0, 8) : '-'),
            },
            {
                title: '操作',
                key: 'actions',
                width: 200,
                render: (_, record) => (
                    <Space size={4}>
                        <Button type="link" onClick={() => setSelectedExecutionId(record.id)}>
                            查看详情
                        </Button>
                        <Button
                            type="link"
                            disabled={record.status !== 'FAILED'}
                            loading={rerunMutation.isPending && rerunningExecutionId === record.id}
                            onClick={() => handleRerun(record.id)}
                        >
                            失败重跑
                        </Button>
                    </Space>
                ),
            },
        ],
        [rerunMutation.isPending, rerunningExecutionId],
    );

    const nodeColumns = useMemo<ColumnsType<NodeExecutionDto>>(
        () => [
            {
                title: '节点 ID',
                dataIndex: 'nodeId',
                width: 180,
            },
            {
                title: '节点类型',
                dataIndex: 'nodeType',
                width: 180,
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: string) => (
                    <Tag color={nodeStatusColorMap[value] ?? 'default'}>{value}</Tag>
                ),
            },
            {
                title: '耗时(ms)',
                dataIndex: 'durationMs',
                width: 120,
                render: (value?: number | null) => value ?? '-',
            },
            {
                title: '尝试次数',
                key: 'attempts',
                width: 100,
                render: (_, record) => getNodeAttempts(record) ?? '-',
            },
            {
                title: '路径标记',
                key: 'routeHint',
                width: 160,
                render: (_, record) => {
                    const hint = getNodeRouteHint(record);
                    return hint ? <Tag color={hint.color}>{hint.label}</Tag> : '-';
                },
            },
            {
                title: '错误信息',
                dataIndex: 'errorMessage',
                render: (value?: string | null) => value || '-',
            },
        ],
        [],
    );

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <div>
                    <Title level={4} style={{ marginBottom: 0 }}>
                        流程运行中心
                    </Title>
                    <Text type="secondary">
                        查看流程运行实例、节点执行日志和失败原因。
                    </Text>
                </div>

                <Space wrap>
                    <Input.Search
                        allowClear
                        style={{ width: 220 }}
                        placeholder="按版本号筛选"
                        value={versionCodeInput}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            setVersionCodeInput(nextValue);
                            if (!nextValue.trim()) {
                                setVersionCode(undefined);
                                setPage(1);
                            }
                        }}
                        onSearch={(value) => {
                            const normalized = value.trim();
                            setVersionCode(normalized ? normalized : undefined);
                            setPage(1);
                        }}
                    />
                    <Input.Search
                        allowClear
                        style={{ width: 280 }}
                        placeholder="关键词（流程/版本/实例）"
                        value={keywordInput}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            setKeywordInput(nextValue);
                            if (!nextValue.trim()) {
                                setKeyword(undefined);
                                setPage(1);
                            }
                        }}
                        onSearch={(value) => {
                            const normalized = value.trim();
                            setKeyword(normalized ? normalized : undefined);
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        style={{ minWidth: 320 }}
                        placeholder="按流程筛选"
                        options={workflowDefinitionOptions}
                        value={selectedWorkflowDefinitionId}
                        onChange={(value) => {
                            setSelectedWorkflowDefinitionId(value);
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        style={{ width: 180 }}
                        placeholder="按状态筛选"
                        options={executionStatusOptions}
                        value={selectedStatus}
                        onChange={(value) => {
                            setSelectedStatus(value);
                            setPage(1);
                        }}
                    />
                    <Select
                        allowClear
                        style={{ width: 190 }}
                        placeholder="按触发类型筛选"
                        options={triggerTypeOptions}
                        value={selectedTriggerType}
                        onChange={(value) => {
                            setSelectedTriggerType(value);
                            setPage(1);
                        }}
                    />
                    <RangePicker
                        showTime
                        value={startedAtRange}
                        onChange={(value) => {
                            setStartedAtRange(value as [Dayjs, Dayjs] | null);
                            setPage(1);
                        }}
                    />
                    <Checkbox
                        checked={onlySoftFailure}
                        onChange={(event) => {
                            setOnlySoftFailure(event.target.checked);
                            setPage(1);
                        }}
                    >
                        仅软失败
                    </Checkbox>
                    <Checkbox
                        checked={onlyErrorRoute}
                        onChange={(event) => {
                            setOnlyErrorRoute(event.target.checked);
                            setPage(1);
                        }}
                    >
                        仅错误分支
                    </Checkbox>
                    <Button
                        onClick={() => {
                            setVersionCodeInput('');
                            setVersionCode(undefined);
                            setKeywordInput('');
                            setKeyword(undefined);
                            setSelectedWorkflowDefinitionId(undefined);
                            setSelectedStatus(undefined);
                            setSelectedTriggerType(undefined);
                            setStartedAtRange(null);
                            setOnlySoftFailure(false);
                            setOnlyErrorRoute(false);
                            setPage(1);
                            setPageSize(20);
                        }}
                    >
                        重置筛选
                    </Button>
                </Space>

                <Table
                    rowKey="id"
                    loading={isLoading}
                    columns={executionColumns}
                    dataSource={executionPage?.data || []}
                    pagination={{
                        current: executionPage?.page || page,
                        pageSize: executionPage?.pageSize || pageSize,
                        total: executionPage?.total || 0,
                        showSizeChanger: true,
                        onChange: (nextPage, nextPageSize) => {
                            setPage(nextPage);
                            setPageSize(nextPageSize);
                        },
                    }}
                    scroll={{ x: 1300 }}
                />
            </Space>

            <Drawer
                title={`运行详情 - ${selectedExecutionId?.slice(0, 8) || ''}`}
                width={1000}
                open={Boolean(selectedExecutionId)}
                onClose={() => setSelectedExecutionId(null)}
            >
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <Descriptions
                        column={2}
                        bordered
                        size="small"
                        items={[
                            {
                                key: 'workflow',
                                label: '流程',
                                children:
                                    executionDetail?.workflowVersion?.workflowDefinition?.name ||
                                    '-',
                            },
                            {
                                key: 'version',
                                label: '版本',
                                children: executionDetail?.workflowVersion?.versionCode || '-',
                            },
                            {
                                key: 'triggerType',
                                label: '触发类型',
                                children: executionDetail?.triggerType || '-',
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
                                        {executionDetail.status}
                                    </Tag>
                                ) : '-',
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

                    <Table
                        rowKey="id"
                        loading={isDetailLoading}
                        columns={nodeColumns}
                        dataSource={executionDetail?.nodeExecutions || []}
                        pagination={false}
                    />
                </Space>
            </Drawer>
        </Card>
    );
};
