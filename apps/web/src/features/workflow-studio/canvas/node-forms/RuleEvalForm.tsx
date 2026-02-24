import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Radio, Space, Button, Typography, Divider, Tooltip, Alert } from 'antd';
import { SwapOutlined, CodeOutlined, FormOutlined } from '@ant-design/icons';
import { VariableSelector } from '../VariableSelector';

const { Text } = Typography;

interface RuleEvalFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    currentNodeId?: string;
}

export const RuleEvalForm: React.FC<RuleEvalFormProps> = ({ config, onChange, currentNodeId }) => {
    const [mode, setMode] = useState<'visual' | 'code'>('visual');
    const [valueType, setValueType] = useState<'static' | 'variable'>('static');

    useEffect(() => {
        const val = config.value as string;
        if (typeof val === 'string' && val.startsWith('{{') && val.endsWith('}}')) {
            setValueType('variable');
        } else {
            setValueType('static');
        }
    }, [config.value]);

    const operatorOptions = [
        { label: '等于 (==)', value: 'EQ' },
        { label: '不等于 (!=)', value: 'NEQ' },
        { label: '大于 (>)', value: 'GT' },
        { label: '大于或等于 (>=)', value: 'GTE' },
        { label: '小于 (<)', value: 'LT' },
        { label: '小于或等于 (<=)', value: 'LTE' },
        { label: '包含 (Contains)', value: 'CONTAINS' },
        { label: '正则匹配 (Matches)', value: 'MATCHES' },
        { label: '为空 (Is Null)', value: 'IS_NULL' },
        { label: '不为空 (Not Null)', value: 'NOT_NULL' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>规则评估配置</Text>
                <Radio.Group
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    size="small"
                    optionType="button"
                >
                    <Radio.Button value="visual"><FormOutlined /> 可视化配置</Radio.Button>
                    <Radio.Button value="code"><CodeOutlined /> 极客模式</Radio.Button>
                </Radio.Group>
            </div>

            {mode === 'visual' ? (
                <Form layout="vertical" size="small">
                    <Alert
                        message="如何配置判断逻辑？"
                        description="您需要在左侧提取数据字段（如某节点的 price），在右侧设置期望值（静态数字或引用另一节点变量），中间选择对比算子（大于、等于）。"
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    <Form.Item label="比较字段 (左侧目标)" required tooltip="从上游节点的数据对象中提取想要判断的字段">
                        <VariableSelector
                            value={config.fieldPath as string}
                            onChange={(val) => onChange('fieldPath', val)}
                            currentNodeId={currentNodeId || ''}
                        />
                    </Form.Item>

                    <Form.Item label="操作符 (计算关系)" required>
                        <Select
                            value={config.operator as string || 'EQ'}
                            onChange={(val) => onChange('operator', val)}
                            options={operatorOptions}
                        />
                    </Form.Item>

                    {!['IS_NULL', 'NOT_NULL'].includes(config.operator as string) && (
                        <Form.Item
                            label={
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span>对比值 (右侧参考)</span>
                                    <Tooltip title={valueType === 'static' ? '点击切换为引用上游节点变量' : '点击切换为手填固定值'}>
                                        <Button
                                            size="small"
                                            type="link"
                                            icon={<SwapOutlined />}
                                            onClick={() => {
                                                const next = valueType === 'static' ? 'variable' : 'static';
                                                setValueType(next);
                                                onChange('value', '');
                                            }}
                                        >
                                            {valueType === 'static' ? '切换为 [变量]' : '切换为 [静态]'}
                                        </Button>
                                    </Tooltip>
                                </div>
                            }
                            required
                        >
                            {valueType === 'variable' ? (
                                <VariableSelector
                                    value={config.value as string}
                                    onChange={(val) => onChange('value', val)}
                                    currentNodeId={currentNodeId || ''}
                                />
                            ) : (
                                <Input
                                    value={config.value as string}
                                    onChange={(e) => onChange('value', e.target.value)}
                                    placeholder="输入静态的比对值（如：100，或一段文本）"
                                />
                            )}
                        </Form.Item>
                    )}

                    <Divider style={{ margin: '12px 0' }} />

                    <Form.Item label="规则描述 (选填)" style={{ marginBottom: 0 }}>
                        <Input.TextArea
                            value={config.ruleName as string}
                            onChange={(e) => onChange('ruleName', e.target.value)}
                            placeholder="给这套规则起个容易理解的名字，如：价格是否超出警戒线"
                            rows={2}
                        />
                    </Form.Item>
                </Form>
            ) : (
                <Form layout="vertical" size="small">
                    <Alert
                        message="极客代码模式"
                        description="在此模式下，您可以直接填入服务端预设的高级过滤代码与底层参数，建议仅技术人员使用。"
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    <Form.Item label="系统级判定码" tooltip="输入服务端硬编码的判定标识 (如 RULES_001)">
                        <Input
                            value={config.ruleCode as string}
                            onChange={(e) => onChange('ruleCode', e.target.value)}
                            placeholder="示例：LIMIT_CHK_01"
                        />
                    </Form.Item>
                    <Form.Item label="底层 Field Path">
                        <Input
                            value={config.fieldPath as string}
                            onChange={(e) => onChange('fieldPath', e.target.value)}
                        />
                    </Form.Item>
                    <Form.Item label="底层 Operator">
                        <Input
                            value={config.operator as string}
                            onChange={(e) => onChange('operator', e.target.value)}
                        />
                    </Form.Item>
                    <Form.Item label="底层 Value">
                        <Input
                            value={config.value as string}
                            onChange={(e) => onChange('value', e.target.value)}
                        />
                    </Form.Item>
                </Form>
            )}
        </div>
    );
};
