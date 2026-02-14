import React from 'react';
import { Form, Select, Typography, Space } from 'antd';

const { Text } = Typography;

export interface ToolPolicyFormProps {
    name: string | string[];
}

export const ToolPolicyForm: React.FC<ToolPolicyFormProps> = ({ name }) => {
    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item
                name={[...(Array.isArray(name) ? name : [name]), 'allowedTools']}
                label="允许工具 (Allowed Tools)"
                tooltip="允许 Agent 调用的工具列表，输入后回车"
            >
                <Select mode="tags" placeholder="输入工具名称，如 search_web" tokenSeparators={[',']} />
            </Form.Item>
            <Form.Item
                name={[...(Array.isArray(name) ? name : [name]), 'blockedTools']}
                label="禁用工具 (Blocked Tools)"
                tooltip="明确禁止 Agent 调用的工具"
            >
                <Select mode="tags" placeholder="输入工具名称" tokenSeparators={[',']} />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
                配置 Agent 的工具调用权限。留空代表遵循全局策略。
            </Text>
        </Space>
    );
};
