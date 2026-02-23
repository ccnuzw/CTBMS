import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Input, InputNumber, Switch, Spin, Alert, Typography, Slider, DatePicker, Select, Tabs } from 'antd';
import type { WorkflowVersionDto, WorkflowDefinitionDto, ParameterItemDto } from '@packages/types';
import { useParameterSetDetail, useParameterSets } from '../../../workflow-parameter-center/api';
import { SmartTriggerPanel } from './SmartTriggerPanel';
import { useQueries } from '@tanstack/react-query';
import { apiClient } from '../../../../api/client';

interface WorkflowQuickRunnerModalProps {
    open: boolean;
    definition: WorkflowDefinitionDto | null;
    version: WorkflowVersionDto | null;
    loading?: boolean;
    onClose: () => void;
    onRun: (paramSnapshot: Record<string, unknown>) => void;
}

export const WorkflowQuickRunnerModal: React.FC<WorkflowQuickRunnerModalProps> = ({
    open,
    definition,
    version,
    loading,
    onClose,
    onRun,
}) => {
    const [form] = Form.useForm();
    const [activeTab, setActiveTab] = useState<'smart' | 'manual'>('smart');

    const { data: parameterSetsPage, isLoading: isLoadingSets } = useParameterSets({
        includePublic: true,
        isActive: true,
        page: 1,
        pageSize: 500,
    });

    const boundSetCodes = version?.dslSnapshot?.paramSetBindings || [];

    const boundSets = useMemo(() => {
        if (!parameterSetsPage?.data) return [];
        return parameterSetsPage.data.filter((set) => boundSetCodes.includes(set.setCode));
    }, [parameterSetsPage?.data, boundSetCodes]);

    // Fetch details for all bound sets to construct the paramSchema for AI
    const setDetailQueries = useQueries({
        queries: boundSets.map(set => ({
            queryKey: ['parameter-set', set.id],
            queryFn: async () => {
                const res = await apiClient.get<any>(`/parameter-sets/${set.id}`);
                return res.data;
            },
            enabled: open && boundSets.length > 0,
        }))
    });

    const isLoadingDetails = setDetailQueries.some(q => q.isLoading);
    const allItems = useMemo(() => {
        return setDetailQueries.flatMap(q => q.data?.items || []) as ParameterItemDto[];
    }, [setDetailQueries]);

    const paramSchema = useMemo(() => {
        if (allItems.length === 0) return undefined;
        const schema: Record<string, string> = {};
        allItems.forEach(item => {
            schema[item.paramCode] = `${item.paramName} (${item.paramType})`;
        });
        return schema;
    }, [allItems]);

    const handleRun = async () => {
        try {
            const values = await form.validateFields();

            const paramSnapshot: Record<string, unknown> = {};
            Object.keys(values).forEach(key => {
                let val = values[key];
                if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
                    try {
                        val = JSON.parse(val);
                    } catch (e) {
                        // retain string if JSON parse fails
                    }
                }
                paramSnapshot[key] = val;
            });

            onRun(paramSnapshot);
        } catch (e) {
            // Form validation failed, error messages will be shown inline by AntD
        }
    };

    // When AI fills params, set them in the form and switch to manual tab for review
    const handleSmartParamsFilled = (params: Record<string, unknown>) => {
        form.setFieldsValue(params);
        setActiveTab('manual');
    };

    useEffect(() => {
        if (open) {
            form.resetFields();
            setActiveTab('smart');
        }
    }, [open, form]);

    const tabItems = [
        {
            key: 'smart',
            label: '✨ 智能填参',
            children: (
                <Spin spinning={isLoadingSets || isLoadingDetails}>
                    {definition?.id ? (
                        <SmartTriggerPanel
                            workflowDefinitionId={definition.id}
                            paramSchema={paramSchema}
                            onParamsFilled={handleSmartParamsFilled}
                            onSwitchToManual={() => setActiveTab('manual')}
                        />
                    ) : (
                        <Alert type="warning" message="加载工作流信息中..." showIcon />
                    )}
                </Spin>
            ),
        },
        {
            key: 'manual',
            label: '📝 手动填写',
            children: (
                <Form form={form} layout="vertical">
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
                        请确认并填写下方参数执行该工作流。当前采用 <strong>{version?.versionCode || '最新'}</strong> 版本配置。
                    </Typography.Paragraph>

                    <Spin spinning={isLoadingSets || isLoadingDetails}>
                        {boundSets.map((set) => {
                            const details = setDetailQueries.find(q => q.data?.id === set.id)?.data;
                            if (!details || !details.items.length) return null;
                            return (
                                <div key={set.id} style={{ marginBottom: 24 }}>
                                    <Typography.Title level={5} style={{ marginBottom: 16 }}>
                                        参数包: {set.name}
                                    </Typography.Title>
                                    {details.items.map((item: ParameterItemDto) => (
                                        <Form.Item
                                            key={item.paramCode}
                                            name={item.paramCode}
                                            label={`${item.paramName} (${item.paramCode})`}
                                            initialValue={item.value ?? item.defaultValue}
                                            valuePropName={item.paramType === 'boolean' ? 'checked' : 'value'}
                                        >
                                            {renderInput(item)}
                                        </Form.Item>
                                    ))}
                                </div>
                            );
                        })}

                        {boundSetCodes.length > 0 && boundSets.length === 0 && !isLoadingSets && (
                            <Alert type="warning" message="该工作流绑定的参数包未找到或不可用，请联系管理员检查引用关系。" showIcon />
                        )}

                        {boundSetCodes.length === 0 && (
                            <Alert type="success" message="该工作流没有强制绑定任何全局参数包要求，可以直接按预设调度运行。" showIcon />
                        )}
                    </Spin>
                </Form>
            ),
        },
    ];

    return (
        <Modal
            title={`执行工作流 - ${definition?.name || version?.workflowDefinitionId || '未命名'}`}
            open={open}
            onCancel={onClose}
            onOk={activeTab === 'manual' ? handleRun : undefined}
            footer={activeTab === 'manual' ? undefined : null}
            confirmLoading={loading}
            okText="立即运行"
            cancelText="取消"
            width={620}
            destroyOnClose
        >
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as 'smart' | 'manual')}
                items={tabItems}
                style={{ marginTop: -8 }}
            />
        </Modal>
    );
};


