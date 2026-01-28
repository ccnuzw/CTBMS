import { PageContainer, ProForm, ProFormText, ProFormDigit, ProFormSwitch, ProFormSelect } from '@ant-design/pro-components';
import { Card, App, Alert, Space, Button, Modal } from 'antd';
import { useAIConfig, useUpdateAIConfig, useTestAIConnection } from '../api';
import { useEffect } from 'react';
import { Form } from 'antd';

export const AIModelConfigPage = () => {
    const { message } = App.useApp();
    const { data: config, isLoading } = useAIConfig('DEFAULT');
    const updateMutation = useUpdateAIConfig();
    const testConnectionMutation = useTestAIConnection();
    const [form] = Form.useForm();

    useEffect(() => {
        if (config) {
            form.setFieldsValue(config);
        }
    }, [config, form]);

    const handleFinish = async (values: any) => {
        try {
            await updateMutation.mutateAsync({ ...values, configKey: 'DEFAULT' });
            message.success('配置已保存 (Configuration Saved)');
        } catch (error) {
            message.error('保存失败 (Save Failed)');
        }
    };

    const handleTestConnection = async () => {
        try {
            // Ensure we save first? Or just test current DB config?
            // User requested "Test connection with DB config".
            // Ideally user should save first to test NEW values. 
            // So we might warn if form is dirty? For now, simple.

            const result = await testConnectionMutation.mutateAsync();

            if (result.success) {
                Modal.success({
                    title: '✅ Connection Successful',
                    content: (
                        <div>
                            <p>{result.message}</p>
                            <div style={{ marginBottom: 10 }}>
                                <p style={{ margin: 0 }}><strong>API URL:</strong> {result.apiUrl}</p>
                                <p style={{ margin: 0 }}><strong>Model:</strong> {result.modelId}</p>
                            </div>
                            <div style={{
                                background: '#f5f5f5',
                                padding: '8px 12px',
                                borderRadius: 6,
                                border: '1px solid #d9d9d9',
                                fontSize: 12,
                                fontFamily: 'monospace',
                                maxHeight: 150,
                                overflow: 'auto'
                            }}>
                                {result.response}
                            </div>
                        </div>
                    ),
                    width: 500,
                });
            } else {
                Modal.error({
                    title: '❌ Connection Failed',
                    content: (
                        <div>
                            <p style={{ fontWeight: 500 }}>{result.message}</p>
                            {result.error && (
                                <div style={{
                                    background: '#fff1f0',
                                    border: '1px solid #ffa39e',
                                    padding: 8,
                                    borderRadius: 4,
                                    marginTop: 8,
                                    color: '#cf1322',
                                    fontSize: 12
                                }}>
                                    {result.error}
                                </div>
                            )}
                            <p style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                                Target: {result.apiUrl || 'Unknown URL'}
                            </p>
                        </div>
                    )
                });
            }
        } catch (error) {
            message.error('Test request failed (Network Error)');
        }
    };

    return (
        <PageContainer
            header={{
                title: 'AI 模型配置 (AI Model Configuration)',
                subTitle: '配置全局 AI 服务参数（支持 Gemini/OpenAI），用于商情分析与提取。',
            }}
        >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Alert
                    message="配置即时生效 (Live Configuration)"
                    description="在此处的修改保存后将立即应用于所有 AI 分析任务。可以先点击 'Test Connection' 验证连通性。"
                    type="info"
                    showIcon
                />

                <Card title="Analysis Model Settings">
                    <ProForm
                        form={form}
                        onFinish={handleFinish}
                        loading={isLoading}
                        submitter={{
                            render: (props, doms) => {
                                return [
                                    <Button
                                        key="test"
                                        onClick={handleTestConnection}
                                        loading={testConnectionMutation.isPending}
                                        style={{ marginRight: 8 }}
                                    >
                                        📡 Test Connection
                                    </Button>,
                                    ...doms
                                ];
                            },
                        }}
                    >
                        <ProFormSelect
                            name="provider"
                            label="Provider"
                            options={[
                                { label: 'Google Gemini', value: 'google' },
                                { label: 'OpenAI (Compatible)', value: 'openai' },
                            ]}
                            rules={[{ required: true }]}
                            initialValue="google"
                        />

                        <ProFormText
                            name="modelName"
                            label="Model Name"
                            tooltip="e.g. gemini-1.5-pro or gpt-4"
                            rules={[{ required: true }]}
                            initialValue="gemini-1.5-pro"
                        />

                        <ProFormText
                            name="apiUrl"
                            label="Custom API URL"
                            tooltip="Optional. Override default Gemini URL (e.g. http://127.0.0.1:8045)"
                            placeholder="https://generativelanguage.googleapis.com/v1"
                        />

                        <ProFormText.Password
                            name="apiKey"
                            label="API Key"
                            tooltip="Leave empty to use Environment Variable (GEMINI_API_KEY)"
                            placeholder="sk-..."
                        />

                        <ProForm.Group>
                            <ProFormDigit
                                name="temperature"
                                label="Temperature"
                                tooltip="0.0 - 1.0 (Higher = Creative, Lower = Deterministic)"
                                min={0}
                                max={1}
                                step={0.1}
                                width="sm"
                                initialValue={0.3}
                            />
                            <ProFormDigit
                                name="maxTokens"
                                label="Max Output Tokens"
                                min={100}
                                max={32000}
                                width="sm"
                                initialValue={8192}
                            />
                        </ProForm.Group>

                        <ProForm.Group>
                            <ProFormDigit
                                name="maxRetries"
                                label="Max Retries"
                                min={0}
                                max={5}
                                width="xs"
                                initialValue={3}
                            />
                            <ProFormDigit
                                name="timeoutMs"
                                label="Timeout (ms)"
                                min={1000}
                                width="sm"
                                initialValue={30000}
                            />
                        </ProForm.Group>

                        <ProFormSwitch
                            name="isActive"
                            label="Enable AI Service"
                            initialValue={true}
                        />
                    </ProForm>
                </Card>
            </Space>
        </PageContainer>
    );
};
