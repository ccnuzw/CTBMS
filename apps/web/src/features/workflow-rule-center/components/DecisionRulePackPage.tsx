import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
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
    Switch,
    Table,
    Tag,
    Typography,
} from 'antd';
import {
    CreateDecisionRuleDto,
    CreateDecisionRulePackDto,
    DecisionRuleDto,
    DecisionRuleOperator,
    DecisionRulePackDto,
    UpdateDecisionRuleDto,
    UpdateDecisionRulePackDto,
    WorkflowTemplateSource,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
    useCreateDecisionRule,
    useCreateDecisionRulePack,
    useDecisionRulePackDetail,
    useDecisionRulePacks,
    useDeleteDecisionRule,
    useDeleteDecisionRulePack,
    useUpdateDecisionRule,
    useUpdateDecisionRulePack,
} from '../api';

const { Title, Text } = Typography;
const { TextArea, Search } = Input;

interface RuleFormValues {
    ruleCode: string;
    name: string;
    description?: string;
    fieldPath: string;
    operator: DecisionRuleOperator;
    expectedValueText?: string;
    weight: number;
    priority: number;
    isActive?: boolean;
}

const templateSourceOptions: { label: string; value: WorkflowTemplateSource }[] = [
    { label: '私有 (PRIVATE)', value: 'PRIVATE' },
    { label: '公共 (PUBLIC)', value: 'PUBLIC' },
];

const operatorOptions: { label: string; value: DecisionRuleOperator }[] = [
    { label: 'GT', value: 'GT' },
    { label: 'GTE', value: 'GTE' },
    { label: 'LT', value: 'LT' },
    { label: 'LTE', value: 'LTE' },
    { label: 'EQ', value: 'EQ' },
    { label: 'NEQ', value: 'NEQ' },
    { label: 'IN', value: 'IN' },
    { label: 'NOT_IN', value: 'NOT_IN' },
    { label: 'CONTAINS', value: 'CONTAINS' },
    { label: 'NOT_CONTAINS', value: 'NOT_CONTAINS' },
    { label: 'EXISTS', value: 'EXISTS' },
    { label: 'NOT_EXISTS', value: 'NOT_EXISTS' },
    { label: 'BETWEEN', value: 'BETWEEN' },
];

const parseExpectedValue = (expectedValueText?: string): unknown => {
    const normalized = expectedValueText?.trim();
    if (!normalized) {
        return undefined;
    }
    try {
        return JSON.parse(normalized);
    } catch {
        return normalized;
    }
};

const stringifyExpectedValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const displayExpectedValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '-';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

