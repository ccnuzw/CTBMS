import React, { useEffect, useState } from 'react';
import {
    App,
    Button,
    Collapse,
    Drawer,
    Form,
    Input,
    Select,
    Space,
    Typography,
} from 'antd';
import {
    CreateAgentPromptTemplateDto,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
    useCreateAgentPromptTemplate,
} from '../api';
import { AGENT_ROLE_OPTIONS, getAgentRoleLabel, OUTPUT_SCHEMA_OPTIONS } from '../constants';
import { VariablesEditor } from './VariablesEditor';
import { GuardrailsEditor } from './GuardrailsEditor';
import { StructuredPromptBuilder } from './StructuredPromptBuilder';
import { OutputSchemaBuilder } from './OutputSchemaBuilder';
import { VisualGuardrailsBuilder } from './VisualGuardrailsBuilder';

interface AgentPromptTemplateCreateDrawerProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: (newPromptCode: string) => void;
}

export const AgentPromptTemplateCreateDrawer: React.FC<AgentPromptTemplateCreateDrawerProps> = ({
    open,
    onClose,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const [createForm] = Form.useForm<CreateAgentPromptTemplateDto>();
    const createMutation = useCreateAgentPromptTemplate();
    const [isPromptCodeCustomized, setIsPromptCodeCustomized] = useState(false);

    /** 根据中文名称生成大写 SNAKE_CASE */
    const slugifyPromptCode = (name?: string): string => {
        const normalized = (name || '')
            .trim()
            .replace(/[\s.-]+/g, '_')
            .replace(/[^\w\u4e00-\u9fa5]+/g, '') // allow Chinese chars for Pinyin mapping backends, but here just raw
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        if (!normalized) return '';
        // Note: ideal is converting Pinyin, but a simple uppercase is fine for now
        // A better approach for Chinese names is to just use a prefix + timestamp if Pinyin is hard
        // We will generate a base string, user can modify
        return `PROMPT_${normalized.toUpperCase()}`;
    };

    useEffect(() => {
        if (open) {
            setIsPromptCodeCustomized(false);
            createForm.resetFields();
        }
    }, [open, createForm]);

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            const formValues = values as any;

            // Transform Variables List to Object
            const variables = (formValues.variablesList || []).reduce((acc: Record<string, unknown>, curr: { key: string; description: string }) => {
                acc[curr.key] = curr.description;
                return acc;
            }, {});

            // Transform Guardrails to Object
            const guardrails: Record<string, unknown> = {};
            if (formValues.guardrailsConfig?.noHallucination) guardrails.noHallucination = true;
            if (formValues.guardrailsConfig?.requireEvidence) guardrails.requireEvidence = true;
            (formValues.guardrailsConfig?.customRules || []).forEach((rule: { key: string; value: string }) => {
                try {
                    // Try to parse boolean or number
                    if (rule.value === 'true') guardrails[rule.key] = true;
                    else if (rule.value === 'false') guardrails[rule.key] = false;
                    else if (!isNaN(Number(rule.value))) guardrails[rule.key] = Number(rule.value);
                    else guardrails[rule.key] = rule.value;
                } catch (e) {
                    guardrails[rule.key] = rule.value;
                }
            });

            await createMutation.mutateAsync({
                ...formValues,
                variables,
                guardrails,
                outputSchema: formValues.outputSchemaCode === 'CUSTOM' && formValues.outputSchemaString
                    ? JSON.parse(formValues.outputSchemaString)
                    : undefined,
            });
            message.success('创建成功');
            onClose();
            createForm.resetFields();
            if (onSuccess && formValues.promptCode) {
                onSuccess(formValues.promptCode);
            }
        } catch (error) {
            message.error(getErrorMessage(error) || '创建失败');
        }
    };

    return (
        <Drawer
            title="新建提示词模板"
            width={1000}
            open={open}
            onClose={onClose}
            extra={
                <Space>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={handleCreate} loading={createMutation.isPending}>提交</Button>
                </Space>
            }
        >
            <Form
                form={createForm}
                layout="vertical"
                initialValues={{
                    roleType: 'ANALYST',
                    outputFormat: 'json',
                    templateSource: 'PRIVATE',
                    variables: '{}',
                    guardrails: '{}',
                }}
                onValuesChange={(changedValues, allValues) => {
                    const changedName = changedValues.name as string | undefined;
                    if (changedName !== undefined && !isPromptCodeCustomized) {
                        // Very simple mock pinyin or just random suffix since browser TS doesn't have pinyin lib
                        // To keep it simple, if no Pinyin, we just use the ID or generic name
                        // A better approach: generate a random string or let backend handle it, but for UI:
                        createForm.setFieldsValue({ promptCode: `PROMPT_${Date.now().toString().slice(-6)}` });
                    }

                    const changedCode = changedValues.promptCode as string | undefined;
                    if (changedCode !== undefined) {
                        setIsPromptCodeCustomized(true);
                    }
                }}
            >
                <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
                    <Input placeholder="例如: 深度市场分析模板" />
                </Form.Item>
                <Collapse
                    size="small"
                    ghost
                    style={{ marginBottom: 16, backgroundColor: '#fafafa', borderRadius: 6 }}
                    items={[
                        {
                            key: 'custom-code',
                            label: <Typography.Text type="secondary" style={{ fontSize: 13 }}>⚙️ 提示词编码 (自动生成，点击修改)</Typography.Text>,
                            children: (
                                <Form.Item
                                    name="promptCode"
                                    rules={[{ required: true }]}
                                    style={{ marginBottom: 0 }}
                                    extra="建议使用英文大写加下划线，用于代码中明确引用该模板"
                                >
                                    <Input placeholder="例如: MARKET_ANALYSIS_PROMPT_V1" />
                                </Form.Item>
                            ),
                        },
                    ]}
                />
                <Form.Item name="roleType" label="适用角色" rules={[{ required: true }]}>
                    <Select options={AGENT_ROLE_OPTIONS.map((r) => ({ label: getAgentRoleLabel(r), value: r }))} />
                </Form.Item>
                <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true }]}>
                    <StructuredPromptBuilder />
                </Form.Item>
                <Form.Item name="userPromptTemplate" label="用户提示模板" rules={[{ required: true }]}>
                    <Input.TextArea rows={6} />
                </Form.Item>
                <Form.Item name="outputSchemaCode" label="输出 Schema 编码">
                    <Select options={OUTPUT_SCHEMA_OPTIONS} placeholder="选择或自定义输出结构" />
                </Form.Item>
                <Form.Item
                    noStyle
                    shouldUpdate={(prev, curr) => prev.outputSchemaCode !== curr.outputSchemaCode}
                >
                    {({ getFieldValue }) =>
                        getFieldValue('outputSchemaCode') === 'CUSTOM' ? (
                            <Form.Item name="outputSchemaString" label="自定义输出结构">
                                <OutputSchemaBuilder />
                            </Form.Item>
                        ) : null
                    }
                </Form.Item>

                <VariablesEditor name="variablesList" />
                <Form.Item name="guardrailsConfig" label="防护规则">
                    <VisualGuardrailsBuilder />
                </Form.Item>
                <Form.Item name="templateSource" label="来源" hidden>
                    <Input />
                </Form.Item>
            </Form>
        </Drawer>
    );
};
