import React from 'react';
import { Alert, Form, Select, InputNumber } from 'antd';
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
                message="规则包综合评估"
                description="将选定的规则包内所有规则进行综合打分，总分达到“通过分数”即算通过。"
            />

            <Form.Item label="规则包" required help="选择要使用的业务规则集合">
                <Select
                    value={config.rulePackCode as string}
                    onChange={(value) => onChange('rulePackCode', value)}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                    options={rulePackOptions}
                    placeholder="请选择规则包"
                />
            </Form.Item>

            <Form.Item label="版本执行策略" required>
                <Select
                    value={config.ruleVersionPolicy as string ?? 'LOCKED'}
                    onChange={(v) => onChange('ruleVersionPolicy', v)}
                    options={[
                        { label: '使用已发布的稳定版本（推荐）', value: 'LOCKED' },
                        { label: '使用最新草稿版本（测试时用）', value: 'LATEST' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="通过分数" required help="规则评估总分达到此分数才算通过。分数越高要求越严格。">
                <InputNumber
                    value={config.minHitScore as number ?? 60}
                    onChange={(v) => onChange('minHitScore', v)}
                    style={{ width: '100%' }}
                    min={0}
                    max={1000}
                />
            </Form.Item>
        </Form>
    );
};
