import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Radio, Space, Button, Typography, Row, Col, Divider, Tooltip } from 'antd';
import { SwapOutlined, CodeOutlined, FormOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { VariableSelector } from '../VariableSelector';
import { ExpressionEditor } from '../ExpressionEditor'; // Assuming reusing this for code mode
// import { useReactFlow } from '@xyflow/react'; // If needed for context

const { Text } = Typography;

interface RuleEvalFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    currentNodeId?: string; // Might need to pass this down from PropertyPanel
}

export const RuleEvalForm: React.FC<RuleEvalFormProps> = ({ config, onChange, currentNodeId }) => {
    // Current node ID is improvingly passed or we might need to get it from context if not available.
    // Ideally PropertyPanel passes it. But PropertyPanel uses createElement.
    // Let's assume PropertyPanel passes it?
    // Checking PropertyPanel: "React.createElement(NODE_FORM_REGISTRY[nodeType], { config, onChange })"
    // It does NOT pass currentNodeId. I need to fix PropertyPanel to pass it or use a hook.
    // VariableSelector uses useReactFlow().currentNodeId? No, it takes props.
    // I need to update PropertyPanel to pass currentNodeId to the form.

    // For now, I'll rely on a prop that I WILL add to PropertyPanel.

    const [mode, setMode] = useState<'visual' | 'code'>('visual');
    const [valueType, setValueType] = useState<'static' | 'variable'>('static');

    useEffect(() => {
        // Detect value type
        const val = config.value as string;
        if (typeof val === 'string' && val.startsWith('{{') && val.endsWith('}}')) {
            setValueType('variable');
        } else {
            setValueType('static');
        }
    }, [config.value]);

    const operatorOptions = [
        { label: 'Equals (==)', value: 'EQ' },
        { label: 'Not Equals (!=)', value: 'NEQ' },
        { label: 'Greater Than (>)', value: 'GT' },
        { label: 'Greater or Equal (>=)', value: 'GTE' },
        { label: 'Less Than (<)', value: 'LT' },
        { label: 'Less or Equal (<=)', value: 'LTE' },
        { label: 'Contains', value: 'CONTAINS' },
        { label: 'Matches Regex', value: 'MATCHES' },
        { label: 'Is Null', value: 'IS_NULL' },
        { label: 'Is Not Null', value: 'NOT_NULL' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>Rule Configuration</Text>
                <Radio.Group
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    size="small"
                    optionType="button"
                >
                    <Radio.Button value="visual"><FormOutlined /> Visual</Radio.Button>
                    <Radio.Button value="code"><CodeOutlined /> Code</Radio.Button>
                </Radio.Group>
            </div>

            {mode === 'visual' ? (
                <Form layout="vertical" size="small">
                    <Form.Item label="Comparison Field (Left)" required tooltip="The variable to check">
                        {/* We need currentNodeId for VariableSelector */}
                        {/* I will add a placeholder if missing */}
                        <VariableSelector
                            value={config.fieldPath as string}
                            onChange={(val) => onChange('fieldPath', val)}
                            currentNodeId={currentNodeId || ''}
                        />
                    </Form.Item>

                    <Form.Item label="Operator" required>
                        <Select
                            value={config.operator as string || 'EQ'}
                            onChange={(val) => onChange('operator', val)}
                            options={operatorOptions}
                        />
                    </Form.Item>

                    {!['IS_NULL', 'NOT_NULL'].includes(config.operator as string) && (
                        <Form.Item
                            label={
                                <Space>
                                    <span>Comparison Value (Right)</span>
                                    <Tooltip title="Switch between static value and variable">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<SwapOutlined />}
                                            onClick={() => {
                                                const next = valueType === 'static' ? 'variable' : 'static';
                                                setValueType(next);
                                                onChange('value', ''); // Clear value on switch
                                            }}
                                        >
                                            {valueType === 'static' ? 'Use Variable' : 'Use Static'}
                                        </Button>
                                    </Tooltip>
                                </Space>
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
                                    placeholder="Enter static value"
                                />
                            )}
                        </Form.Item>
                    )}

                    <Divider style={{ margin: '12px 0' }} />

                    <Form.Item label="Description" style={{ marginBottom: 0 }}>
                        <Input.TextArea
                            value={config.ruleName as string}
                            onChange={(e) => onChange('ruleName', e.target.value)}
                            placeholder="Human readable description for this rule"
                            rows={2}
                        />
                    </Form.Item>
                </Form>
            ) : (
                <Form layout="vertical" size="small">
                    <Form.Item label="Rule Code" tooltip="Advanced: Use a pre-defined rule code">
                        <Input
                            value={config.ruleCode as string}
                            onChange={(e) => onChange('ruleCode', e.target.value)}
                            placeholder="e.g. RULE_001"
                        />
                    </Form.Item>
                    <Form.Item label="Field Path">
                        <Input
                            value={config.fieldPath as string}
                            onChange={(e) => onChange('fieldPath', e.target.value)}
                        />
                    </Form.Item>
                    <Form.Item label="Operator">
                        <Input
                            value={config.operator as string}
                            onChange={(e) => onChange('operator', e.target.value)}
                        />
                    </Form.Item>
                    <Form.Item label="Value">
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
