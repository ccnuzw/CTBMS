import React from 'react';
import { Form, Input, InputNumber, Select, Alert, Space, Button } from 'antd';
import { useWorkflowUxMode } from '../../../../hooks/useWorkflowUxMode';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const FormulaCalcForm: React.FC<FormProps> = ({ config, onChange }) => {
    const uxMode = useWorkflowUxMode((s) => s.mode);
    const isSimple = uxMode === 'simple';
    const isExpert = uxMode === 'expert';
    // 快捷插入公式辅助函数
    const handleInsert = (str: string) => {
        const current = (config.expression as string) || '';
        onChange('expression', current + str);
    };

    return (
        <Form layout="vertical" size="small">
            <Alert
                message="如何引用前置节点数据？"
                description={
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                        <div>1. 从特定节点提取：<code style={{ background: '#f0f0f0', padding: '2px 4px' }}>$nodes.node_id_here.data.price</code></div>
                        <div>2. 支持标准数学方法：<code style={{ background: '#f0f0f0', padding: '2px 4px' }}>Math.abs(a - b)</code> 或简单的 <code style={{ background: '#f0f0f0', padding: '2px 4px' }}>(a + b) / 2</code></div>
                    </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="计算公式" required>
                <div style={{ marginBottom: 8 }}>
                    <Space size={[4, 4]} wrap>
                        <Button size="small" onClick={() => handleInsert(' + ')}>+</Button>
                        <Button size="small" onClick={() => handleInsert(' - ')}>-</Button>
                        <Button size="small" onClick={() => handleInsert(' * ')}>*</Button>
                        <Button size="small" onClick={() => handleInsert(' / ')}>/</Button>
                        <Button size="small" onClick={() => handleInsert('()')}>()</Button>
                        <Button size="small" onClick={() => handleInsert('Math.abs()')}>绝对值</Button>
                        <Button size="small" onClick={() => handleInsert('Math.round()')}>取整</Button>
                    </Space>
                </div>
                <Input.TextArea
                    value={config.expression as string}
                    onChange={(e) => onChange('expression', e.target.value)}
                    rows={4}
                    style={{ fontFamily: 'monospace', fontSize: 14 }}
                    placeholder="在此输入表达式，例如: ($nodes.fetch1.data.lastPrice - $nodes.fetch2.data.lastPrice) / 2"
                />
            </Form.Item>

            {!isSimple && (
                <Form.Item label="计算精度 (保留小数位数)">
                    <InputNumber
                        value={config.precision as number ?? 2}
                        onChange={(v) => onChange('precision', v)}
                        style={{ width: '100%' }}
                        min={0}
                        max={10}
                    />
                </Form.Item>
            )}

            {isExpert && (
                <Form.Item label="舍入规则">
                    <Select
                        value={config.roundingMode as string || 'HALF_UP'}
                        onChange={(v) => onChange('roundingMode', v)}
                        options={[
                            { label: '四舍五入', value: 'HALF_UP' },
                            { label: '向上取整', value: 'CEILING' },
                            { label: '向下取整', value: 'FLOOR' },
                        ]}
                    />
                </Form.Item>
            )}

            {isExpert && (
                <Form.Item label="空值应对策略" help="当公式引用的节点数据由于某些原因不存在时">
                    <Select
                        value={config.nullPolicy as string ?? 'FAIL'}
                        onChange={(v) => onChange('nullPolicy', v)}
                        options={[
                            { label: '🚨 抛出异常中止流程 (默认)', value: 'FAIL' },
                            { label: '🔄 直接返回空值 (Null)', value: 'RETURN_NULL' },
                            { label: '🔢 在此计算中当作 0 处理', value: 'ZERO' },
                        ]}
                    />
                </Form.Item>
            )}
        </Form>
    );
};
