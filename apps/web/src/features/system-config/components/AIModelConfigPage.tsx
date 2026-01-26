
import { PageContainer, ProForm, ProFormText, ProFormDigit, ProFormSwitch, ProFormSelect } from '@ant-design/pro-components';
import { Card, App, Alert, Space, Button } from 'antd';
import { useAIConfig, useUpdateAIConfig } from '../api';
import { useEffect } from 'react';
import { Form } from 'antd';

export const AIModelConfigPage = () => {
    const { message } = App.useApp();
    const { data: config, isLoading } = useAIConfig('DEFAULT');
    const updateMutation = useUpdateAIConfig();
    const [form] = Form.useForm();

    useEffect(() => {
        if (config) {
            form.setFieldsValue(config);
        }
    }, [config, form]);

    const handleFinish = async (values: any) => {
        try {
            await updateMutation.mutateAsync({ ...values, configKey: 'DEFAULT' });
            message.success('配置已保存');
        } catch (error) {
            message.error('保存失败');
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
                    message="配置即时生效"
                    description="在此处的修改将立即应用于所有新的 AI 分析任务。请确保 API 密钥的有效性，否则 AI 服务将无法工作。"
                    type="info"
                    showIcon
                />

                <Card title="Analysis Model Settings">
                    <ProForm
                        form={form}
                        onFinish={handleFinish}
                        loading={isLoading}
                        submitter={{
                            searchConfig: {
                                submitText: 'Save Changes',
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
