import React from 'react';
import { Form, InputNumber, Select, Switch } from 'antd';
import { useDecisionRulePacks } from '../../../workflow-rule-center/api';

interface RulePackEvalFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const RulePackEvalForm: React.FC<RulePackEvalFormProps> = ({ config, onChange }) => {
    const { data: rulePackPage, isLoading } = useDecisionRulePacks({
        includePublic: true,
        isActive: true,
        page: 1,
        pageSize: 300,
    });

    const rulePackCodes = Array.isArray(config.rulePackCodes)
        ? (config.rulePackCodes as unknown[]).filter((item): item is string => typeof item === 'string')
        : [];

    const rulePackOptions = (rulePackPage?.data || [])
        .filter((item) => item.isActive)
        .map((item) => ({
            label: `${item.name} (${item.rulePackCode})`,
            value: item.rulePackCode,
        }));

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
            <Form.Item label="主规则包" required>
                <Select
                    value={config.rulePackCode as string}
                    onChange={(value) => onChange('rulePackCode', value)}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                    options={rulePackOptions}
                    placeholder="选择规则包"
                />
            </Form.Item>
            <Form.Item label="附加规则包（可选）">
                <Select
                    mode="multiple"
                    value={rulePackCodes}
                    onChange={(value) => onChange('rulePackCodes', value)}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                    options={rulePackOptions}
                    placeholder="选择附加规则包"
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
