import React from 'react';
import { Form, Input, Select, InputNumber } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const FeatureCalcForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="特征特征计算类型" required>
                <Select
                    value={config.featureType as string}
                    onChange={(v) => onChange('featureType', v)}
                    options={[
                        { label: '波动变化率 (Change Rate)', value: 'change_rate' },
                        { label: '移动平均线 (Moving Average)', value: 'ma' },
                        { label: '异常值偏离度 (Z-Score)', value: 'z_score' },
                        { label: '同比涨跌 (YoY)', value: 'yoy' },
                        { label: '环比涨跌 (MoM)', value: 'mom' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="提取数据字段 (Data Key)" help="例如: close, price, value，将从列表每行中提取该字段进行算子处理">
                <Input
                    value={config.dataKey as string}
                    onChange={(e) => onChange('dataKey', e.target.value)}
                    placeholder="输入要计算的 JSON 对象键名，例如: close"
                />
            </Form.Item>

            {(config.featureType === 'ma' || config.featureType === 'change_rate') && (
                <Form.Item label="窗口周期 (Window Size)" help="注意: 必须确保前置节点传过来的数据条数大于等于该窗口值">
                    <InputNumber
                        value={config.window as number ?? 5}
                        onChange={(v) => onChange('window', v)}
                        style={{ width: '100%' }}
                        min={1}
                    />
                </Form.Item>
            )}
        </Form>
    );
};
