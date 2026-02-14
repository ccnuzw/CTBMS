import React, { useState, useRef } from 'react';
import { Input, Button, Popover, Space, Typography, theme } from 'antd';
import { FunctionOutlined, PlusOutlined } from '@ant-design/icons';
import { VariableSelector } from './VariableSelector';

const { Text } = Typography;

interface ExpressionEditorProps {
    value?: string;
    onChange?: (value: string) => void;
    currentNodeId: string;
    placeholder?: string;
    disabled?: boolean;
}

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
    value = '',
    onChange,
    currentNodeId,
    placeholder = '输入表达式，使用 {{node.field}} 引用变量',
    disabled,
}) => {
    const { token } = theme.useToken();
    const [openvar, setOpenVar] = useState(false);
    const inputRef = useRef<any>(null);

    const handleInsertVariable = (variable: string) => {
        // Simple append for now, ideally insertion at cursor
        const newValue = value + variable;
        onChange?.(newValue);
        setOpenVar(false);
        inputRef.current?.focus();
    };

    return (
        <div style={{ position: 'relative' }}>
            <Input.TextArea
                ref={inputRef}
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                autoSize={{ minRows: 2, maxRows: 6 }}
                style={{
                    fontFamily: 'monospace',
                    paddingRight: 32, // Space for the button
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    zIndex: 1,
                }}
            >
                <Popover
                    content={
                        <div style={{ width: 300 }}>
                            <div style={{ marginBottom: 8 }}>
                                <Text strong>插入变量</Text>
                            </div>
                            <VariableSelector
                                currentNodeId={currentNodeId}
                                value=""
                                onChange={handleInsertVariable}
                            />
                        </div>
                    }
                    title="选择变量"
                    trigger="click"
                    open={openvar}
                    onOpenChange={setOpenVar}
                    placement="bottomRight"
                >
                    <Button
                        type="text"
                        size="small"
                        icon={<FunctionOutlined />}
                        style={{
                            color: token.colorPrimary,
                            background: token.colorBgContainer,
                            boxShadow: token.boxShadowSecondary,
                            border: `1px solid ${token.colorBorder}`,
                        }}
                    >
                        变量
                    </Button>
                </Popover>
            </div>
        </div>
    );
};
