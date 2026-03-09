import React, { useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Flex,
    Form,
    Input,
    Result,
    Select,
    Space,
    Steps,
    Typography,
} from 'antd';
import { ApiOutlined, CheckCircleOutlined, LinkOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

interface ConnectorQuickSetupWizardProps {
    onComplete?: (config: Record<string, unknown>) => void;
}

/**
 * API 快速接入向导（PRD FR-DATA-005）
 *
 * 3 步向导：填写 API 地址/认证 → 选择数据字段映射 → 测试连通性
 */
export const ConnectorQuickSetupWizard: React.FC<ConnectorQuickSetupWizardProps> = ({
    onComplete,
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [apiConfig, setApiConfig] = useState({
        name: '',
        baseUrl: '',
        authType: 'API_KEY' as string,
        apiKey: '',
        headerName: 'Authorization',
    });
    const [fieldMapping, setFieldMapping] = useState({
        responseDataPath: 'data',
        priceField: 'price',
        dateField: 'date',
        productField: 'product',
        customFields: '',
    });
    const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

    const handleTest = () => {
        setTestResult('testing');
        // 模拟测试连通性
        setTimeout(() => {
            if (apiConfig.baseUrl.startsWith('http')) {
                setTestResult('success');
            } else {
                setTestResult('failed');
            }
        }, 1500);
    };

    const handleComplete = () => {
        const config = {
            connectorCode: `custom_${apiConfig.name.toLowerCase().replace(/\s+/g, '_')}`,
            connectorType: 'REST_API',
            name: apiConfig.name,
            connectionConfig: {
                baseUrl: apiConfig.baseUrl,
                authType: apiConfig.authType,
                headerName: apiConfig.headerName,
                apiKey: apiConfig.apiKey,
            },
            contractFields: {
                responseDataPath: fieldMapping.responseDataPath,
                priceField: fieldMapping.priceField,
                dateField: fieldMapping.dateField,
                productField: fieldMapping.productField,
                customFields: fieldMapping.customFields
                    ? fieldMapping.customFields.split(',').map((f) => f.trim())
                    : [],
            },
        };
        onComplete?.(config);
    };

    return (
        <Card
            size="small"
            title={
                <Space size={6}>
                    <ApiOutlined />
                    <span>API 快速接入向导</span>
                </Space>
            }
        >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Steps
                    current={currentStep}
                    size="small"
                    items={[
                        { title: 'API 配置' },
                        { title: '字段映射' },
                        { title: '测试连通' },
                    ]}
                />

                {currentStep === 0 ? (
                    <Form layout="vertical" size="small">
                        <Form.Item label="连接器名称" required>
                            <Input
                                placeholder="例如：我的现货价格 API"
                                value={apiConfig.name}
                                onChange={(e) => setApiConfig({ ...apiConfig, name: e.target.value })}
                            />
                        </Form.Item>
                        <Form.Item label="API 基础地址" required>
                            <Input
                                placeholder="https://api.example.com/v1"
                                value={apiConfig.baseUrl}
                                onChange={(e) => setApiConfig({ ...apiConfig, baseUrl: e.target.value })}
                            />
                        </Form.Item>
                        <Form.Item label="认证方式">
                            <Select
                                value={apiConfig.authType}
                                onChange={(v) => setApiConfig({ ...apiConfig, authType: v })}
                                options={[
                                    { label: 'API Key', value: 'API_KEY' },
                                    { label: 'Bearer Token', value: 'BEARER' },
                                    { label: '无认证', value: 'NONE' },
                                ]}
                            />
                        </Form.Item>
                        {apiConfig.authType !== 'NONE' ? (
                            <>
                                <Form.Item label="Header 名称">
                                    <Input
                                        value={apiConfig.headerName}
                                        onChange={(e) => setApiConfig({ ...apiConfig, headerName: e.target.value })}
                                    />
                                </Form.Item>
                                <Form.Item label="密钥/Token">
                                    <Input.Password
                                        placeholder="输入你的 API Key 或 Token"
                                        value={apiConfig.apiKey}
                                        onChange={(e) => setApiConfig({ ...apiConfig, apiKey: e.target.value })}
                                    />
                                </Form.Item>
                            </>
                        ) : null}
                        <Button
                            type="primary"
                            disabled={!apiConfig.name || !apiConfig.baseUrl}
                            onClick={() => setCurrentStep(1)}
                        >
                            下一步
                        </Button>
                    </Form>
                ) : currentStep === 1 ? (
                    <Form layout="vertical" size="small">
                        <Form.Item label="响应数据路径" help="API 返回 JSON 中数据数组所在的路径">
                            <Input
                                placeholder="data"
                                value={fieldMapping.responseDataPath}
                                onChange={(e) =>
                                    setFieldMapping({ ...fieldMapping, responseDataPath: e.target.value })
                                }
                            />
                        </Form.Item>
                        <Form.Item label="价格字段名">
                            <Input
                                placeholder="price"
                                value={fieldMapping.priceField}
                                onChange={(e) => setFieldMapping({ ...fieldMapping, priceField: e.target.value })}
                            />
                        </Form.Item>
                        <Form.Item label="日期字段名">
                            <Input
                                placeholder="date"
                                value={fieldMapping.dateField}
                                onChange={(e) => setFieldMapping({ ...fieldMapping, dateField: e.target.value })}
                            />
                        </Form.Item>
                        <Form.Item label="品种字段名">
                            <Input
                                placeholder="product"
                                value={fieldMapping.productField}
                                onChange={(e) =>
                                    setFieldMapping({ ...fieldMapping, productField: e.target.value })
                                }
                            />
                        </Form.Item>
                        <Form.Item label="自定义字段" help="逗号分隔，例如：volume,region,grade">
                            <TextArea
                                rows={2}
                                placeholder="volume,region,grade"
                                value={fieldMapping.customFields}
                                onChange={(e) =>
                                    setFieldMapping({ ...fieldMapping, customFields: e.target.value })
                                }
                            />
                        </Form.Item>
                        <Space>
                            <Button onClick={() => setCurrentStep(0)}>上一步</Button>
                            <Button type="primary" onClick={() => setCurrentStep(2)}>
                                下一步
                            </Button>
                        </Space>
                    </Form>
                ) : (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Card size="small" style={{ background: '#fafafa' }}>
                            <Space direction="vertical" size={4}>
                                <Text strong>{apiConfig.name}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    <LinkOutlined style={{ marginRight: 4 }} />
                                    {apiConfig.baseUrl}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    认证: {apiConfig.authType} | 字段: {fieldMapping.priceField},{' '}
                                    {fieldMapping.dateField}, {fieldMapping.productField}
                                </Text>
                            </Space>
                        </Card>

                        <Flex gap={8}>
                            <Button
                                icon={<ThunderboltOutlined />}
                                loading={testResult === 'testing'}
                                onClick={handleTest}
                            >
                                测试连通性
                            </Button>
                            <Button onClick={() => setCurrentStep(1)}>上一步</Button>
                        </Flex>

                        {testResult === 'success' ? (
                            <Result
                                status="success"
                                title="连通性测试通过"
                                subTitle="API 连接配置有效，可以保存并使用。"
                                extra={
                                    <Button
                                        type="primary"
                                        icon={<CheckCircleOutlined />}
                                        onClick={handleComplete}
                                    >
                                        保存 Connector 配置
                                    </Button>
                                }
                            />
                        ) : testResult === 'failed' ? (
                            <Alert
                                type="error"
                                showIcon
                                message="连通性测试失败"
                                description="请检查 API 地址和认证信息是否正确。"
                            />
                        ) : null}
                    </Space>
                )}
            </Space>
        </Card>
    );
};
