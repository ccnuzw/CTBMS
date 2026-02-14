import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Tag, Typography, Space, Row, Col, DatePicker, message, Divider } from 'antd';
import { DeploymentUnitOutlined, GlobalOutlined, EnvironmentOutlined, ShopOutlined, RocketOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
    ResolveParameterSetDto,
    ResolvedParameterItemSchema,
    ParameterScopeLevel,
} from '@packages/types';
import { useResolveParameterSet } from '../api';

const { Text, Title } = Typography;

interface ParameterResolutionPreviewProps {
    parameterSetId: string;
}

// Define scope configuration for visualization (color and icon)
const scopeConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    PUBLIC_TEMPLATE: { color: 'blue', icon: <GlobalOutlined />, label: 'Public' },
    USER_TEMPLATE: { color: 'cyan', icon: <DeploymentUnitOutlined />, label: 'Template' },
    GLOBAL: { color: 'green', icon: <GlobalOutlined />, label: 'Global' },
    COMMODITY: { color: 'orange', icon: <ShopOutlined />, label: 'Commodity' },
    REGION: { color: 'purple', icon: <EnvironmentOutlined />, label: 'Region' },
    ROUTE: { color: 'magenta', icon: <RocketOutlined />, label: 'Route' },
    STRATEGY: { color: 'geekblue', icon: <DeploymentUnitOutlined />, label: 'Strategy' },
    SESSION: { color: 'red', icon: <DeploymentUnitOutlined />, label: 'Session' },
};

type ResolvedItem = {
    paramCode: string;
    value?: unknown;
    sourceScope: ParameterScopeLevel;
};

export const ParameterResolutionPreview: React.FC<ParameterResolutionPreviewProps> = ({ parameterSetId }) => {
    const [form] = Form.useForm<ResolveParameterSetDto>();
    const resolveMutation = useResolveParameterSet();
    const [results, setResults] = useState<ResolvedItem[]>([]);

    const handleResolve = async () => {
        try {
            const values = await form.validateFields();
            const res = await resolveMutation.mutateAsync({ setId: parameterSetId, dto: values });
            setResults(res.resolved);
            message.success('Resolved successfully');
        } catch (error) {
            console.error(error);
            message.error('Failed to resolve parameters');
        }
    };

    const columns: ColumnsType<ResolvedItem> = [
        {
            title: 'Parameter Code',
            dataIndex: 'paramCode',
            key: 'paramCode',
            width: 200,
            render: (text) => <Text strong>{text}</Text>,
        },
        {
            title: 'Effective Value',
            dataIndex: 'value',
            key: 'value',
            render: (value) => (
                <Text copyable={{ text: JSON.stringify(value) }}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Text>
            ),
        },
        {
            title: 'Source Scope',
            dataIndex: 'sourceScope',
            key: 'sourceScope',
            width: 150,
            render: (scope: ParameterScopeLevel) => {
                const config = scopeConfig[scope] || { color: 'default', icon: null, label: scope };
                return (
                    <Tag color={config.color} icon={config.icon}>
                        {config.label}
                    </Tag>
                );
            },
        },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={24}>
            <Card title="Context Simulation" size="small">
                <Form<ResolveParameterSetDto>
                    form={form}
                    layout="vertical"
                    onFinish={handleResolve}
                >
                    <Row gutter={16}>
                        <Col span={6}>
                            <Form.Item name="commodity" label="Commodity">
                                <Input placeholder="e.g. CORN" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="region" label="Region">
                                <Input placeholder="e.g. US_MIDWEST" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="route" label="Route">
                                <Input placeholder="e.g. RAIL_NORTH" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="strategy" label="Strategy">
                                <Input placeholder="e.g. HEDGING_V1" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row justify="end">
                        <Button type="primary" htmlType="submit" loading={resolveMutation.isPending}>
                            Simulate Resolution
                        </Button>
                    </Row>
                </Form>
            </Card>

            {results.length > 0 && (
                <Card title="Effective Parameters" size="small">
                    {/* Visual Hierarchy Summary */}
                    <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
                        <Space split={<Divider type="vertical" />}>
                            <Text type="secondary">Hierarchy Priority:</Text>
                            <Space size={4}>
                                <Tag color="red">Session</Tag> &gt;
                                <Tag color="geekblue">Strategy</Tag> &gt;
                                <Tag color="magenta">Route</Tag> &gt;
                                <Tag color="purple">Region</Tag> &gt;
                                <Tag color="orange">Commodity</Tag> &gt;
                                <Tag color="green">Global</Tag> &gt;
                                <Tag color="blue">Template</Tag>
                            </Space>
                        </Space>
                    </div>

                    <Table
                        dataSource={results}
                        columns={columns}
                        rowKey="paramCode"
                        pagination={false}
                        size="small"
                        scroll={{ y: 500 }}
                    />
                </Card>
            )}
        </Space>
    );
};
