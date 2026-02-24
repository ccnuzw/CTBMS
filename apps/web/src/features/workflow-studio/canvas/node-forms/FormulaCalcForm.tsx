import React from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import { ExpressionEditor } from '../ExpressionEditor';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const FormulaCalcForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="计算公式" required help="使用常见的数学符号即可，例如: (a + b) * 1.5">
                {/* ExpressionEditor needs currentNodeId but FormProps doesn't have it yet. 
                     We can pass it later or use simple Input.TextArea for now. 
                     Ideally PropertyPanel passes nodeId to FormProps. 
                     For now, using TextArea as placeholder or simple ExpressionEditor without nodeId context.
                 */}
                <Input.TextArea
                    value={config.expression as string}
                    onChange={(e) => onChange('expression', e.target.value)}
                    rows={4}
                    style={{ fontFamily: 'monospace' }}
                    placeholder="可以直接输入前面步骤的变量名或数字"
                />
            </Form.Item>

            <Form.Item label="计算精度 (小数位数)">
                <InputNumber
                    value={config.precision as number ?? 2}
                    onChange={(v) => onChange('precision', v)}
                    style={{ width: '100%' }}
                    min={0}
                    max={10}
                />
            </Form.Item>

            <Form.Item label="舍入规则">
                <Select
                    value={config.roundingMode as string}
                    onChange={(v) => onChange('roundingMode', v)}
                    options={[
                        { label: '四舍五入', value: 'HALF_UP' },
                        { label: '向上取整', value: 'CEILING' },
                        { label: '向下取整', value: 'FLOOR' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="空值处理策略">
                <Select
                    value={config.nullPolicy as string ?? 'FAIL'}
                    onChange={(v) => onChange('nullPolicy', v)}
                    options={[
                        { label: '抛出异常中止流程', value: 'FAIL' },
                        { label: '直接返回空值 (Null)', value: 'RETURN_NULL' },
                        { label: '在此计算中当作 0 处理', value: 'ZERO' },
                    ]}
                />
            </Form.Item>
        </Form>
    );
};
