import React from 'react';
import { Typography, Space, theme, Tag } from 'antd';
import { ClockCircleOutlined, DatabaseOutlined, RobotOutlined, SafetyOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface NodeConfigSummaryProps {
    nodeType: string;
    config: Record<string, unknown>;
}

export const NodeConfigSummary: React.FC<NodeConfigSummaryProps> = ({ nodeType, config }) => {
    const { token } = theme.useToken();

    const renderSummary = () => {
        switch (nodeType) {
            case 'cron-trigger':
                return (
                    <Space size={4}>
                        <ClockCircleOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />
                        <Text type="secondary" style={{ fontSize: 10 }}>{config.cronExpr ? String(config.cronExpr) : '未配置'}</Text>
                    </Space>
                );
            case 'data-fetch':
            case 'market-data-fetch':
                return (
                    <Space size={4}>
                        <DatabaseOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            {config.dataSourceCode ? String(config.dataSourceCode) : '未选数据源'}
                        </Text>
                    </Space>
                );
            case 'agent-call':
            case 'single-agent':
                return (
                    <Space size={4}>
                        <RobotOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            {config.agentProfileCode ? String(config.agentProfileCode) : '未绑定 Agent'}
                        </Text>
                    </Space>
                );
            case 'rule-pack-eval':
                return (
                    <Space size={4}>
                        <SafetyOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            {config.rulePackCode ? String(config.rulePackCode) : '未绑定规则包'}
                        </Text>
                    </Space>
                );
            case 'risk-gate':
                return (
                    <Space size={4}>
                        <SafetyOutlined style={{ fontSize: 10, color: token.colorError }} />
                        <Text type="secondary" style={{ fontSize: 10 }}>
                            {config.riskProfileCode ? String(config.riskProfileCode) : '未配置风控'}
                        </Text>
                    </Space>
                );
            case 'decision-merge':
                return config.decisionPolicy ? (
                    <Tag bordered={false} style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px' }}>
                        {String(config.decisionPolicy)}
                    </Tag>
                ) : null;
            default:
                return null;
        }
    };

    const content = renderSummary();
    if (!content) return null;

    return (
        <div style={{ marginTop: 4 }}>
            {content}
        </div>
    );
};
