import React from 'react';
import { Form, Input, InputNumber, Select, Slider } from 'antd';

interface SingleAgentFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const SingleAgentForm: React.FC<SingleAgentFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="智能体标识 (Agent Code)" required>
                <Input
                    value={config.agentCode as string}
                    onChange={(e) => onChange('agentCode', e.target.value)}
                    placeholder="例如: AGENT_MARKET_EVAL_V1"
                />
            </Form.Item>
            <Form.Item label="模型覆盖 (Model Override)">
                <Select
                    value={config.model as string}
                    onChange={(v) => onChange('model', v)}
                    options={[
                        { label: 'Default', value: '' },
                        { label: 'GPT-4', value: 'gpt-4' },
                        { label: 'Claude 3 Opus', value: 'claude-3-opus' },
                        { label: 'Gemini Pro', value: 'gemini-pro' },
                    ]}
                    allowClear
                />
            </Form.Item>
            <Form.Item label="温度 (Temperature)">
                <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={(config.temperature as number) ?? 0.7}
                    onChange={(v) => onChange('temperature', v)}
                />
            </Form.Item>
        </Form>
    );
};
