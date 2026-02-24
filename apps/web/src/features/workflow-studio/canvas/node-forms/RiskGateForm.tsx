import React from 'react';
import { Form, Select, InputNumber, Alert } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const RiskGateForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="智能风控网关"
                description="本节点专门用于承接上游的“风控打分”或“违规检测”结果。当流入的数据风险分超标时，网关将根据您下方的配置执行拦截、报警或降级处理。"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="触发动作的风险等级门槛" help="当上游判定结果的风险等级大于或等于此值时，触发下方设定的处置动作。">
                <Select
                    value={config.riskGrade as string}
                    onChange={(v) => onChange('riskGrade', v)}
                    options={[
                        { label: '🟢 低风险 (只要有微小风险即拦截)', value: 'LOW' },
                        { label: '🟡 中等风险 (常规警报门槛)', value: 'MEDIUM' },
                        { label: '🟠 高风险 (严重违规或作弊嫌疑)', value: 'HIGH' },
                        { label: '🔴 极高风险 (致命级安全红线)', value: 'CRITICAL' },
                    ]}
                    placeholder="选择门槛等级"
                />
            </Form.Item>

            <Form.Item label="拦截风控分数" help="如果你偏好用具体的风控系统数字打分来判定（比如：信用分低于 60 即拦截）：">
                <InputNumber
                    value={config.scoreThreshold as number}
                    onChange={(v) => onChange('scoreThreshold', v)}
                    style={{ width: '100%' }}
                    placeholder="例如：60 (选填)"
                />
            </Form.Item>

            <Form.Item label="触发后的处置动作" required help="一旦认定超标，工作流该怎么办？">
                <Select
                    value={config.action as string}
                    onChange={(v) => onChange('action', v)}
                    options={[
                        { label: '🛡️ 立即阻断 (抛出异常并终止整个工作流)', value: 'BLOCK' },
                        { label: '🔔 仅告警记录 (保留案底，但放行流程)', value: 'ALERT' },
                        { label: '⏳ 挂起并转人工审批 (流程暂停)', value: 'APPROVAL' },
                        { label: '📉 降级处理 (跳过高危操作分支继续执行)', value: 'DEGRADE' },
                    ]}
                    placeholder="请选择对越线事件的处置方式"
                />
            </Form.Item>
        </Form>
    );
};
