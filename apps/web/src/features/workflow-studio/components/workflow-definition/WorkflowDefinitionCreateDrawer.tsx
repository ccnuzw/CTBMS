import React, { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Select, Space, Collapse, App } from 'antd';
import { CreateWorkflowDefinitionFormValues } from './types';
import { slugifyWorkflowId, buildInitialDslSnapshot } from './utils';
import { starterTemplateOptions, modeOptions, usageMethodOptions, runtimeOnErrorOptions } from './constants';
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
    agentBindingOptions,
    parameterBindingOptions,
    dataConnectorBindingOptions,
    isRulePackLoading,
    isAgentProfileLoading,
    isParameterSetLoading,
    isDataConnectorLoading,
}) => {
    const { message } = App.useApp();
    const [form] = Form.useForm<CreateWorkflowDefinitionFormValues>();
    const [isWorkflowIdCustomized, setIsWorkflowIdCustomized] = useState(false);
    const createMutation = useCreateWorkflowDefinition();

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
                defaultTimeoutMs,
                defaultRetryCount,
                defaultRetryBackoffMs,
                defaultOnError,
                defaultRulePackCode,
                defaultAgentBindings,
                defaultParamSetBindings,
                defaultDataConnectorBindings,
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
                dslSnapshot: buildInitialDslSnapshot(
                    {
                        ...values,
                        starterTemplate,
                        defaultRulePackCode,
                        defaultAgentBindings,
                        defaultParamSetBindings,
                        defaultDataConnectorBindings,
                    },
                    runtimePolicy,
                ),
            });
            message.success('流程创建成功');
            onClose();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    mode: 'LINEAR',
                    usageMethod: 'COPILOT',
                    defaultTimeoutMs: 30000,
                    defaultRetryCount: 1,
                    defaultRetryBackoffMs: 2000,
                    defaultOnError: 'FAIL_FAST',
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

                    const changedStarterTemplate =
                        changedValues.starterTemplate as CreateWorkflowDefinitionFormValues['starterTemplate'] | undefined;
                    if (changedStarterTemplate === 'DEBATE_ANALYSIS') {
                        form.setFieldsValue({ mode: 'DEBATE', usageMethod: 'COPILOT' });
                    } else if (changedStarterTemplate === 'RISK_REVIEW') {
                        form.setFieldsValue({ mode: 'DAG', usageMethod: 'HEADLESS' });
                    } else if (changedStarterTemplate === 'QUICK_DECISION') {
                        form.setFieldsValue({ mode: 'LINEAR', usageMethod: 'COPILOT' });
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
                <Form.Item label="编排模式" name="mode" rules={[{ required: true }]}>
                    <Select options={modeOptions} />
                </Form.Item>
                <Form.Item label="使用方式" name="usageMethod" rules={[{ required: true }]}>
                    <Select options={usageMethodOptions} />
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
                <Form.Item
                    label="默认智能体绑定（可选）"
                    name="defaultAgentBindings"
                    extra="可多选，系统将自动写入流程绑定。"
                >
                    <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        loading={isAgentProfileLoading}
                        options={agentBindingOptions}
                        optionFilterProp="label"
                        placeholder="选择智能体（可多选）"
                    />
                </Form.Item>
                <Form.Item
                    label="默认参数包绑定（可选）"
                    name="defaultParamSetBindings"
                    extra="可多选，系统将自动写入参数包绑定。"
                >
                    <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        loading={isParameterSetLoading}
                        options={parameterBindingOptions}
                        optionFilterProp="label"
                        placeholder="选择参数包（可多选）"
                    />
                </Form.Item>
                <Form.Item
                    label="默认连接器绑定（可选）"
                    name="defaultDataConnectorBindings"
                    extra="可多选，便于后续节点直接引用连接器。"
                >
                    <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        loading={isDataConnectorLoading}
                        options={dataConnectorBindingOptions}
                        optionFilterProp="label"
                        placeholder="选择数据连接器（可多选）"
                    />
                </Form.Item>
                <Collapse
                    size="small"
                    items={[
                        {
                            key: 'advanced-runtime',
                            label: '高级设置（运行策略与说明）',
                            children: (
                                <Space direction="vertical" style={{ width: '100%' }} size={0}>
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
                                </Space>
                            ),
                        },
                    ]}
                />
            </Form>
        </Drawer>
    );
};
