import React from 'react';
import { Form, InputNumber, Space, Typography } from 'antd';

const { Text } = Typography;

export interface RetryPolicyFormProps {
    name: string | string[];
}

export const RetryPolicyForm: React.FC<RetryPolicyFormProps> = ({ name }) => {
    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Space align="baseline">
                <Form.Item
                    name={[...(Array.isArray(name) ? name : [name]), 'retryCount']}
                    label="重试次数"
                    tooltip="最大重试次数"
                    initialValue={1}
                    rules={[{ type: 'number', min: 0, max: 10 }]}
                    style={{ marginBottom: 0 }}
                >
                    <InputNumber min={0} max={10} />
                </Form.Item>
                <Form.Item
                    name={[...(Array.isArray(name) ? name : [name]), 'retryBackoffMs']}
                    label="重试间隔 (ms)"
                    tooltip="每次重试之间的等待时间"
                    initialValue={2000}
                    rules={[{ type: 'number', min: 0 }]}
                    style={{ marginBottom: 0 }}
                >
                    <InputNumber min={0} step={100} style={{ width: 140 }} />
                </Form.Item>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
                配置 Agent 执行失败时的重试逻辑。
            </Text>
        </Space>
    );
};
