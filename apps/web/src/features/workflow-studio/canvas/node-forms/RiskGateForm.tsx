import React from 'react';
import { Form, Select, InputNumber } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const RiskGateForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="风险等级阈值 (Risk Grade)" help="低于此等级通过，高于则触发动作">
                <Select
                    value={config.riskGrade as string}
                    onChange={(v) => onChange('riskGrade', v)}
                    options={[
                        { label: '低风险 (Low)', value: 'LOW' },
                        { label: '中风险 (Medium)', value: 'MEDIUM' },
                        { label: '高风险 (High)', value: 'HIGH' },
                        { label: '极高风险 (Critical)', value: 'CRITICAL' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="处置动作 (Action)">
                <Select
                    value={config.action as string}
                    onChange={(v) => onChange('action', v)}
                    options={[
                        { label: '阻断 (Block)', value: 'BLOCK' },
                        { label: '仅告警 (Alert Only)', value: 'ALERT' },
                        { label: '需人工审批 (Require Approval)', value: 'APPROVAL' },
                        { label: '降级处理 (Degrade)', value: 'DEGRADE' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="风控分数 (Score Threshold)">
                <InputNumber
                    value={config.scoreThreshold as number}
                    onChange={(v) => onChange('scoreThreshold', v)}
                    style={{ width: '100%' }}
                    placeholder="例如: 80"
                />
            </Form.Item>
        </Form>
    );
};