const ParamSetFormSection: React.FC<{ setId: string; setName: string }> = ({ setId, setName }) => {
    const { data: detail, isLoading } = useParameterSetDetail(setId);

    if (isLoading) return <Spin size="small" style={{ margin: '16px 0' }} />;
    if (!detail || !detail.items.length) return null;

    return (
        <div style={{ marginBottom: 24 }}>
            <Typography.Title level={5} style={{ marginBottom: 16 }}>
                参数包: {setName}
            </Typography.Title>
            {detail.items.map((item) => (
                <Form.Item
                    key={item.paramCode}
                    name={item.paramCode}
                    label={`${item.paramName} (${item.paramCode})`}
                    initialValue={item.value ?? item.defaultValue}
                    valuePropName={item.paramType === 'boolean' ? 'checked' : 'value'}
                >
                    {renderInput(item)}
                </Form.Item>
            ))}
        </div>
    );
};

const renderInput = (item: ParameterItemDto) => {
    const uiProps = (item.uiProps as Record<string, any>) || {};
    const comp = item.uiComponent;

    if (comp === 'slider') {
        return <Slider {...uiProps} style={{ width: '100%', ...(uiProps.style || {}) }} />;
    }
    if (comp === 'date-picker') {
        return <DatePicker {...uiProps} style={{ width: '100%', ...(uiProps.style || {}) }} />;
    }
    if (comp === 'textarea' || (!comp && item.paramType === 'json') || (!comp && item.paramType === 'expression')) {
        return <Input.TextArea rows={3} placeholder='请输入内容/JSON' {...uiProps} />;
    }
    if (comp === 'select' || comp === 'dict-select') {
        // NOTE: Real-time dictionary fetching could be handled via wrapper component using optionsSourceId.
        // For now, relies on statically passed uiProps.options or base Select wrapper.
        return <Select placeholder="请选择" {...uiProps} style={{ width: '100%', ...(uiProps.style || {}) }} />;
    }
    if (comp === 'number-input' || (!comp && item.paramType === 'number')) {
        return <InputNumber placeholder="请输入数值" style={{ width: '100%' }} {...uiProps} />;
    }
    if (item.paramType === 'boolean') {
        return <Switch checkedChildren="True" unCheckedChildren="False" {...uiProps} />;
    }

    return <Input placeholder={`请输入 ${item.paramName}`} {...uiProps} />;
};
