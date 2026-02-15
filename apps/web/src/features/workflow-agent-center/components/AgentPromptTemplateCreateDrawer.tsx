import React, { useEffect } from 'react';
import {
    App,
    Button,
    Drawer,
    Form,
    Input,
    Select,
    Space,
} from 'antd';
import {
    CreateAgentPromptTemplateDto,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
    useCreateAgentPromptTemplate,
} from '../api';
import { AGENT_ROLE_OPTIONS, getAgentRoleLabel } from '../constants';
import { VariablesEditor } from './VariablesEditor';
import { GuardrailsEditor } from './GuardrailsEditor';

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

    useEffect(() => {
        if (open) {
            createForm.resetFields();
        }
    }, [open, createForm]);

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            const formValues = values as any;

            // Transform Variables List to Object
            const variables = (formValues.variablesList || []).reduce((acc: any, curr: { key: string; description: string }) => {
                acc[curr.key] = curr.description;
                return acc;
            }, {});

            // Transform Guardrails to Object
            const guardrails: any = {};
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

                <VariablesEditor name="variablesList" />
                <GuardrailsEditor name="guardrailsConfig" />
                <Form.Item name="templateSource" label="来源" hidden>
                    <Input />
                </Form.Item>
            </Form>
        </Drawer>
    );
};