export const DecisionRulePackPage: React.FC = () => {
    const { message } = App.useApp();
    const [createForm] = Form.useForm<CreateDecisionRulePackDto>();
    const [updatePackForm] = Form.useForm<UpdateDecisionRulePackDto>();
    const [ruleForm] = Form.useForm<RuleFormValues>();

    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword] = useState<string | undefined>();
    const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const [createVisible, setCreateVisible] = useState(false);
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
    const [ruleVisible, setRuleVisible] = useState(false);
    const [editingRule, setEditingRule] = useState<DecisionRuleDto | null>(null);

    const { data: packPage, isLoading: isPackLoading } = useDecisionRulePacks({
        keyword,
        isActive: isActiveFilter,
        includePublic: true,
        page,
        pageSize,
    });
    const { data: selectedPack, isLoading: isPackDetailLoading } = useDecisionRulePackDetail(
        selectedPackId || undefined,
    );

    const createPackMutation = useCreateDecisionRulePack();
    const updatePackMutation = useUpdateDecisionRulePack();
    const removePackMutation = useDeleteDecisionRulePack();
    const createRuleMutation = useCreateDecisionRule();
    const updateRuleMutation = useUpdateDecisionRule();
    const removeRuleMutation = useDeleteDecisionRule();

    useEffect(() => {
        if (!selectedPack) {
            return;
        }
        updatePackForm.setFieldsValue({
            name: selectedPack.name,
            description: selectedPack.description || undefined,
            priority: selectedPack.priority,
            isActive: selectedPack.isActive,
        });
    }, [selectedPack, updatePackForm]);

    const packColumns = useMemo<ColumnsType<DecisionRulePackDto>>(
        () => [
            {
                title: '规则包编码',
                dataIndex: 'rulePackCode',
                width: 220,
            },
            {
                title: '名称',
                dataIndex: 'name',
                width: 220,
            },
            {
                title: '来源',
                dataIndex: 'templateSource',
                width: 110,
                render: (value: WorkflowTemplateSource) => (
                    <Tag color={value === 'PUBLIC' ? 'blue' : 'default'}>{value}</Tag>
                ),
            },
            {
                title: '状态',
                dataIndex: 'isActive',
                width: 100,
                render: (value: boolean) => (
                    <Tag color={value ? 'green' : 'red'}>{value ? 'ACTIVE' : 'INACTIVE'}</Tag>
                ),
            },
            {
                title: '优先级',
                dataIndex: 'priority',
                width: 90,
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
                width: 160,
                render: (_, record) => (
                    <Space size={4}>
                        <Button type="link" onClick={() => setSelectedPackId(record.id)}>
                            查看详情
                        </Button>
                        <Popconfirm
                            title="确认停用该规则包？"
                            onConfirm={() => handleRemovePack(record.id)}
                            disabled={!record.isActive}
                        >
                            <Button type="link" danger disabled={!record.isActive}>
                                停用
                            </Button>
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [],
    );

    const ruleColumns = useMemo<ColumnsType<DecisionRuleDto>>(
        () => [
            {
                title: '规则编码',
                dataIndex: 'ruleCode',
                width: 180,
            },
            {
                title: '名称',
                dataIndex: 'name',
                width: 180,
            },
            {
                title: '字段路径',
                dataIndex: 'fieldPath',
                width: 180,
            },
            {
                title: '操作符',
                dataIndex: 'operator',
                width: 120,
                render: (value: string) => <Tag>{value}</Tag>,
            },
            {
                title: '预期值',
                dataIndex: 'expectedValue',
                render: (value: unknown) => displayExpectedValue(value),
            },
            {
                title: '权重',
                dataIndex: 'weight',
                width: 80,
            },
            {
                title: '状态',
                dataIndex: 'isActive',
                width: 100,
                render: (value: boolean) => (
                    <Tag color={value ? 'green' : 'red'}>{value ? 'ACTIVE' : 'INACTIVE'}</Tag>
                ),
            },
            {
                title: '操作',
                key: 'actions',
                width: 140,
                render: (_, record) => (
                    <Space size={4}>
                        <Button type="link" onClick={() => handleEditRule(record)}>
                            编辑
                        </Button>
                        <Popconfirm
                            title="确认停用该规则？"
                            onConfirm={() => handleRemoveRule(record.id)}
                            disabled={!record.isActive}
                        >
                            <Button type="link" danger disabled={!record.isActive}>
                                停用
                            </Button>
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [selectedPackId],
    );

    const handleCreatePack = async () => {
        try {
            const values = await createForm.validateFields();
            await createPackMutation.mutateAsync(values);
            message.success('规则包创建成功');
            setCreateVisible(false);
            createForm.resetFields();
            setPage(1);
        } catch (error) {
            if (error instanceof Error && error.message.includes('out of date')) {
                return;
            }
            message.error(getErrorMessage(error));
        }
    };

    const handleUpdatePack = async () => {
        if (!selectedPackId) {
            return;
        }

        try {
            const values = await updatePackForm.validateFields();
            await updatePackMutation.mutateAsync({
                packId: selectedPackId,
                payload: values,
            });
            message.success('规则包更新成功');
        } catch (error) {
            if (error instanceof Error && error.message.includes('out of date')) {
                return;
            }
            message.error(getErrorMessage(error));
        }
    };

    const handleRemovePack = async (packId: string) => {
        try {
            await removePackMutation.mutateAsync(packId);
            message.success('规则包已停用');
            if (selectedPackId === packId) {
                setSelectedPackId(null);
            }
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    const handleOpenCreateRule = () => {
        setEditingRule(null);
        ruleForm.setFieldsValue({
            weight: 1,
            priority: 0,
            operator: 'EQ',
            isActive: true,
        });
        setRuleVisible(true);
    };

    const handleEditRule = (rule: DecisionRuleDto) => {
        setEditingRule(rule);
        ruleForm.setFieldsValue({
            ruleCode: rule.ruleCode,
            name: rule.name,
            description: rule.description || undefined,
            fieldPath: rule.fieldPath,
            operator: rule.operator,
            expectedValueText: stringifyExpectedValue(rule.expectedValue),
            weight: rule.weight,
            priority: rule.priority,
            isActive: rule.isActive,
        });
        setRuleVisible(true);
    };

    const handleSaveRule = async () => {
        if (!selectedPackId) {
            return;
        }

        try {
            const values = await ruleForm.validateFields();
            const payloadBase = {
                name: values.name,
                description: values.description,
                fieldPath: values.fieldPath,
                operator: values.operator,
                expectedValue: parseExpectedValue(values.expectedValueText),
                weight: values.weight,
                priority: values.priority,
            };

            if (editingRule) {
                const payload: UpdateDecisionRuleDto = {
                    ...payloadBase,
                    isActive: values.isActive,
                };
                await updateRuleMutation.mutateAsync({
                    packId: selectedPackId,
                    ruleId: editingRule.id,
                    payload,
                });
                message.success('规则更新成功');
            } else {
                const payload: CreateDecisionRuleDto = {
                    ruleCode: values.ruleCode,
                    ...payloadBase,
                };
                await createRuleMutation.mutateAsync({
                    packId: selectedPackId,
                    payload,
                });
                message.success('规则创建成功');
            }

            setRuleVisible(false);
            setEditingRule(null);
            ruleForm.resetFields();
        } catch (error) {
            if (error instanceof Error && error.message.includes('out of date')) {
                return;
            }
            message.error(getErrorMessage(error));
        }
    };

    const handleRemoveRule = async (ruleId: string) => {
        if (!selectedPackId) {
            return;
        }
        try {
            await removeRuleMutation.mutateAsync({
                packId: selectedPackId,
                ruleId,
            });
            message.success('规则已停用');
        } catch (error) {
            message.error(getErrorMessage(error));
        }
    };

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                        <Title level={4} style={{ marginBottom: 0 }}>
                            规则中心
                        </Title>
                        <Text type="secondary">
                            管理决策规则包与规则明细，供工作流规则节点绑定与执行。
                        </Text>
                    </div>
                    <Button type="primary" onClick={() => setCreateVisible(true)}>
                        新建规则包
                    </Button>
                </Space>

                <Space wrap>
                    <Search
                        allowClear
                        style={{ width: 320 }}
                        placeholder="按规则包编码/名称搜索"
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
                        style={{ width: 180 }}
                        placeholder="按状态筛选"
                        value={isActiveFilter}
                        options={[
                            { label: 'ACTIVE', value: true },
                            { label: 'INACTIVE', value: false },
                        ]}
                        onChange={(value) => {
                            setIsActiveFilter(value);
                            setPage(1);
                        }}
                    />
                    <Button
                        onClick={() => {
                            setKeywordInput('');
                            setKeyword(undefined);
                            setIsActiveFilter(undefined);
                            setPage(1);
                            setPageSize(20);
                        }}
                    >
                        重置筛选
                    </Button>
                </Space>

                <Table
                    rowKey="id"
                    loading={isPackLoading}
                    columns={packColumns}
                    dataSource={packPage?.data || []}
                    pagination={{
                        current: packPage?.page || page,
                        pageSize: packPage?.pageSize || pageSize,
                        total: packPage?.total || 0,
                        showSizeChanger: true,
                        onChange: (nextPage, nextPageSize) => {
                            setPage(nextPage);
                            setPageSize(nextPageSize);
                        },
                    }}
                    scroll={{ x: 1200 }}
                />
            </Space>

            <Drawer
                title="新建规则包"
                open={createVisible}
                width={560}
                onClose={() => {
                    setCreateVisible(false);
                    createForm.resetFields();
                }}
                extra={
                    <Space>
                        <Button
                            onClick={() => {
                                setCreateVisible(false);
                                createForm.resetFields();
                            }}
                        >
                            取消
                        </Button>
                        <Button type="primary" loading={createPackMutation.isPending} onClick={handleCreatePack}>
                            创建
                        </Button>
                    </Space>
                }
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    initialValues={{
                        templateSource: 'PRIVATE',
                        priority: 0,
                    }}
                >
                    <Form.Item
                        label="规则包编码"
                        name="rulePackCode"
                        rules={[
                            { required: true, message: '请输入规则包编码' },
                            { pattern: /^[a-zA-Z0-9_-]{3,100}$/, message: '仅支持字母、数字、下划线和中划线' },
                        ]}
                    >
                        <Input placeholder="例如: corn_baseline_rule_pack_v1" />
                    </Form.Item>
                    <Form.Item label="规则包名称" name="name" rules={[{ required: true, message: '请输入规则包名称' }]}>
                        <Input placeholder="例如: 玉米基线规则包" />
                    </Form.Item>
                    <Form.Item label="模板来源" name="templateSource" rules={[{ required: true }]}>
                        <Select options={templateSourceOptions} />
                    </Form.Item>
                    <Form.Item label="优先级" name="priority" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} max={1000} />
                    </Form.Item>
                    <Form.Item label="描述" name="description">
                        <TextArea rows={4} placeholder="规则包说明（可选）" />
                    </Form.Item>
                </Form>
            </Drawer>

            <Drawer
                title={`规则包详情 - ${selectedPack?.name || ''}`}
                open={Boolean(selectedPackId)}
                width={980}
                onClose={() => {
                    setSelectedPackId(null);
                    setRuleVisible(false);
                    setEditingRule(null);
                }}
                extra={
                    <Space>
                        <Button onClick={handleOpenCreateRule} disabled={!selectedPackId}>
                            新增规则
                        </Button>
                        <Button
                            type="primary"
                            loading={updatePackMutation.isPending}
                            onClick={handleUpdatePack}
                            disabled={!selectedPack}
                        >
                            保存规则包
                        </Button>
                    </Space>
                }
            >
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <Form form={updatePackForm} layout="vertical">
                        <Space align="start" style={{ width: '100%' }}>
                            <Form.Item
                                label="规则包名称"
                                name="name"
                                style={{ flex: 1 }}
                                rules={[{ required: true, message: '请输入规则包名称' }]}
                            >
                                <Input />
                            </Form.Item>
                            <Form.Item
                                label="优先级"
                                name="priority"
                                style={{ width: 140 }}
                                rules={[{ required: true, message: '请输入优先级' }]}
                            >
                                <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item label="启用状态" name="isActive" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Space>
                        <Form.Item label="描述" name="description">
                            <TextArea rows={2} />
                        </Form.Item>
                    </Form>

                    <Table
                        rowKey="id"
                        loading={isPackDetailLoading}
                        columns={ruleColumns}
                        dataSource={selectedPack?.rules || []}
                        pagination={false}
                        scroll={{ x: 1200 }}
                    />
                </Space>
            </Drawer>

            <Drawer
                title={editingRule ? `编辑规则 - ${editingRule.ruleCode}` : '新增规则'}
                open={ruleVisible}
                width={560}
                onClose={() => {
                    setRuleVisible(false);
                    setEditingRule(null);
                    ruleForm.resetFields();
                }}
                extra={
                    <Space>
                        <Button
                            onClick={() => {
                                setRuleVisible(false);
                                setEditingRule(null);
                                ruleForm.resetFields();
                            }}
                        >
                            取消
                        </Button>
                        <Button
                            type="primary"
                            loading={createRuleMutation.isPending || updateRuleMutation.isPending}
                            onClick={handleSaveRule}
                        >
                            保存
                        </Button>
                    </Space>
                }
            >
                <Form form={ruleForm} layout="vertical">
                    <Form.Item
                        label="规则编码"
                        name="ruleCode"
                        rules={[
                            { required: !editingRule, message: '请输入规则编码' },
                            { pattern: /^[a-zA-Z0-9_.-]{2,80}$/, message: '编码格式不正确' },
                        ]}
                    >
                        <Input disabled={Boolean(editingRule)} />
                    </Form.Item>
                    <Form.Item label="规则名称" name="name" rules={[{ required: true, message: '请输入规则名称' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label="字段路径" name="fieldPath" rules={[{ required: true, message: '请输入字段路径' }]}>
                        <Input placeholder="例如: confidence 或 branches.n1.hitScore" />
                    </Form.Item>
                    <Form.Item label="操作符" name="operator" rules={[{ required: true }]}>
                        <Select options={operatorOptions} />
                    </Form.Item>
                    <Form.Item label="预期值" name="expectedValueText">
                        <TextArea
                            rows={3}
                            placeholder='支持 JSON（如 60、[1,2]、{"min":10}），非 JSON 按字符串处理'
                        />
                    </Form.Item>
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            label="权重"
                            name="weight"
                            style={{ width: 140 }}
                            rules={[{ required: true, message: '请输入权重' }]}
                        >
                            <InputNumber min={1} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                            label="优先级"
                            name="priority"
                            style={{ width: 140 }}
                            rules={[{ required: true, message: '请输入优先级' }]}
                        >
                            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                        </Form.Item>
                        {editingRule ? (
                            <Form.Item label="启用状态" name="isActive" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        ) : null}
                    </Space>
                    <Form.Item label="描述" name="description">
                        <TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Drawer>
        </Card>
    );
};
