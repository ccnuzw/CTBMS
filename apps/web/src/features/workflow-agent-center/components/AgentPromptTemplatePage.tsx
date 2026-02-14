import React, { useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
    App,
    Button,
    Card,
    Drawer,
    Form,
    Input,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
    Descriptions,
    Tabs,
} from 'antd';
import {
    AgentPromptTemplateDto,
    AgentRoleType,
    CreateAgentPromptTemplateDto,
} from '@packages/types';
import dayjs from 'dayjs';
import { getErrorMessage } from '../../../api/client';
import {
    useAgentPromptTemplates,
    useCreateAgentPromptTemplate,
    useUpdateAgentPromptTemplate,
} from '../api';
import { AGENT_ROLE_OPTIONS, getAgentRoleLabel, getAgentStatusLabel } from '../constants';
import { AgentPromptTemplateHistory } from './AgentPromptTemplateHistory';

const { Title } = Typography;

export const AgentPromptTemplatePage: React.FC = () => {
    const { message } = App.useApp();
    const [createForm] = Form.useForm<CreateAgentPromptTemplateDto>();
    const [editForm] = Form.useForm<any>();
    const [searchParams, setSearchParams] = useState<{
        keyword?: string;
        isActive?: boolean;
        roleType?: AgentRoleType;
        page: number;
        pageSize: number;
    }>({
        page: 1,
        pageSize: 20,
        isActive: true,
    });

    const { data, isLoading, refetch } = useAgentPromptTemplates({ ...searchParams, includePublic: true });

    const [visible, setVisible] = useState(false);
    const [editVisible, setEditVisible] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<AgentPromptTemplateDto | null>(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<AgentPromptTemplateDto | null>(null);

    const createMutation = useCreateAgentPromptTemplate();
    const updateMutation = useUpdateAgentPromptTemplate();

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            // Handle JSON fields
            let variables, guardrails;
            try {
                variables = values.variables ? JSON.parse(values.variables as any) : undefined;
                guardrails = values.guardrails ? JSON.parse(values.guardrails as any) : undefined;
            } catch (e) {
                message.error('JSON 格式错误');
                return;
            }

            await createMutation.mutateAsync({
                ...values,
                variables,
                guardrails,
            });
            message.success('创建成功');
            setVisible(false);
            createForm.resetFields();
            refetch();
        } catch (error) {
            message.error(getErrorMessage(error) || '创建失败');
        }
    };

    const handleEdit = async () => {
        if (!editingTemplate) return;
        try {
            const values = await editForm.validateFields();
            // Handle JSON fields
            let variables, guardrails;
            try {
                variables = values.variablesText ? JSON.parse(values.variablesText) : undefined;
                guardrails = values.guardrailsText ? JSON.parse(values.guardrailsText) : undefined;
            } catch (e) {
                message.error('JSON 格式错误');
                return;
            }

            await updateMutation.mutateAsync({
                id: editingTemplate.id,
                payload: {
                    ...values,
                    variables,
                    guardrails,
                }
            });
            message.success('更新成功');
            setEditVisible(false);
            setEditingTemplate(null);
            refetch();
        } catch (error) {
            message.error(getErrorMessage(error) || '更新失败');
        }
    };

    const columns = useMemo<ColumnsType<AgentPromptTemplateDto>>(
        () => [
            { title: '编码', dataIndex: 'promptCode', width: 200 },
            { title: '名称', dataIndex: 'name', width: 200 },
            {
                title: '角色',
                dataIndex: 'roleType',
                width: 150,
                render: (v: AgentRoleType) => <Tag>{getAgentRoleLabel(v)}</Tag>,
            },
            { title: '输出 Schema', dataIndex: 'outputSchemaCode', width: 150 },
            { title: '版本', dataIndex: 'version', width: 80, render: (v) => <Tag>v{v}</Tag> },
            {
                title: '状态',
                dataIndex: 'isActive',
                width: 100,
                render: (v) => <Tag color={v ? 'green' : 'red'}>{getAgentStatusLabel(v)}</Tag>,
            },
            {
                title: '更新时间',
                dataIndex: 'updatedAt',
                width: 180,
                render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
            },
            {
                title: '操作',
                key: 'actions',
                width: 200,
                render: (_, record) => (
                    <Space>
                        <Button type="link" onClick={() => {
                            setSelectedTemplate(record);
                            setDrawerVisible(true);
                        }}>详情</Button>
                        <Button type="link" onClick={() => {
                            setEditingTemplate(record);
                            editForm.setFieldsValue({
                                name: record.name,
                                roleType: record.roleType,
                                systemPrompt: record.systemPrompt,
                                userPromptTemplate: record.userPromptTemplate,
                                outputFormat: record.outputFormat,
                                outputSchemaCode: record.outputSchemaCode,
                                isActive: record.isActive,
                                variablesText: JSON.stringify(record.variables || {}, null, 2),
                                guardrailsText: JSON.stringify(record.guardrails || {}, null, 2),
                            });
                            setEditVisible(true);
                        }}>编辑</Button>
                        {/* Implement delete with popconfirm if needed */}
                    </Space>
                ),
            },
        ],
        [],
    );

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Title level={4}>智能体提示词模板管理</Title>
                    <Space>
                        <Input.Search
                            placeholder="搜索编码/名称"
                            onSearch={(v) => setSearchParams((p) => ({ ...p, keyword: v, page: 1 }))}
                            style={{ width: 240 }}
                        />
                        <Button type="primary" onClick={() => setVisible(true)}>
                            新建提示词模板
                        </Button>
                    </Space>
                </Space>

                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={data?.data || []}
                    loading={isLoading}
                    pagination={{
                        current: data?.page,
                        pageSize: data?.pageSize,
                        total: data?.total,
                        onChange: (page, pageSize) => setSearchParams((p) => ({ ...p, page, pageSize })),
                    }}
                />
            </Space>

            <Drawer
                title="新建提示词模板"
                width={720}
                open={visible}
                onClose={() => setVisible(false)}
                extra={
                    <Space>
                        <Button onClick={() => setVisible(false)}>取消</Button>
                        <Button type="primary" onClick={handleCreate} loading={createMutation.isPending}>提交</Button>
                    </Space>
                }
            >
                <Form form={createForm} layout="vertical" initialValues={{
                    roleType: 'ANALYST',
                    outputFormat: 'json',
                    templateSource: 'PRIVATE',
                    variables: '{}',
                    guardrails: '{}',
                }}>
                    <Form.Item name="promptCode" label="提示词编码" rules={[{ required: true }]}>
                        <Input placeholder="例如: MARKET_ANALYSIS_PROMPT_V1" />
                    </Form.Item>
                    <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="roleType" label="适用角色" rules={[{ required: true }]}>
                        <Select options={AGENT_ROLE_OPTIONS.map((r) => ({ label: getAgentRoleLabel(r), value: r }))} />
                    </Form.Item>
                    <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true }]}>
                        <Input.TextArea rows={6} />
                    </Form.Item>
                    <Form.Item name="userPromptTemplate" label="用户提示模板" rules={[{ required: true }]}>
                        <Input.TextArea rows={6} />
                    </Form.Item>
                    <Form.Item name="outputSchemaCode" label="输出 Schema 编码">
                        <Input placeholder="关联的输出 Schema 编码" />
                    </Form.Item>

                    <Form.Item name="variables" label="变量定义 (JSON)">
                        <Input.TextArea rows={4} />
                    </Form.Item>
                    <Form.Item name="guardrails" label="防护规则 (JSON)">
                        <Input.TextArea rows={4} placeholder="例如: { 'no_hallucination': true }" />
                    </Form.Item>
                    <Form.Item name="templateSource" label="来源" hidden>
                        <Input />
                    </Form.Item>
                </Form>
            </Drawer>

            <Drawer
                title={`编辑提示词模板 - ${editingTemplate?.promptCode}`}
                width={800}
                open={editVisible}
                onClose={() => setEditVisible(false)}
                extra={
                    <Space>
                        <Button onClick={() => setEditVisible(false)}>关闭</Button>
                        <Button type="primary" onClick={handleEdit} loading={updateMutation.isPending}>保存</Button>
                    </Space>
                }
            >
                <Tabs
                    defaultActiveKey="edit"
                    items={[
                        {
                            key: 'edit',
                            label: '编辑内容',
                            children: (
                                <Form form={editForm} layout="vertical">
                                    <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item name="roleType" label="适用角色" rules={[{ required: true }]}>
                                        <Select options={AGENT_ROLE_OPTIONS.map((r) => ({ label: getAgentRoleLabel(r), value: r }))} />
                                    </Form.Item>
                                    <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true }]}>
                                        <Input.TextArea rows={6} />
                                    </Form.Item>
                                    <Form.Item name="userPromptTemplate" label="用户提示模板" rules={[{ required: true }]}>
                                        <Input.TextArea rows={6} />
                                    </Form.Item>
                                    <Form.Item name="outputSchemaCode" label="输出 Schema 编码">
                                        <Input />
                                    </Form.Item>
                                    <Form.Item name="isActive" label="启用状态" valuePropName="checked">
                                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                                    </Form.Item>
                                    <Form.Item name="variablesText" label="变量定义 (JSON)">
                                        <Input.TextArea rows={4} />
                                    </Form.Item>
                                    <Form.Item name="guardrailsText" label="防护规则 (JSON)">
                                        <Input.TextArea rows={4} />
                                    </Form.Item>
                                </Form>
                            ),
                        },
                        {
                            key: 'history',
                            label: '版本历史',
                            children: editingTemplate ? (
                                <AgentPromptTemplateHistory
                                    templateId={editingTemplate.id}
                                    onRollbackSuccess={() => {
                                        setEditVisible(false); // Close edit drawer to refresh main list or reload current data
                                        refetch();
                                    }}
                                />
                            ) : null,
                        },
                    ]}
                />
            </Drawer>

            <Drawer
                title="模板详情"
                width={600}
                open={drawerVisible}
                onClose={() => setDrawerVisible(false)}
            >
                <Descriptions column={1} bordered>
                    <Descriptions.Item label="编码">{selectedTemplate?.promptCode}</Descriptions.Item>
                    <Descriptions.Item label="名称">{selectedTemplate?.name}</Descriptions.Item>
                    <Descriptions.Item label="角色">{getAgentRoleLabel(selectedTemplate?.roleType)}</Descriptions.Item>
                    <Descriptions.Item label="输出 Schema">{selectedTemplate?.outputSchemaCode}</Descriptions.Item>
                    <Descriptions.Item label="版本">{selectedTemplate?.version}</Descriptions.Item>
                    <Descriptions.Item label="系统提示词">
                        <pre style={{ whiteSpace: 'pre-wrap' }}>{selectedTemplate?.systemPrompt}</pre>
                    </Descriptions.Item>
                    <Descriptions.Item label="用户提示词">
                        <pre style={{ whiteSpace: 'pre-wrap' }}>{selectedTemplate?.userPromptTemplate}</pre>
                    </Descriptions.Item>
                    <Descriptions.Item label="防护规则">
                        <pre>{JSON.stringify(selectedTemplate?.guardrails || {}, null, 2)}</pre>
                    </Descriptions.Item>
                </Descriptions>
            </Drawer>
        </Card>
    );
};
