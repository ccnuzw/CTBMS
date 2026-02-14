import React, { useState, useEffect } from 'react';
import {
    Modal,
    Form,
    Input,
    Select,
    Slider,
    Switch,
    InputNumber,
    Row,
    Col,
    Typography,
    App,
} from 'antd';
import { CreateWorkflowExperimentDto } from '@packages/types';
import { useCreateExperiment } from '../api';
import { useWorkflowDefinitions, useWorkflowVersions } from '../../workflow-studio/api/workflow-definitions';

const { Text } = Typography;

interface ExperimentCreateModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: () => void;
}

export const ExperimentCreateModal: React.FC<ExperimentCreateModalProps> = ({
    open,
    onCancel,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const [form] = Form.useForm<CreateWorkflowExperimentDto>();
    const createMutation = useCreateExperiment();

    // Load workflow definitions
    const { data: workflowData, isLoading: isWorkflowsLoading } = useWorkflowDefinitions({
        page: 1,
        pageSize: 100, // Fetch enough to show
    });

    // Watch selected workflow to load versions
    const selectedWorkflowId = Form.useWatch('workflowDefinitionId', form);

    // Load versions for selected workflow
    const { data: versionsData, isLoading: isVersionsLoading } = useWorkflowVersions(selectedWorkflowId);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            await createMutation.mutateAsync(values);
            message.success('实验创建成功');
            form.resetFields();
            onSuccess();
        } catch (error) {
            // Error handled by global interceptor or mutation onError usually, 
            // but if not, we can show message here.
            // message.error('创建失败'); 
        }
    };

    // Filter published versions usually? Or any version? 
    // Let's assume any version for now, or maybe only published ones?
    // The backend might strictly enforce it, but for now allow any.
    const versionOptions = (versionsData || []).map(v => ({
        label: `v${v.versionCode} (${v.status}) - ${v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'}`,
        value: v.id,
    }));

    const workflowOptions = (workflowData?.data || []).map(w => ({
        label: w.name,
        value: w.id,
    }));

    return (
        <Modal
            title="创建 A/B 实验"
            open={open}
            onCancel={onCancel}
            onOk={handleSubmit}
            confirmLoading={createMutation.isPending}
            width={700}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    trafficSplitPercent: 50,
                    autoStopEnabled: true,
                    badCaseThreshold: 0.2,
                }}
            >
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="experimentCode"
                            label="实验编码"
                            rules={[{ required: true }, { max: 60 }]}
                        >
                            <Input placeholder="EXP_2024_001" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="name"
                            label="实验名称"
                            rules={[{ required: true }, { max: 120 }]}
                        >
                            <Input placeholder="新策略灰度测试" />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item name="description" label="描述" rules={[{ max: 2000 }]}>
                    <Input.TextArea rows={2} />
                </Form.Item>

                <Form.Item
                    name="workflowDefinitionId"
                    label="所属工作流"
                    rules={[{ required: true }]}
                >
                    <Select
                        placeholder="选择工作流"
                        loading={isWorkflowsLoading}
                        options={workflowOptions}
                        onChange={() => {
                            form.setFieldsValue({ variantAVersionId: undefined, variantBVersionId: undefined });
                        }}
                    />
                </Form.Item>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="variantAVersionId"
                            label="变体 A (基准版本)"
                            rules={[{ required: true }]}
                        >
                            <Select
                                placeholder="选择版本 A"
                                loading={isVersionsLoading}
                                options={versionOptions}
                                disabled={!selectedWorkflowId}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="variantBVersionId"
                            label="变体 B (实验版本)"
                            rules={[{ required: true }]}
                        >
                            <Select
                                placeholder="选择版本 B"
                                loading={isVersionsLoading}
                                options={versionOptions}
                                disabled={!selectedWorkflowId}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item label="流量分配 (A/B)" required>
                    <Form.Item name="trafficSplitPercent" noStyle>
                        <Slider
                            min={1}
                            max={99}
                            marks={{ 20: '20%', 50: '50%', 80: '80%' }}
                            tooltip={{ formatter: (value) => `流量分配给 A: ${value}%` }}
                        />
                    </Form.Item>
                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                        <Form.Item shouldUpdate={(prev, curr) => prev.trafficSplitPercent !== curr.trafficSplitPercent} noStyle>
                            {({ getFieldValue }) => {
                                const val = getFieldValue('trafficSplitPercent') || 50;
                                return (
                                    <Text type="secondary">
                                        变体 A: <Text strong>{val}%</Text> vs 变体 B: <Text strong>{100 - val}%</Text>
                                    </Text>
                                );
                            }}
                        </Form.Item>
                    </div>
                </Form.Item>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="autoStopEnabled"
                            label="自动熔断 (Auto Stop)"
                            valuePropName="checked"
                        >
                            <Switch />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            shouldUpdate={(prev, curr) => prev.autoStopEnabled !== curr.autoStopEnabled}
                            noStyle
                        >
                            {({ getFieldValue }) => {
                                const enabled = getFieldValue('autoStopEnabled');
                                return (
                                    <Form.Item
                                        name="badCaseThreshold"
                                        label="熔断阈值 (Bad Case Rate)"
                                        rules={[{ required: enabled }]}
                                    >
                                        <InputNumber
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            disabled={!enabled}
                                            style={{ width: '100%' }}
                                            placeholder="0.2 (20%)"
                                        />
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};
