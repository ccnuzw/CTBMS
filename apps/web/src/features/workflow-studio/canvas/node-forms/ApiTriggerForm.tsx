import React from 'react';
import { Form, InputNumber, Alert, Select } from 'antd';

interface ApiTriggerFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ApiTriggerForm: React.FC<ApiTriggerFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="Webhook 调用地址说明"
                description={
                    <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                        POST /api/v1/workflows/&#123;workflowId&#125;/trigger
                    </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />
            <Form.Item label="认证方式" help="建议对公开暴露的按需触发接口开启访问认证">
                <Select
                    value={config.authType as string || 'NONE'}
                    onChange={(v) => onChange('authType', v)}
                    options={[
                        { label: '无认证 (公开)', value: 'NONE' },
                        { label: 'API Key (请求头 x-api-key)', value: 'API_KEY' },
                        { label: 'Bearer Token (Authorization 标头)', value: 'BEARER_TOKEN' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="请求频率限制 (次/分钟)" help="保护当前工作流免受外部流量重击">
                <InputNumber
                    min={1}
                    max={1000}
                    value={(config.rateLimitQpm as number) ?? 60}
                    onChange={(v) => onChange('rateLimitQpm', v)}
                    style={{ width: '100%' }}
                />
            </Form.Item>
        </Form>
    );
};
