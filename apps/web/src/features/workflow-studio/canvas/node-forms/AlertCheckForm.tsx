import React from 'react';
import { Form, Input, Select, InputNumber, Alert } from 'antd';
import { VariableSelector } from '../VariableSelector';

interface AlertCheckFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    currentNodeId?: string;
}

export const AlertCheckForm: React.FC<AlertCheckFormProps> = ({ config, onChange, currentNodeId }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="告警状态检查"
                description="节点将校验流入的数据对象是否满足下方设定的告警条件。如果数据突破阈值，工作流后续将被判定为告警触发状态。"
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="告警类型" required>
                <Select
                    value={config.alertType as string ?? 'THRESHOLD'}
                    onChange={(v) => onChange('alertType', v)}
                    options={[
                        { label: '单一数值超限 (Threshold Exceeded)', value: 'THRESHOLD' },
                        { label: '数据缺失 (Data Missing)', value: 'MISSING' },
                        { label: '逻辑判定异常 (Logic Violation)', value: 'LOGIC' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="监控目标字段 (Field Path)" required help="指明我们要监控上游数据的哪个属性">
                <VariableSelector
                    value={config.fieldPath as string}
                    onChange={(val) => onChange('fieldPath', val)}
                    currentNodeId={currentNodeId || ''}
                />
            </Form.Item>

            {config.alertType === 'THRESHOLD' && (
                <>
                    <Form.Item label="判断依据 (Operator)" required>
                        <Select
                            value={config.operator as string ?? 'GT'}
                            onChange={(v) => onChange('operator', v)}
                            options={[
                                { label: '大于 (>)', value: 'GT' },
                                { label: '大于等于 (>=)', value: 'GTE' },
                                { label: '小于 (<)', value: 'LT' },
                                { label: '小于等于 (<=)', value: 'LTE' },
                                { label: '等于 (==)', value: 'EQ' },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item label="触发告警的阈值 (Threshold)" required help="当目标字段的值满足判断依据与此阈值时，引爆告警。">
                        <InputNumber
                            value={config.threshold as number ?? 0}
                            onChange={(v) => onChange('threshold', v)}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </>
            )}

            <Form.Item label="关联告警策略 ID (可选)" help="如果命中，将生成的告警事件发送给哪个预置渠道">
                <Input
                    value={config.alertRuleId as string}
                    onChange={(e) => onChange('alertRuleId', e.target.value)}
                    placeholder="业务方的告警规则或邮件组编号，例: ALERT_RISK_G01"
                />
            </Form.Item>
        </Form>
    );
};
