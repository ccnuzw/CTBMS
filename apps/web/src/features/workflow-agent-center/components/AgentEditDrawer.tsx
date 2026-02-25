import React, { useEffect, useMemo, useState } from 'react';
import {
    App,
    Button,
    Collapse,
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
    theme,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { AgentProfileDto, AgentRoleType } from '@packages/types';
import { useUpdateAgentProfile, useAgentPromptTemplates, useAgentSkills } from '../api';
import { useAIConfigs } from '../../system-config/api';
import {
    getAgentRoleLabel,
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

/** 记忆策略友好文案 */
const MEMORY_POLICY_FRIENDLY: { value: string; label: string; description: string }[] = [
    { value: 'none', label: '无记忆', description: '每次独立对话，不保留任何上下文' },
    { value: 'short-term', label: '短期记忆', description: '当轮对话内保持上下文连贯' },
    { value: 'windowed', label: '窗口记忆', description: '保留最近 N 轮对话历史' },
];

export const AgentEditDrawer: React.FC<AgentEditDrawerProps> = ({
    open,
    onClose,
    agent,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const { token } = theme.useToken();
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

    const { data: skillsData } = useAgentSkills({ pageSize: 100 });

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

    const memoryOptions = useMemo(() => MEMORY_POLICY_FRIENDLY.map((item) => ({
        label: `${item.label} — ${item.description}`,
        value: item.value,
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
                skillCodes: agent.skillCodes || [],
                toolPolicy: agent.toolPolicy || {},
                guardrails: agent.guardrails || {},

                timeoutSeconds: agent.timeoutSeconds,
                retryPolicy: agent.retryPolicy || { retryCount: 1, retryIntervalSeconds: 2 },
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

            const payload: Record<string, any> = {
                agentName: values.agentName,
                objective: values.objective,
                isActive: values.isActive,

                modelConfigKey: values.modelConfigKey,
                agentPromptCode: values.agentPromptCode,
                memoryPolicy: values.memoryPolicy,

                outputSchemaCode: values.outputSchemaCode,
                skillCodes: values.skillCodes || [],
                toolPolicy: values.toolPolicy,
                guardrails: values.guardrails,

                timeoutSeconds: values.timeoutSeconds,
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
            label: '基础配置',
            children: (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    {/* ─── 身份信息 ─── */}
                    <div
                        style={{
                            backgroundColor: token.colorFillAlter,
                            padding: '16px 16px 0 16px',
                            borderRadius: 8,
                        }}
                    >
                        <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                            🏷️ 身份信息
                        </Typography.Text>
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
                            <TextArea rows={3} placeholder="描述该智能体的主要目标和职责" />
                        </Form.Item>
                        <Form.Item name="isActive" label="状态" valuePropName="checked">
                            <Switch checkedChildren="启用" unCheckedChildren="停用" />
                        </Form.Item>
                    </div>

                    {/* ─── AI 模型与提示词 ─── */}
                    <div
                        style={{
                            backgroundColor: token.colorFillAlter,
                            padding: '16px 16px 0 16px',
                            borderRadius: 8,
                        }}
                    >
                        <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                            🧠 AI 模型与提示词
                        </Typography.Text>
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
                    </div>
                </Space>
            ),
        },
        {
            key: 'capabilities',
            label: '能力与规范',
            children: (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    {/* ─── 输出与技能 ─── */}
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
                    <Form.Item name="skillCodes" label="绑定技能">
                        <Select
                            mode="multiple"
                            placeholder="选择绑定的辅助技能"
                            options={skillsData?.data?.map((s: any) => ({ label: s.name, value: s.skillCode })) || []}
                            allowClear
                        />
                    </Form.Item>
                    <Form.Item name="toolPolicy" label="工具策略">
                        <VisualToolPolicyBuilder />
                    </Form.Item>
                    <Form.Item name="guardrails" label="防护规则">
                        <VisualGuardrailsBuilder />
                    </Form.Item>

                    {/* ─── 运行策略 (折叠) ─── */}
                    <Collapse
                        ghost
                        style={{ backgroundColor: token.colorFillQuaternary, borderRadius: 8 }}
                        items={[
                            {
                                key: 'runtime',
                                label: '⚙️ 运行策略 (按需展开)',
                                children: (
                                    <>
                                        <Form.Item name="timeoutSeconds" label="超时控制 (秒)" rules={[{ required: true }]}>
                                            <InputNumber min={1000} max={300000} style={{ width: '100%' }} />
                                        </Form.Item>
                                        <RetryPolicyForm name="retryPolicy" />
                                        <Form.Item name="templateSource" label="模板来源" rules={[{ required: true }]}>
                                            <Select
                                                options={[
                                                    { label: '私有 (仅当前租户可见)', value: 'PRIVATE' },
                                                    { label: '公共 (共享到模板市场)', value: 'PUBLIC' },
                                                ]}
                                            />
                                        </Form.Item>
                                    </>
                                ),
                            },
                        ]}
                    />
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
