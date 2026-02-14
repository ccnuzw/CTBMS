import React from 'react';
import { Form, InputNumber, Select, Slider } from 'antd';

interface DecisionMergeFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const DecisionMergeForm: React.FC<DecisionMergeFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="合并策略">
                <Select
                    value={(config.strategy as string) ?? 'WEIGHTED_SUM'}
                    onChange={(v) => onChange('strategy', v)}
                    options={[
                        { label: '加权求和', value: 'WEIGHTED_SUM' },
                        { label: '与逻辑 (AND)', value: 'AND' },
                        { label: '或逻辑 (OR)', value: 'OR' },
                        { label: '最高置信度优先', value: 'MAX_CONFIDENCE' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="通过阈值 (Threshold)">
                <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={(config.threshold as number) ?? 0.8}
                    onChange={(v) => onChange('threshold', v)}
                    marks={{ 0.5: '0.5', 0.8: '0.8' }}
                />
            </Form.Item>
        </Form>
    );
};
