import React from 'react';
import { Form, InputNumber } from 'antd';

interface ApiTriggerFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ApiTriggerForm: React.FC<ApiTriggerFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
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
