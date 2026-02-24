import React from 'react';
import { Form, Select, Slider, Alert } from 'antd';

interface DecisionMergeFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const DecisionMergeForm: React.FC<DecisionMergeFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="多路决策合并器"
                description="当上游有多个并行的智能体（如：研究员 A 和分析师 B）同时给出意见时，本节点负责将它们综合成一个最终结论。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />
            <Form.Item label="合并策略" required help="决定如何对待上方各位专家的意见">
                <Select
                    value={(config.strategy as string) ?? 'WEIGHTED_SUM'}
                    onChange={(v) => onChange('strategy', v)}
                    options={[
                        { label: '⚖️ 加权求和综合评分', value: 'WEIGHTED_SUM' },
                        { label: '🤝 要求全员一致同意 (AND)', value: 'AND' },
                        { label: '🙋 只要有一方赞成即可 (OR)', value: 'OR' },
                        { label: '🌟 采信最高置信度的一方', value: 'MAX_CONFIDENCE' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="通过放行阈值" help="如果策略计算后的最终得分大于等于该值，则节点判定为通过（通常 0.5 以上为正向）">
                <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={(config.threshold as number) ?? 0.8}
                    onChange={(v) => onChange('threshold', v)}
                    marks={{ 0: '0', 0.5: '中立 (0.5)', 0.8: '严格 (0.8)', 1: '1' }}
                />
            </Form.Item>
        </Form>
    );
};
