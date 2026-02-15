import React from 'react';
import { Form, InputNumber, Select } from 'antd';

interface DebateRoundFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const DebateRoundForm: React.FC<DebateRoundFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="最大轮次">
                <InputNumber
                    min={1}
                    max={10}
                    value={(config.maxRounds as number) ?? 3}
                    onChange={(v) => onChange('maxRounds', v)}
                    style={{ width: '100%' }}
                />
            </Form.Item>
            <Form.Item label="裁判策略">
                <Select
                    value={(config.judgePolicy as string) ?? 'WEIGHTED'}
                    onChange={(v) => onChange('judgePolicy', v)}
                    options={[
                        { label: '加权投票', value: 'WEIGHTED' },
                        { label: '一票否决', value: 'VETO' },
                        { label: '多数决', value: 'MAJORITY' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="参与者">
                <Select
                    mode="tags"
                    value={(config.participants as string[]) ?? []}
                    onChange={(v) => onChange('participants', v)}
                    placeholder="输入参与者智能体编码"
                    tokenSeparators={[',']}
                />
            </Form.Item>
        </Form>
    );
};
