import React from 'react';
import { Card, Transfer, Typography, Tooltip, Space, Tag } from 'antd';
import { QuestionCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { AVAILABLE_TOOLS } from '../constants';

const { Text } = Typography;

interface VisualToolPolicyBuilderProps {
    value?: { allowedTools?: string[]; blockedTools?: string[] };
    onChange?: (value: { allowedTools?: string[]; blockedTools?: string[] }) => void;
}

export const VisualToolPolicyBuilder: React.FC<VisualToolPolicyBuilderProps> = ({ value, onChange }) => {
    const allowedKeys = value?.allowedTools || [];
    const blockedKeys = value?.blockedTools || [];

    // Transfer data source
    const dataSource = AVAILABLE_TOOLS.map(tool => ({
        key: tool.value,
        title: tool.label,
        description: tool.description,
    }));

    const handleAllowedChange = (targetKeys: string[]) => {
        onChange?.({ ...value, allowedTools: targetKeys });
    };

    const handleBlockedChange = (targetKeys: string[]) => {
        onChange?.({ ...value, blockedTools: targetKeys });
    };

    return (
        <Card
            size="small"
            title={
                <Space>
                    <ToolOutlined />
                    <span>工具策略配置</span>
                    <Tooltip title="配置智能体允许和禁止使用的工具">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                </Space>
            }
        >
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <div>
                    <Text strong>允许使用的工具 (Allowed Tools)</Text>
                    <div style={{ marginTop: 8 }}>
                        <Transfer
                            dataSource={dataSource}
                            titles={['可用工具', '已允许']}
                            targetKeys={allowedKeys}
                            onChange={handleAllowedChange}
                            render={item => (
                                <Tooltip title={item.description}>
                                    <span>{item.title}</span>
                                </Tooltip>
                            )}
                            listStyle={{
                                width: 450,
                                height: 400,
                            }}
                        />
                    </div>
                </div>

                <div>
                    <Text strong>明确禁用的工具 (Blocked Tools)</Text>
                    <div style={{ marginTop: 8 }}>
                        <Transfer
                            dataSource={dataSource}
                            titles={['可用工具', '已禁用']}
                            targetKeys={blockedKeys}
                            onChange={handleBlockedChange}
                            render={item => (
                                <Tooltip title={item.description}>
                                    <span style={{ color: 'red' }}>{item.title}</span>
                                </Tooltip>
                            )}
                            listStyle={{
                                width: 450,
                                height: 400,
                            }}
                        />
                    </div>
                </div>
            </Space>
        </Card>
    );
};
