import React from 'react';
import { Alert, Form, Select } from 'antd';
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

    const rulePackOptions = (rulePackPage?.data || [])
        .filter((item) => item.isActive)
        .map((item) => ({
            label: `${item.name} (${item.rulePackCode})`,
            value: item.rulePackCode,
        }));

    return (
        <Form layout="vertical" size="small">
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="已简化为单规则包模式"
                description="规则来源、版本策略与分层开关由系统自动处理。"
            />
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
        </Form>
    );
};
