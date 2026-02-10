import React, { useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
    Alert,
    App,
    Button,
    Card,
    Drawer,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import {
    CreateWorkflowDefinitionDto,
    WorkflowDefinitionDto,
    WorkflowMode,
    WorkflowNodeOnErrorPolicy,
    WorkflowUsageMethod,
    WorkflowValidationResult,
    WorkflowVersionDto,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
    useCreateWorkflowVersion,
    useCreateWorkflowDefinition,
    usePublishWorkflowVersion,
    useTriggerWorkflowExecution,
    useValidateWorkflowDsl,
    useWorkflowDefinitions,
    useWorkflowVersions,
} from '../api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CreateWorkflowDefinitionFormValues extends CreateWorkflowDefinitionDto {
    defaultTimeoutMs?: number;
    defaultRetryCount?: number;
    defaultRetryBackoffMs?: number;
    defaultOnError?: WorkflowNodeOnErrorPolicy;
}

const modeOptions: { label: string; value: WorkflowMode }[] = [
    { label: '线性 (LINEAR)', value: 'LINEAR' },
    { label: '并行 (DAG)', value: 'DAG' },
    { label: '辩论 (DEBATE)', value: 'DEBATE' },
];

const usageMethodOptions: { label: string; value: WorkflowUsageMethod }[] = [
    { label: '后台自动 (HEADLESS)', value: 'HEADLESS' },
    { label: '人机协同 (COPILOT)', value: 'COPILOT' },
    { label: '按需触发 (ON_DEMAND)', value: 'ON_DEMAND' },
];

const runtimeOnErrorOptions: { label: string; value: WorkflowNodeOnErrorPolicy }[] = [
    { label: '失败即中断 (FAIL_FAST)', value: 'FAIL_FAST' },
    { label: '失败后继续 (CONTINUE)', value: 'CONTINUE' },
    { label: '失败路由错误分支 (ROUTE_TO_ERROR)', value: 'ROUTE_TO_ERROR' },
];

const definitionStatusColorMap: Record<string, string> = {
    DRAFT: 'default',
    ACTIVE: 'green',
    ARCHIVED: 'red',
};

const versionStatusColorMap: Record<string, string> = {
    DRAFT: 'default',
    PUBLISHED: 'green',
    ARCHIVED: 'orange',
};

const buildInitialDslSnapshot = (
    values: CreateWorkflowDefinitionFormValues,
    runtimePolicy: {
        timeoutMs: number;
        retryCount: number;
        retryBackoffMs: number;
        onError: WorkflowNodeOnErrorPolicy;
    },
) => {
    return {
        workflowId: values.workflowId,
        name: values.name,
        mode: values.mode,
        usageMethod: values.usageMethod,
        version: '1.0.0',
        status: 'DRAFT' as const,
        templateSource: 'PRIVATE' as const,
        nodes: [
            {
                id: 'n_trigger',
                type: 'manual-trigger',
                name: '手工触发',
                enabled: true,
                config: {},
                runtimePolicy,
            },
            {
                id: 'n_notify',
                type: 'notify',
                name: '结果输出',
                enabled: true,
                config: { channels: ['DASHBOARD'] },
                runtimePolicy,
            },
        ],
        edges: [
            {
                id: 'e_trigger_notify',
                from: 'n_trigger',
                to: 'n_notify',
                edgeType: 'control-edge' as const,
            },
        ],
        runPolicy: {
            nodeDefaults: runtimePolicy,
        },
    };
};

