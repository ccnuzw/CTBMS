import React from 'react';
import { Col, Form, Input, InputNumber, Row, Select, Typography, theme } from 'antd';
import { DataConnectorType } from '@packages/types';

/**
 * 根据连接器类型渲染结构化的端点配置表单字段
 */
const EndpointConfigFields: React.FC<{ type: DataConnectorType }> = ({ type }) => {
    const { token } = theme.useToken();

    const wrapperStyle: React.CSSProperties = {
        backgroundColor: token.colorFillAlter,
        padding: '16px 16px 0 16px',
        borderRadius: 8,
        marginBottom: 16,
    };

    switch (type) {
        case 'INTERNAL_DB':
            return (
                <div style={wrapperStyle}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                        🗄️ 数据库连接信息
                    </Typography.Text>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'host']} label="主机地址">
                                <Input placeholder="如: localhost 或 192.168.1.100" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name={['endpointConfig', 'port']} label="端口">
                                <InputNumber style={{ width: '100%' }} placeholder="5432" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name={['endpointConfig', 'ssl']} label="SSL">
                                <Select
                                    allowClear
                                    options={[
                                        { label: '启用', value: true },
                                        { label: '禁用', value: false },
                                    ]}
                                    placeholder="默认禁用"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'database']} label="数据库名">
                                <Input placeholder="如: ctbms_production" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'schema']} label="Schema">
                                <Input placeholder="如: public" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'username']} label="用户名">
                                <Input placeholder="数据库登录用户" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'password']} label="密码">
                                <Input.Password placeholder="数据库密码" />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            );

        case 'REST_API':
            return (
                <div style={wrapperStyle}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                        🌐 REST API 接入信息
                    </Typography.Text>
                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item name={['endpointConfig', 'baseUrl']} label="Base URL">
                                <Input placeholder="https://api.example.com/v1" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'timeout']} label="超时 (秒)">
                                <InputNumber style={{ width: '100%' }} placeholder="30000" min={0} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'authType']} label="认证方式">
                                <Select
                                    allowClear
                                    options={[
                                        { label: '无认证', value: 'NONE' },
                                        { label: 'Bearer Token', value: 'BEARER' },
                                        { label: 'API Key (Header)', value: 'API_KEY' },
                                        { label: 'Basic Auth', value: 'BASIC' },
                                    ]}
                                    placeholder="选择认证方式"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'headerKey']} label="认证 Header 名">
                                <Input placeholder="如: Authorization" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'headerValue']} label="认证值 / Token">
                                <Input.Password placeholder="Bearer xxx 或 API Key" />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            );

        case 'EXCHANGE_API':
            return (
                <div style={wrapperStyle}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                        📈 交易所 API 凭证
                    </Typography.Text>
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name={['endpointConfig', 'baseUrl']} label="API Base URL">
                                <Input placeholder="https://api.exchange.com" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'apiKey']} label="API Key">
                                <Input.Password placeholder="Access Key" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'secretKey']} label="Secret Key">
                                <Input.Password placeholder="Secret Key" />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            );

        case 'GRAPHQL':
            return (
                <div style={wrapperStyle}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                        🔗 GraphQL 接入信息
                    </Typography.Text>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'endpoint']} label="GraphQL Endpoint">
                                <Input placeholder="https://api.example.com/graphql" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'wsEndpoint']} label="WebSocket Endpoint">
                                <Input placeholder="wss://api.example.com/graphql (可选)" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name={['endpointConfig', 'authHeader']} label="认证 Header (完整值)">
                                <Input.Password placeholder="如: Bearer eyJhbGciOi..." />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            );

        case 'FILE_IMPORT':
            return (
                <div style={wrapperStyle}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                        📁 文件导入配置
                    </Typography.Text>
                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item name={['endpointConfig', 'filePath']} label="文件路径 / URL">
                                <Input placeholder="/data/imports/prices.csv 或 https://..." />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'format']} label="文件格式">
                                <Select
                                    options={[
                                        { label: 'CSV', value: 'CSV' },
                                        { label: 'JSON', value: 'JSON' },
                                        { label: 'XLSX (Excel)', value: 'XLSX' },
                                        { label: 'Parquet', value: 'PARQUET' },
                                    ]}
                                    placeholder="选择格式"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'delimiter']} label="分隔符 (CSV)">
                                <Input placeholder="默认: ," />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'encoding']} label="编码">
                                <Select
                                    allowClear
                                    options={[
                                        { label: 'UTF-8', value: 'UTF-8' },
                                        { label: 'GBK', value: 'GBK' },
                                        { label: 'GB2312', value: 'GB2312' },
                                        { label: 'ISO-8859-1', value: 'ISO-8859-1' },
                                    ]}
                                    placeholder="默认 UTF-8"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            );

        case 'WEBHOOK':
            return (
                <div style={wrapperStyle}>
                    <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                        🔔 Webhook 回调配置
                    </Typography.Text>
                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item name={['endpointConfig', 'callbackUrl']} label="回调 URL">
                                <Input placeholder="https://your-server.com/webhook/receiver" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name={['endpointConfig', 'retryCount']} label="重试次数">
                                <InputNumber style={{ width: '100%' }} min={0} max={10} placeholder="3" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'secretToken']} label="签名密钥 (Secret)">
                                <Input.Password placeholder="用于校验 Webhook 签名" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name={['endpointConfig', 'contentType']} label="Content-Type">
                                <Select
                                    allowClear
                                    options={[
                                        { label: 'application/json', value: 'application/json' },
                                        {
                                            label: 'application/x-www-form-urlencoded',
                                            value: 'application/x-www-form-urlencoded',
                                        },
                                    ]}
                                    placeholder="默认 JSON"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </div>
            );

        default:
            return null;
    }
};

export default EndpointConfigFields;
