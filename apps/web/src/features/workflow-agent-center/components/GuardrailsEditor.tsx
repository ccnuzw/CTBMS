import React from 'react';
import { Button, Checkbox, Form, Input, Space, Card, Typography, Row, Col } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';

interface GuardrailsEditorProps {
    name?: string; // Form field name prefix
}

export const GuardrailsEditor: React.FC<GuardrailsEditorProps> = ({ name = 'guardrailsConfig' }) => {
    return (
        <Card size="small" title="防护规则配置" style={{ marginBottom: 24 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>通用规则</Typography.Text>
                <Row gutter={[16, 16]}>
                    <Col span={12}>
                        <Form.Item name={[name, 'noHallucination']} valuePropName="checked" noStyle>
                            <Checkbox>禁止幻觉 (No Hallucination)</Checkbox>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name={[name, 'requireEvidence']} valuePropName="checked" noStyle>
                            <Checkbox>需要证据 (Require Evidence)</Checkbox>
                        </Form.Item>
                    </Col>
                </Row>

                <Typography.Text strong style={{ marginTop: 16, display: 'block' }}>自定义规则</Typography.Text>
                <Form.List name={[name, 'customRules']}>
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'key']}
                                        rules={[{ required: true, message: '规则Key' }]}
                                    >
                                        <Input placeholder="规则Key" style={{ width: 150 }} />
                                    </Form.Item>
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'value']}
                                        rules={[{ required: true, message: '规则值' }]}
                                    >
                                        <Input placeholder="规则值 (JSON string or boolean)" style={{ width: 200 }} />
                                    </Form.Item>
                                    <MinusCircleOutlined onClick={() => remove(name)} />
                                </Space>
                            ))}
                            <Form.Item>
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                    添加自定义规则
                                </Button>
                            </Form.Item>
                        </>
                    )}
                </Form.List>
            </Space>
        </Card>
    );
};
