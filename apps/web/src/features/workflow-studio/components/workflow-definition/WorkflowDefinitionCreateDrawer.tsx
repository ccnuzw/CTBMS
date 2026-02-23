import React, { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Select, Space, App } from 'antd';
import { CreateWorkflowDefinitionFormValues } from './types';
import { slugifyWorkflowId, buildInitialDslSnapshot } from './utils';
import { starterTemplateOptions } from './constants';
import { useCreateWorkflowDefinition } from '../../api';

const { TextArea } = Input;

export interface WorkflowDefinitionCreateDrawerProps {
    open: boolean;
    onClose: () => void;
    rulePackOptions: { label: string; value: string }[];
    agentBindingOptions: { label: string; value: string }[];
    parameterBindingOptions: { label: string; value: string }[];
    dataConnectorBindingOptions: { label: string; value: string }[];
    isRulePackLoading: boolean;
    isAgentProfileLoading: boolean;
    isParameterSetLoading: boolean;
    isDataConnectorLoading: boolean;
}

export const WorkflowDefinitionCreateDrawer: React.FC<WorkflowDefinitionCreateDrawerProps> = ({
    open,
    onClose,
    rulePackOptions,
    isRulePackLoading,
}) => {
    const { message } = App.useApp();
    const [form] = Form.useForm<CreateWorkflowDefinitionFormValues>();
    const [isWorkflowIdCustomized, setIsWorkflowIdCustomized] = useState(false);
    const createMutation = useCreateWorkflowDefinition();

    const resolveStarterTemplateProfile = (
        starterTemplate?: CreateWorkflowDefinitionFormValues['starterTemplate'],
    ): { mode: CreateWorkflowDefinitionFormValues['mode']; usageMethod: CreateWorkflowDefinitionFormValues['usageMethod'] } => {
        if (starterTemplate === 'DEBATE_ANALYSIS') {
            return { mode: 'DEBATE', usageMethod: 'COPILOT' };
        }
        if (starterTemplate === 'RISK_REVIEW') {
            return { mode: 'DAG', usageMethod: 'HEADLESS' };
        }
        return { mode: 'LINEAR', usageMethod: 'COPILOT' };
    };

    useEffect(() => {
        if (!open) {
            setIsWorkflowIdCustomized(false);
            form.resetFields();
        }
    }, [open, form]);

    const handleCreate = async () => {
        try {
            const values = await form.validateFields();
            const {
                starterTemplate,
                defaultRulePackCode,
                ...definitionPayload
            } = values;
            const templateProfile = resolveStarterTemplateProfile(starterTemplate);

            const runtimePolicy = {
                timeoutMs: 30000,
                retryCount: 1,
                retryBackoffMs: 2000,
                onError: 'FAIL_FAST' as const,
            };

            await createMutation.mutateAsync({
                ...definitionPayload,
                mode: templateProfile.mode,
                usageMethod: templateProfile.usageMethod,
                templateSource: 'PRIVATE',
                dslSnapshot: buildInitialDslSnapshot(
                    {
                        ...values,
                        mode: templateProfile.mode,
                        usageMethod: templateProfile.usageMethod,
                        starterTemplate,
                        defaultRulePackCode,
                    },
                    runtimePolicy,
                ),
            });
            message.success('流程创建成功');
            onClose();
         
        } catch (error: any) {
            if (error?.message?.includes('out of date')) {
                return;
            }
            message.error(error?.message || '创建失败');
        }
    };

    return (
        <Drawer
            title="新建流程"
            open={open}
            width={560}
            onClose={onClose}
            extra={
                <Space>
                    <Button onClick={onClose}>取消</Button>
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
                    starterTemplate: 'QUICK_DECISION',
                }}
                onValuesChange={(changedValues, allValues) => {
                    const changedName = changedValues.name as string | undefined;
                    if (changedName !== undefined && !isWorkflowIdCustomized) {
                        const generated = slugifyWorkflowId(changedName);
                        form.setFieldsValue({ workflowId: generated || undefined });
                    }

                    const changedWorkflowId = changedValues.workflowId as string | undefined;
                    if (changedWorkflowId !== undefined) {
                        const generated = slugifyWorkflowId(allValues.name as string | undefined);
                        const normalized = changedWorkflowId.trim();
                        if (!normalized) {
                            setIsWorkflowIdCustomized(false);
                        } else {
                            setIsWorkflowIdCustomized(Boolean(generated && normalized !== generated));
                        }
                    }

                }}
            >
                <Form.Item
                    label="快速起步模板"
                    name="starterTemplate"
                    rules={[{ required: true, message: '请选择快速起步模板' }]}
                    extra="先选业务场景，系统自动生成流程骨架。后续可在画布继续自由调整。"
                >
                    <Select
                        options={starterTemplateOptions.map((item) => ({
                            label: `${item.label} - ${item.description}`,
                            value: item.value,
                        }))}
                    />
                </Form.Item>
                <Form.Item
                    label="流程名称"
                    name="name"
                    rules={[{ required: true, message: '请输入流程名称' }]}
                >
                    <Input placeholder="例如: 玉米晨间线性决策" />
                </Form.Item>
                <Form.Item
                    label="流程编码"
                    name="workflowId"
                    rules={[
                        { required: true, message: '请输入流程编码' },
                        { pattern: /^[a-zA-Z0-9_-]{3,100}$/, message: '仅支持字母、数字、下划线和中划线' },
                    ]}
                    extra="系统会根据流程名称自动生成编码，你也可以手动覆盖。"
                >
                    <Input
                        placeholder="例如: wf_corn_morning_linear"
                        addonAfter={
                            <Button
                                type="link"
                                size="small"
                                onClick={() => {
                                    const generated = slugifyWorkflowId(form.getFieldValue('name'));
                                    form.setFieldsValue({ workflowId: generated || undefined });
                                    setIsWorkflowIdCustomized(false);
                                }}
                            >
                                自动生成
                            </Button>
                        }
                    />
                </Form.Item>
                <Form.Item
                    label="默认规则包（可选）"
                    name="defaultRulePackCode"
                    extra="选择后将生成 trigger -> rule-pack-eval -> risk-gate -> notify；未选择时为 trigger -> risk-gate -> notify。"
                >
                    <Select
                        allowClear
                        showSearch
                        loading={isRulePackLoading}
                        options={rulePackOptions}
                        optionFilterProp="label"
                        placeholder="请选择规则包编码"
                    />
                </Form.Item>
                <Form.Item label="描述" name="description">
                    <TextArea rows={4} placeholder="流程说明（可选）" />
                </Form.Item>
            </Form>
        </Drawer>
    );
};
