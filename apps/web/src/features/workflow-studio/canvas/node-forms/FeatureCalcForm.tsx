import React from 'react';
import { Form, Input, Select, InputNumber } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const FeatureCalcForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="特征类型 (Feature Type)" required>
                <Select
                    value={config.featureType as string}
                    onChange={(v) => onChange('featureType', v)}
                    options={[
                        { label: '变化率 (Change Rate)', value: 'change_rate' },
                        { label: '移动平均 (Moving Average)', value: 'ma' },
                        { label: 'Z-Score (Standard Score)', value: 'z_score' },
                        { label: '同比 (YoY)', value: 'yoy' },
                        { label: '环比 (MoM)', value: 'mom' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="数据字段 (Data Key)" help="输入数据对象的 Key">
                <Input
                    value={config.dataKey as string}
                    onChange={(e) => onChange('dataKey', e.target.value)}
                    placeholder="默认: close"
                />
            </Form.Item>

            {(config.featureType === 'ma' || config.featureType === 'change_rate') && (
                <Form.Item label="窗口周期 (Window Size)">
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
