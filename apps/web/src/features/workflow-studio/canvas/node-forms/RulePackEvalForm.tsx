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
                description="节点将把对应业务包内的全部活跃规则进行组合运算和打分，最终由【通过阈值】决定该节点是否放行。"
            />

            <Form.Item label="调用规则包" required help="选择需要绑定评估的核心业务规则集合">
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
                        { label: '锁定通过审核的最新发布版 (推荐)', value: 'LOCKED' },
                        { label: '激进模式: 无论是否发布，使用最新草稿', value: 'LATEST' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="通过阈值分数 (Minimum Hit Score)" required help="规则包内命中的规则总得分必须大于或等于此阈值，才算【评估通过】。">
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
