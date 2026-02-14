import React from 'react';
import { Form, Select, Input } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const JudgeAgentForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="裁判智能体编码" required>
                <Input
                    value={config.agentCode as string}
                    onChange={(e) => onChange('agentCode', e.target.value)}
                    placeholder="例如: JUDGE_V1"
                />
            </Form.Item>

            <Form.Item label="裁决策略">
                <Select
                    value={config.judgePolicy as string ?? 'WEIGHTED'}
                    onChange={(v) => onChange('judgePolicy', v)}
                    options={[
                        { label: '加权评分', value: 'WEIGHTED' },
                        { label: '全票通过', value: 'UNANIMOUS' },
                        { label: '多数票', value: 'MAJORITY' },
                        { label: '一票否决', value: 'VETO' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="评分标准">
                <Input.TextArea
                    value={config.rubric as string}
                    onChange={(e) => onChange('rubric', e.target.value)}
                    rows={4}
                    placeholder="输入评分标准或提示词指令..."
                />
            </Form.Item>
        </Form>
    );
};
