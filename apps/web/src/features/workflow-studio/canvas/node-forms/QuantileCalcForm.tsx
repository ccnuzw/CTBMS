import React from 'react';
import { Form, Select, Space, Button, InputNumber } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

const COMMON_PERCENTILES = [
    { label: '极小值(0%)', value: 0 },
    { label: '25%分位(Q1)', value: 25 },
    { label: '中位数(50%)', value: 50 },
    { label: '75%分位(Q3)', value: 75 },
    { label: '90%分位', value: 90 },
    { label: '95%分位', value: 95 },
    { label: '极大值(100%)', value: 100 },
];

export const QuantileCalcForm: React.FC<FormProps> = ({ config, onChange }) => {
    // 确保 value 是数组
    const percentiles = Array.isArray(config.percentiles)
        ? config.percentiles as number[]
        : [25, 50, 75, 90, 95];

    const togglePercentile = (val: number) => {
        const next = percentiles.includes(val)
            ? percentiles.filter(p => p !== val)
            : [...percentiles, val].sort((a, b) => a - b);
        onChange('percentiles', next);
    };

    return (
        <Form layout="vertical" size="small">
            <Form.Item label="计算模型" required help="目前系统仅支持标准概率分布的分位计算">
                <Select
                    value={config.quantileType as string ?? 'percentile'}
                    onChange={(v) => onChange('quantileType', v)}
                    options={[
                        { label: '标准百分位数 (Percentile)', value: 'percentile' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="目标分位点集合 (%)" required help="你可以多选下方常用点或手动补充其他数值">
                <div style={{ marginBottom: 16 }}>
                    <Select
                        mode="tags"
                        style={{ width: '100%' }}
                        placeholder="输入0-100之间的数字并回车，例如: 33"
                        value={percentiles.map(String)}
                        onChange={(vals) => {
                            const nums = vals.map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 100);
                            onChange('percentiles', Array.from(new Set(nums)).sort((a, b) => a - b));
                        }}
                    />
                </div>

                <Space wrap size={[8, 8]}>
                    {COMMON_PERCENTILES.map((item) => {
                        const isSelected = percentiles.includes(item.value);
                        return (
                            <Button
                                key={item.value}
                                size="small"
                                type={isSelected ? 'primary' : 'dashed'}
                                onClick={() => togglePercentile(item.value)}
                            >
                                {item.label}
                            </Button>
                        );
                    })}
                </Space>
            </Form.Item>
        </Form>
    );
};
