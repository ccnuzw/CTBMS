import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Tag, Typography, Space, Row, Col, DatePicker, message, Divider, theme } from 'antd';
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

// 作用域配置：颜色、图标、中文标签
const scopeConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    PUBLIC_TEMPLATE: { color: 'blue', icon: <GlobalOutlined />, label: '公共模板' },
    USER_TEMPLATE: { color: 'cyan', icon: <DeploymentUnitOutlined />, label: '用户模板' },
    GLOBAL: { color: 'green', icon: <GlobalOutlined />, label: '全局' },
    COMMODITY: { color: 'orange', icon: <ShopOutlined />, label: '品种' },
    REGION: { color: 'purple', icon: <EnvironmentOutlined />, label: '区域' },
    ROUTE: { color: 'magenta', icon: <RocketOutlined />, label: '路线' },
    STRATEGY: { color: 'geekblue', icon: <DeploymentUnitOutlined />, label: '策略' },
    SESSION: { color: 'red', icon: <DeploymentUnitOutlined />, label: '会话' },
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
    const { token } = theme.useToken();

    const handleResolve = async () => {
        try {
            const values = await form.validateFields();
            const res = await resolveMutation.mutateAsync({ setId: parameterSetId, dto: values });
            setResults(res.resolved);
            message.success('参数解析成功');
        } catch (error) {
            if (import.meta.env.DEV) console.error(error);
            message.error('参数解析失败');
        }
    };

    const columns: ColumnsType<ResolvedItem> = [
        {
            title: '参数编码',
            dataIndex: 'paramCode',
            key: 'paramCode',
            width: 200,
            render: (text) => <Text strong>{text}</Text>,
        },
        {
            title: '生效值',
            dataIndex: 'value',
            key: 'value',
            render: (value) => (
                <Text copyable={{ text: JSON.stringify(value) }}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Text>
            ),
        },
        {
            title: '来源作用域',
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
            <Card title="上下文模拟" size="small">
                <Form<ResolveParameterSetDto>
                    form={form}
                    layout="vertical"
                    onFinish={handleResolve}
                >
                    <Row gutter={16}>
                        <Col span={6}>
                            <Form.Item name="commodity" label="品种">
                                <Input placeholder="例如 CORN" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="region" label="区域">
                                <Input placeholder="例如 US_MIDWEST" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="route" label="路线">
                                <Input placeholder="例如 RAIL_NORTH" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="strategy" label="策略">
                                <Input placeholder="例如 HEDGING_V1" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row justify="end">
                        <Button type="primary" htmlType="submit" loading={resolveMutation.isPending}>
                            模拟解析
                        </Button>
                    </Row>
                </Form>
            </Card>

            {results.length > 0 && (
                <Card title="生效参数" size="small">
                    {/* 优先级层级摘要 */}
                    <div style={{ marginBottom: 16, padding: 12, background: token.colorBgLayout, borderRadius: 8 }}>
                        <Space split={<Divider type="vertical" />}>
                            <Text type="secondary">优先级层级：</Text>
                            <Space size={4}>
                                <Tag color="red">会话</Tag> &gt;
                                <Tag color="geekblue">策略</Tag> &gt;
                                <Tag color="magenta">路线</Tag> &gt;
                                <Tag color="purple">区域</Tag> &gt;
                                <Tag color="orange">品种</Tag> &gt;
                                <Tag color="green">全局</Tag> &gt;
                                <Tag color="blue">模板</Tag>
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
