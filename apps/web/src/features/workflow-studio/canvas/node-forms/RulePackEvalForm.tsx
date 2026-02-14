import React from 'react';
import { Form, Input, InputNumber, Select } from 'antd';

interface RulePackEvalFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const RulePackEvalForm: React.FC<RulePackEvalFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="规则包代码 (Rule Pack Code)" required>
                <Input
                    value={config.rulePackCode as string}
                    onChange={(e) => onChange('rulePackCode', e.target.value)}
                    placeholder="RP_MARKET_BASIC"
                />
            </Form.Item>
            <Form.Item label="版本策略">
                <Select
                    value={(config.ruleVersionPolicy as string) ?? 'LOCKED'}
                    onChange={(v) => onChange('ruleVersionPolicy', v)}
                    options={[
                        { label: '锁定版本', value: 'LOCKED' },
                        { label: '总是最新', value: 'LATEST' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="最低命中分">
                <InputNumber
                    min={0}
                    max={100}
                    value={(config.minHitScore as number) ?? 60}
                    onChange={(v) => onChange('minHitScore', v)}
                />
            </Form.Item>
        </Form>
    );
};
