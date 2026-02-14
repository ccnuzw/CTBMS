import React from 'react';
import { Form, Input, InputNumber, Select, Switch } from 'antd';

interface RulePackEvalFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const RulePackEvalForm: React.FC<RulePackEvalFormProps> = ({ config, onChange }) => {
    const rulePackCodes = Array.isArray(config.rulePackCodes)
        ? (config.rulePackCodes as unknown[]).filter((item): item is string => typeof item === 'string')
        : [];

    return (
        <Form layout="vertical" size="small">
            <Form.Item label="规则来源">
                <Select
                    value={(config.ruleSource as string) ?? 'DECISION_RULE_PACK'}
                    onChange={(v) => onChange('ruleSource', v)}
                    options={[
                        { label: '决策规则包', value: 'DECISION_RULE_PACK' },
                        { label: '市场预警规则', value: 'MARKET_ALERT_RULE' },
                        { label: '业务映射规则', value: 'BUSINESS_MAPPING_RULE' },
                        { label: '提取规则', value: 'EXTRACTION_RULE' },
                        { label: '内联规则', value: 'INLINE' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="规则包代码 (Rule Pack Code)" required>
                <Input
                    value={config.rulePackCode as string}
                    onChange={(e) => onChange('rulePackCode', e.target.value)}
                    placeholder="RP_MARKET_BASIC"
                />
            </Form.Item>
            <Form.Item label="规则包列表 (逗号分隔)">
                <Input
                    value={rulePackCodes.join(',')}
                    onChange={(e) =>
                        onChange(
                            'rulePackCodes',
                            e.target.value
                                .split(',')
                                .map((item) => item.trim())
                                .filter(Boolean),
                        )
                    }
                    placeholder="RP_DEFAULT,RP_INDUSTRY,RP_EXPERIENCE"
                />
            </Form.Item>
            <Form.Item label="启用分层规则包">
                <Switch
                    checked={config.includeLayeredPacks === true}
                    onChange={(checked) => onChange('includeLayeredPacks', checked)}
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
