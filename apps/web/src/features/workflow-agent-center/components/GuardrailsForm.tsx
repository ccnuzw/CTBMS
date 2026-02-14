import React from 'react';
import { Form, Switch, Space, Typography } from 'antd';

const { Text } = Typography;

export interface GuardrailsFormProps {
    name: string | string[];
}

export const GuardrailsForm: React.FC<GuardrailsFormProps> = ({ name }) => {
    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item
                name={[...(Array.isArray(name) ? name : [name]), 'requireEvidence']}
                label="强制证据引用 (Require Evidence)"
                valuePropName="checked"
                initialValue={true}
            >
                <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            <Form.Item
                name={[...(Array.isArray(name) ? name : [name]), 'noHallucination']}
                label="防幻觉增强 (No Hallucination)"
                valuePropName="checked"
                initialValue={true}
            >
                <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
                启用后，Agent 将被要求在回答中提供来源引用，并执行额外的防幻觉检查。
            </Text>
        </Space>
    );
};