export const WorkflowDefinitionPage: React.FC = () => {
    const { message } = App.useApp();
    const [form] = Form.useForm<CreateWorkflowDefinitionFormValues>();
    const [createVisible, setCreateVisible] = useState(false);
    const [versionVisible, setVersionVisible] = useState(false);
    const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinitionDto | null>(null);
    const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
    const [runningVersionId, setRunningVersionId] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);

    const { data: definitionPage, isLoading: isDefinitionLoading } = useWorkflowDefinitions({
        includePublic: true,
        page: 1,
        pageSize: 100,
    });
    const { data: versions, isLoading: isVersionLoading } = useWorkflowVersions(selectedDefinition?.id);
    const createMutation = useCreateWorkflowDefinition();
    const createVersionMutation = useCreateWorkflowVersion();
    const publishMutation = usePublishWorkflowVersion();
    const triggerExecutionMutation = useTriggerWorkflowExecution();
    const validateDslMutation = useValidateWorkflowDsl();

    const definitionColumns = useMemo<ColumnsType<WorkflowDefinitionDto>>(
        () => [
            {
                title: '流程名称',
                dataIndex: 'name',
                width: 240,
            },
            {
                title: '流程编码',
                dataIndex: 'workflowId',
                width: 220,
            },
            {
                title: '模式',
                dataIndex: 'mode',
                width: 120,
                render: (value: WorkflowMode) => <Tag color="blue">{value}</Tag>,
            },
            {
                title: '使用方式',
                dataIndex: 'usageMethod',
                width: 160,
                render: (value: WorkflowUsageMethod) => <Tag>{value}</Tag>,
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: string) => (
                    <Tag color={definitionStatusColorMap[value] ?? 'default'}>{value}</Tag>
                ),
            },
            {
                title: '最新版本',
                dataIndex: 'latestVersionCode',
                width: 120,
                render: (value?: string | null) => value || '-',
            },
            {
                title: '更新时间',
                dataIndex: 'updatedAt',
                width: 180,
                render: (value?: Date) =>
                    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
            {
                title: '操作',
                key: 'actions',
                fixed: 'right',
                width: 140,
                render: (_: unknown, record: WorkflowDefinitionDto) => (
                    <Button
                        type="link"
                        onClick={() => {
                            setSelectedDefinition(record);
                            setVersionVisible(true);
                        }}
                    >
                        查看版本
                    </Button>
                ),
            },
        ],
        [],
    );

    const versionColumns = useMemo<ColumnsType<WorkflowVersionDto>>(
        () => [
            {
                title: '版本号',
                dataIndex: 'versionCode',
                width: 120,
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: string) => (
                    <Tag color={versionStatusColorMap[value] ?? 'default'}>{value}</Tag>
                ),
            },
            {
                title: '变更说明',
                dataIndex: 'changelog',
                render: (value?: string | null) => value || '-',
            },
            {
                title: '创建时间',
                dataIndex: 'createdAt',
                width: 180,
                render: (value?: Date) =>
                    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
            {
                title: '发布时间',
                dataIndex: 'publishedAt',
                width: 180,
                render: (value?: Date | null) =>
                    value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-',
            },
            {
                title: '操作',
                key: 'actions',
                width: 140,
                render: (_: unknown, record: WorkflowVersionDto) => {
                    const isPublishing = publishMutation.isPending && publishingVersionId === record.id;
                    const isRunning = triggerExecutionMutation.isPending && runningVersionId === record.id;
                    const canPublish = record.status === 'DRAFT' && Boolean(selectedDefinition?.id);
                    const canRun = record.status === 'PUBLISHED' && Boolean(selectedDefinition?.id);
                    return (
                        <Space size={4}>
                            <Popconfirm
                                title="确认发布该版本？"
                                onConfirm={() => handlePublish(record)}
                                disabled={!canPublish}
                            >
                                <Button type="link" disabled={!canPublish} loading={isPublishing}>
                                    发布版本
                                </Button>
                            </Popconfirm>
                            <Popconfirm
                                title="确认触发运行该版本？"
                                onConfirm={() => handleTriggerExecution(record)}
                                disabled={!canRun}
                            >
                                <Button type="link" disabled={!canRun} loading={isRunning}>
                                    触发运行
                                </Button>
                            </Popconfirm>
                        </Space>
                    );
                },
            },
        ],
        [
            publishMutation.isPending,
            publishingVersionId,
            selectedDefinition?.id,
            triggerExecutionMutation.isPending,
            runningVersionId,
        ],
    );

    const handleCreate = async () => {
        try {
            const values = await form.validateFields();
            const {
                defaultTimeoutMs,
                defaultRetryCount,
                defaultRetryBackoffMs,
                defaultOnError,
                ...definitionPayload
            } = values;

            const runtimePolicy = {
                timeoutMs: defaultTimeoutMs ?? 30000,
                retryCount: defaultRetryCount ?? 1,
                retryBackoffMs: defaultRetryBackoffMs ?? 2000,
                onError: defaultOnError ?? 'FAIL_FAST',
            };

            await createMutation.mutateAsync({
                ...definitionPayload,
                templateSource: 'PRIVATE',
                dslSnapshot: buildInitialDslSnapshot(values, runtimePolicy),
            });
            message.success('流程创建成功');
            setCreateVisible(false);
            form.resetFields();
        } catch (error) {
            if (error instanceof Error && error.message.includes('out of date')) {
                return;
            }
            message.error(getErrorMessage(error));
        }
    };

    const handlePublish = async (version: WorkflowVersionDto) => {
        if (!selectedDefinition?.id) {
            return;
        }
        try {
            setPublishingVersionId(version.id);
            await publishMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                payload: { versionId: version.id },
            });
            message.success(`版本 ${version.versionCode} 已发布`);
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setPublishingVersionId(null);
        }
    };

    const handleCreateDraftVersion = async () => {
        if (!selectedDefinition?.id) {
            return;
        }

        const latestVersion = versions?.[0];
        if (!latestVersion) {
            message.warning('暂无可复制版本');
            return;
        }

        try {
            await createVersionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                payload: {
                    dslSnapshot: latestVersion.dslSnapshot,
                    changelog: `基于 ${latestVersion.versionCode} 创建草稿`,
                },
            });
            message.success('草稿版本创建成功');
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    const handleValidateLatestForPublish = async () => {
        const latestVersion = versions?.[0];
        if (!latestVersion) {
            message.warning('暂无可校验版本');
            return;
        }

        try {
            const result = await validateDslMutation.mutateAsync({
                dslSnapshot: latestVersion.dslSnapshot,
                stage: 'PUBLISH',
            });
            setValidationResult(result);
            if (result.valid) {
                message.success('发布校验通过');
            } else {
                message.warning(`发布校验未通过，发现 ${result.issues.length} 项问题`);
            }
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    const handleTriggerExecution = async (version: WorkflowVersionDto) => {
        if (!selectedDefinition?.id) {
            return;
        }
        try {
            setRunningVersionId(version.id);
            const execution = await triggerExecutionMutation.mutateAsync({
                workflowDefinitionId: selectedDefinition.id,
                workflowVersionId: version.id,
            });
            message.success(`运行完成，实例 ID: ${execution.id}`);
        } catch (error) {
            message.error(getErrorMessage(error));
        } finally {
            setRunningVersionId(null);
        }
    };

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                        <Title level={4} style={{ marginBottom: 0 }}>
                            工作流定义管理
                        </Title>
                        <Text type="secondary">
                            第一阶段能力：流程定义、版本快照、版本发布。
                        </Text>
                    </div>
                    <Button type="primary" onClick={() => setCreateVisible(true)}>
                        新建流程
                    </Button>
                </Space>

                <Table
                    rowKey="id"
                    loading={isDefinitionLoading}
                    columns={definitionColumns}
                    dataSource={definitionPage?.data || []}
                    pagination={false}
                    scroll={{ x: 1200 }}
                />
            </Space>

            <Drawer
                title="新建流程"
                open={createVisible}
                width={560}
                onClose={() => {
                    setCreateVisible(false);
                    form.resetFields();
                }}
                extra={
                    <Space>
                        <Button
                            onClick={() => {
                                setCreateVisible(false);
                                form.resetFields();
                            }}
                        >
                            取消
                        </Button>
                        <Button type="primary" loading={createMutation.isPending} onClick={handleCreate}>
                            创建
                        </Button>
                    </Space>
                }
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        mode: 'LINEAR',
                        usageMethod: 'COPILOT',
                        defaultTimeoutMs: 30000,
                        defaultRetryCount: 1,
                        defaultRetryBackoffMs: 2000,
                        defaultOnError: 'FAIL_FAST',
                    }}
                >
                    <Form.Item
                        label="流程编码"
                        name="workflowId"
                        rules={[
                            { required: true, message: '请输入流程编码' },
                            { pattern: /^[a-zA-Z0-9_-]{3,100}$/, message: '仅支持字母、数字、下划线和中划线' },
                        ]}
                    >
                        <Input placeholder="例如: wf_corn_morning_linear" />
                    </Form.Item>
                    <Form.Item label="流程名称" name="name" rules={[{ required: true, message: '请输入流程名称' }]}>
                        <Input placeholder="例如: 玉米晨间线性决策" />
                    </Form.Item>
                    <Form.Item label="编排模式" name="mode" rules={[{ required: true }]}>
                        <Select options={modeOptions} />
                    </Form.Item>
                    <Form.Item label="使用方式" name="usageMethod" rules={[{ required: true }]}>
                        <Select options={usageMethodOptions} />
                    </Form.Item>
                    <Form.Item label="默认超时(ms)" name="defaultTimeoutMs" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={1000} max={120000} step={1000} />
                    </Form.Item>
                    <Form.Item label="默认重试次数" name="defaultRetryCount" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} max={5} step={1} />
                    </Form.Item>
                    <Form.Item
                        label="默认重试间隔(ms)"
                        name="defaultRetryBackoffMs"
                        rules={[{ required: true }]}
                    >
                        <InputNumber style={{ width: '100%' }} min={0} max={60000} step={500} />
                    </Form.Item>
                    <Form.Item label="默认异常策略" name="defaultOnError" rules={[{ required: true }]}>
                        <Select options={runtimeOnErrorOptions} />
                    </Form.Item>
                    <Form.Item label="描述" name="description">
                        <TextArea rows={4} placeholder="流程说明（可选）" />
                    </Form.Item>
                </Form>
            </Drawer>

            <Drawer
                title={`版本列表 - ${selectedDefinition?.name || ''}`}
                open={versionVisible}
                width={920}
                extra={
                    <Space>
                        <Button
                            onClick={handleValidateLatestForPublish}
                            loading={validateDslMutation.isPending}
                            disabled={!versions?.length}
                        >
                            校验最新版本
                        </Button>
                        <Button
                            type="primary"
                            onClick={handleCreateDraftVersion}
                            loading={createVersionMutation.isPending}
                            disabled={!versions?.length}
                        >
                            新建草稿版本
                        </Button>
                    </Space>
                }
                onClose={() => {
                    setVersionVisible(false);
                    setSelectedDefinition(null);
                    setValidationResult(null);
                }}
            >
                {validationResult ? (
                    <Alert
                        style={{ marginBottom: 12 }}
                        showIcon
                        type={validationResult.valid ? 'success' : 'warning'}
                        message={
                            validationResult.valid
                                ? '发布校验通过'
                                : `发布校验未通过（${validationResult.issues.length} 项）`
                        }
                        description={
                            validationResult.valid ? undefined : validationResult.issues
                                .slice(0, 5)
                                .map((issue) => `${issue.code}: ${issue.message}`)
                                .join('；')
                        }
                    />
                ) : null}
                <Table
                    rowKey="id"
                    loading={isVersionLoading}
                    columns={versionColumns}
                    dataSource={versions || []}
                    pagination={false}
                />
            </Drawer>
        </Card>
    );
};
