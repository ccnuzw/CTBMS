import React from 'react';
import { Form, Select, InputNumber } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ApprovalForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="审批角色 (Approver Role)">
                <Select
                    value={config.approverRole as string}
                    onChange={(v) => onChange('approverRole', v)}
                    options={[
                        { label: '风控经理 (Risk Manager)', value: 'RISK_MANAGER' },
                        { label: '交易主管 (Trader Lead)', value: 'TRADER_LEAD' },
                        { label: '合规专员 (Compliance)', value: 'COMPLIANCE' },
                        { label: '系统管理员 (Admin)', value: 'ADMIN' },
                    ]}
                    placeholder="选择审批角色"
                />
            </Form.Item>

            <Form.Item label="超时设置 (Timeout Action)">
                <Select
                    value={config.timeoutAction as string}
                    onChange={(v) => onChange('timeoutAction', v)}
                    options={[
                        { label: '自动拒绝 (Auto Reject)', value: 'REJECT' },
                        { label: '自动通过 (Auto Approve)', value: 'APPROVE' },
                        { label: 'escalate (Escalate)', value: 'ESCALATE' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="超时时长 (分钟)">
                <InputNumber
                    value={config.timeoutMinutes as number ?? 60}
                    onChange={(v) => onChange('timeoutMinutes', v)}
                    style={{ width: '100%' }}
                    min={1}
                />
            </Form.Item>
        </Form>
    );
};
