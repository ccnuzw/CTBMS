import React from 'react';
import { Form, InputNumber } from 'antd';

interface ApiTriggerFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ApiTriggerForm: React.FC<ApiTriggerFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="限流 (QPM)">
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
