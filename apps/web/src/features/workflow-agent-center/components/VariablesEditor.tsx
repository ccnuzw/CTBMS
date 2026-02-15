import React from 'react';
import { Button, Form, Input, Space, Card, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';

interface VariablesEditorProps {
    name?: string; // Form field name, default 'variablesList'
    label?: string;
}

export const VariablesEditor: React.FC<VariablesEditorProps> = ({ name = 'variablesList', label = '变量定义' }) => {
    return (
        <Form.List name={name}>
            {(fields, { add, remove }) => (
                <Card size="small" title={label} extra={<Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>添加变量</Button>}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {fields.map(({ key, name, ...restField }) => (
                            <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                <Form.Item
                                    {...restField}
                                    name={[name, 'key']}
                                    rules={[{ required: true, message: '请输入变量名' }]}
                                >
                                    <Input placeholder="变量名 (如 context)" style={{ width: 150 }} />
                                </Form.Item>
                                <Form.Item
                                    {...restField}
                                    name={[name, 'description']}
                                    rules={[{ required: true, message: '请输入描述' }]}
                                >
                                    <Input placeholder="描述 (如 流程上下文数据)" style={{ width: 300 }} />
                                </Form.Item>
                                <MinusCircleOutlined onClick={() => remove(name)} />
                            </Space>
                        ))}
                        {fields.length === 0 && <Typography.Text type="secondary">暂无变量定义，请点击上方按钮添加。</Typography.Text>}
                    </div>
                </Card>
            )}
        </Form.List>
    );
};
