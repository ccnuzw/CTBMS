import React from 'react';
import { Form, Select, InputNumber, Alert } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ApprovalForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="人工审批挂起站"
                description="当流程运转到此节点时，系统会自动暂停执行并向指定审批人发送待办。只有当审批人同意后，后续节点才会继续运行。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="分配审批角色" required help="哪个岗位负责决定这条数据的死活？">
                <Select
                    value={config.approverRole as string}
                    onChange={(v) => onChange('approverRole', v)}
                    options={[
                        { label: '风控经理', value: 'RISK_MANAGER' },
                        { label: '交易主管', value: 'TRADER_LEAD' },
                        { label: '合规专员', value: 'COMPLIANCE' },
                        { label: '系统管理员', value: 'ADMIN' },
                    ]}
                    placeholder="必须要指定一名审批方"
                />
            </Form.Item>

            <Form.Item label="超时时长设定 (分钟)" help="如果超过这时间还没人点同意，则触发超时动作">
                <InputNumber
                    value={config.timeoutMinutes as number ?? 60}
                    onChange={(v) => onChange('timeoutMinutes', v)}
                    style={{ width: '100%' }}
                    min={1}
                />
            </Form.Item>

            <Form.Item label="到达超时后的兜底动作" required help="负责审批的人如果一直不看怎么办？">
                <Select
                    value={config.timeoutAction as string}
                    onChange={(v) => onChange('timeoutAction', v)}
                    options={[
                        { label: '❌ 视同拒绝 (直接打回终止流程)', value: 'REJECT' },
                        { label: '✅ 自动通过 (默许该流程放行)', value: 'APPROVE' },
                        { label: '🚀 向上升级 (转交高级主管兜底)', value: 'ESCALATE' },
                    ]}
                    placeholder="选择超时后的动作"
                />
            </Form.Item>
        </Form>
    );
};
