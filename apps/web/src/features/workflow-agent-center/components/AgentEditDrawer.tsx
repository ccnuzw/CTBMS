import React, { useEffect, useMemo, useState } from 'react';
import {
    App,
    Button,
    Drawer,
    Form,
    Input,
    InputNumber,
    Select,
    Space,
    Switch,
    Tabs,
    Typography,
    Tooltip,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { AgentProfileDto, AgentRoleType } from '@packages/types';
import { useUpdateAgentProfile, useAgentPromptTemplates } from '../api';
import { useAIConfigs } from '../../system-config/api';
import {
    getAgentRoleLabel,
    getMemoryPolicyLabel,
    OUTPUT_SCHEMA_OPTIONS,
} from '../constants';
import { RetryPolicyForm } from './RetryPolicyForm';
import { OutputSchemaBuilder } from './OutputSchemaBuilder';
import { VisualToolPolicyBuilder } from './VisualToolPolicyBuilder';
import { VisualGuardrailsBuilder } from './VisualGuardrailsBuilder';
import { AgentPromptTemplateCreateDrawer } from './AgentPromptTemplateCreateDrawer';
import { getErrorMessage } from '../../../api/client';

const { TextArea } = Input;

interface AgentEditDrawerProps {
    open: boolean;
    onClose: () => void;
    agent: AgentProfileDto | null;
    onSuccess?: () => void;
}

export const AgentEditDrawer: React.FC<AgentEditDrawerProps> = ({
    open,
    onClose,
    agent,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [promptCreateVisible, setPromptCreateVisible] = useState(false);
    const updateMutation = useUpdateAgentProfile();

    const { data: aiConfigs } = useAIConfigs();
    const { data: promptTemplates } = useAgentPromptTemplates({
        page: 1,
        pageSize: 100,
        isActive: true,
        includePublic: true,
    });

    const promptOptions = useMemo(() => {
        return (promptTemplates?.data || []).map((t) => ({
            label: `${t.name} (${t.promptCode})`,
            value: t.promptCode,
        }));
    }, [promptTemplates]);

    const modelConfigOptions = useMemo(() => {
        return aiConfigs?.map((config) => ({
            label: config.isDefault ? `${config.configKey} (默认)` : config.configKey,
            value: config.configKey,
        })) || [];
    }, [aiConfigs]);

    const memoryOptions = useMemo(() => ['none', 'short-term', 'windowed'].map((item: any) => ({
        label: getMemoryPolicyLabel(item),
        value: item,
    })), []);

    useEffect(() => {
        if (open && agent) {
            form.setFieldsValue({
                agentName: agent.agentName,
                agentCode: agent.agentCode, // Readonly display
                roleType: agent.roleType, // Readonly display
                objective: agent.objective,
                isActive: agent.isActive,

                modelConfigKey: agent.modelConfigKey,
                agentPromptCode: agent.agentPromptCode,
                memoryPolicy: agent.memoryPolicy || 'none',

                outputSchemaCode: agent.outputSchemaCode,
                outputSchemaString: agent.outputSchema ? JSON.stringify(agent.outputSchema, null, 2) : undefined,
                toolPolicy: agent.toolPolicy || {},
                guardrails: agent.guardrails || {},

                timeoutMs: agent.timeoutMs,
                retryPolicy: agent.retryPolicy || { retryCount: 1, retryBackoffMs: 2000 },
                templateSource: agent.templateSource || 'PRIVATE',
            });
        } else {
            form.resetFields();
        }
    }, [open, agent, form]);

    const handleSubmit = async () => {
        if (!agent) return;
        try {
            const values = await form.validateFields();

            const payload: any = {
                agentName: values.agentName,
                objective: values.objective,
                isActive: values.isActive,

                modelConfigKey: values.modelConfigKey,
                agentPromptCode: values.agentPromptCode,
                memoryPolicy: values.memoryPolicy,

                outputSchemaCode: values.outputSchemaCode,
                toolPolicy: values.toolPolicy,
                guardrails: values.guardrails,

                timeoutMs: values.timeoutMs,
                retryPolicy: values.retryPolicy,
                templateSource: values.templateSource,
            };

            if (values.outputSchemaCode === 'CUSTOM' && values.outputSchemaString) {
                try {
                    payload.outputSchema = JSON.parse(values.outputSchemaString);
                } catch (e) {
                    message.error('自定义输出结构 JSON 格式错误');
                    return;
                }
            }

            await updateMutation.mutateAsync({
                id: agent.id,
                payload,
            });

            message.success('更新成功');
            onSuccess?.();
            onClose();
        } catch (error) {
            message.error(getErrorMessage(error) || '更新失败');
        }
    };

    const handlePromptCreated = (newPromptCode: string) => {
        form.setFieldsValue({ agentPromptCode: newPromptCode });
    };

    const items = [
        {
            key: 'basic',
            label: '基本信息',
            children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item label="编码 (Code)">
                        <Input value={agent?.agentCode} disabled />
                    </Form.Item>
                    <Form.Item label="角色 (Role)">
                        <Input value={getAgentRoleLabel(agent?.roleType)} disabled />
                    </Form.Item>
                    <Form.Item name="agentName" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                        <Input placeholder="请输入智能体名称" />
                    </Form.Item>
                    <Form.Item name="objective" label="目标 (Objective)">
                        <TextArea rows={4} placeholder="描述该智能体的主要目标和职责" />
                    </Form.Item>
                    <Form.Item name="isActive" label="状态" valuePropName="checked">
                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                </Space>
            ),
        },
        {
            key: 'model',
            label: '模型与智能',
            children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item name="modelConfigKey" label="AI 模型配置" rules={[{ required: true }]}>
                        <Select options={modelConfigOptions} showSearch />
                    </Form.Item>
                    <Form.Item label="提示词模板" required>
                        <Space style={{ display: 'flex' }} align="start">
                            <Form.Item
                                name="agentPromptCode"
                                rules={[{ required: true, message: '请选择提示词模板' }]}
                                noStyle
                            >
                                <Select
                                    showSearch
                                    placeholder="选择提示词模板"
                                    options={promptOptions}
                                    filterOption={(input, option) =>
                                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                                        (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    style={{ width: 440 }}
                                />
                            </Form.Item>
                            <Tooltip title="新建提示词模板">
                                <Button
                                    icon={<PlusOutlined />}
                                    onClick={() => setPromptCreateVisible(true)}
                                />
                            </Tooltip>
                        </Space>
                    </Form.Item>
                    <Form.Item name="memoryPolicy" label="记忆策略" rules={[{ required: true }]}>
                        <Select options={memoryOptions} />
                    </Form.Item>
                </Space>
            ),
        },
        {
            key: 'capabilities',
            label: '能力与规范',
            children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item name="outputSchemaCode" label="输出结构模板 (Schema)" rules={[{ required: true }]}>
                        <Select options={OUTPUT_SCHEMA_OPTIONS} placeholder="选择或自定义输出结构" />
                    </Form.Item>
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, curr) => prev.outputSchemaCode !== curr.outputSchemaCode}
                    >
                        {({ getFieldValue }) =>
                            getFieldValue('outputSchemaCode') === 'CUSTOM' ? (
                                <Form.Item name="outputSchemaString" label="自定义输出结构" rules={[{ required: true }]}>
                                    <OutputSchemaBuilder />
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>
                    <Form.Item name="toolPolicy" label="工具策略">
                        <VisualToolPolicyBuilder />
                    </Form.Item>
                    <Form.Item name="guardrails" label="防护规则">
                        <VisualGuardrailsBuilder />
                    </Form.Item>
                </Space>
            ),
        },
        {
            key: 'runtime',
            label: '运行策略',
            children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item name="timeoutMs" label="超时控制 (ms)" rules={[{ required: true }]}>
                        <InputNumber min={1000} max={300000} style={{ width: '100%' }} />
                    </Form.Item>
                    <RetryPolicyForm name="retryPolicy" />
                    <Form.Item name="templateSource" label="模板来源" rules={[{ required: true }]}>
                        <Select
                            options={[
                                { label: '私有 (Private)', value: 'PRIVATE' },
                                { label: '公共 (Public)', value: 'PUBLIC' },
                            ]}
                        />
                    </Form.Item>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Drawer
                title={`编辑智能体 - ${agent?.agentCode || ''}`}
                width={1200}
                open={open}
                onClose={onClose}
                extra={
                    <Space>
                        <Button onClick={onClose}>取消</Button>
                        <Button type="primary" onClick={handleSubmit} loading={updateMutation.isPending}>
                            保存
                        </Button>
                    </Space>
                }
            >
                <Form layout="vertical" form={form}>
                    <Tabs items={items} defaultActiveKey="basic" />
                </Form>
            </Drawer>

            <AgentPromptTemplateCreateDrawer
                open={promptCreateVisible}
                onClose={() => setPromptCreateVisible(false)}
                onSuccess={handlePromptCreated}
            />
        </>
    );
};
