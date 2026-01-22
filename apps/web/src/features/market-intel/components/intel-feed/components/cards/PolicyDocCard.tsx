import React from 'react';
import { Card, Typography, Tag, Flex, Space, Button, Tooltip, Divider, theme, List, Alert } from 'antd';
import {
    FileProtectOutlined,
    BankOutlined,
    CalendarOutlined,
    EyeOutlined,
    StarOutlined,
    MoreOutlined,
    WarningOutlined,
    CheckCircleOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { IntelItem } from '../../types';

const { Text, Title } = Typography;

interface PolicyDocCardProps {
    intel: IntelItem;
    style?: React.CSSProperties;
    onClick?: () => void;
}

export const PolicyDocCard: React.FC<PolicyDocCardProps> = ({
    intel,
    style,
    onClick,
}) => {
    const { token } = theme.useToken();

    // 模拟政策文件特有信息
    const policyMeta = {
        issuer: '国家粮食和物资储备局',
        docNumber: '粮规〔2024〕12号',
        category: '监管政策',
        keyPoints: [
            { text: '加强收购环节质量监管', type: 'warning' },
            { text: '规范市场价格信息发布', type: 'info' },
            { text: '建立市场预警机制', type: 'success' },
            { text: '加大违规处罚力度', type: 'warning' },
        ],
        impactAssessment: '对东北产区粮食收购企业影响较大，建议关注合规风险。',
    };

    const getPointIcon = (type: string) => {
        switch (type) {
            case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />;
            case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
            default: return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
        }
    };

    return (
        <Card
            hoverable
            style={{
                ...style,
                borderLeft: `3px solid #722ed1`,
            }}
            bodyStyle={{ padding: 16 }}
            onClick={onClick}
        >
            {/* 头部 */}
            <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
                <Flex align="center" gap={8}>
                    <FileProtectOutlined style={{ color: '#722ed1', fontSize: 18 }} />
                    <Title level={5} style={{ margin: 0 }}>{intel.title}</Title>
                </Flex>
                <Tag color="purple" bordered={false}>政策文件</Tag>
            </Flex>

            {/* 元信息 */}
            <Flex gap={16} wrap="wrap" style={{ marginBottom: 12, fontSize: 12, color: token.colorTextSecondary }}>
                <Flex align="center" gap={4}>
                    <BankOutlined />
                    <span>{policyMeta.issuer}</span>
                </Flex>
                <Flex align="center" gap={4}>
                    <CalendarOutlined />
                    <span>{dayjs(intel.effectiveTime).format('YYYY-MM-DD')}</span>
                </Flex>
                <Tag bordered={false}>{policyMeta.docNumber}</Tag>
                <Tag color="purple" bordered={false}>{policyMeta.category}</Tag>
            </Flex>

            {/* 政策要点 */}
            <div style={{ marginBottom: 12 }}>
                <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                    <FileProtectOutlined style={{ color: '#722ed1' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>政策要点</Text>
                </Flex>
                <List
                    size="small"
                    dataSource={policyMeta.keyPoints}
                    renderItem={(point, idx) => (
                        <List.Item style={{ padding: '6px 0', borderBottom: 'none' }}>
                            <Flex align="center" gap={8}>
                                {getPointIcon(point.type)}
                                <Text style={{ fontSize: 13 }}>{idx + 1}. {point.text}</Text>
                            </Flex>
                        </List.Item>
                    )}
                    style={{ background: token.colorFillQuaternary, padding: '4px 12px', borderRadius: token.borderRadius }}
                />
            </div>

            {/* 影响分析 */}
            <Alert
                message="影响分析"
                description={policyMeta.impactAssessment}
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
            />

            <Divider style={{ margin: '12px 0' }} />

            {/* 操作栏 */}
            <Flex justify="space-between" align="center">
                <Space>
                    <Button type="primary" size="small" icon={<EyeOutlined />}>
                        查看全文
                    </Button>
                    <Button size="small">
                        影响评估
                    </Button>
                </Space>
                <Space>
                    <Tooltip title="收藏">
                        <Button type="text" size="small" icon={<StarOutlined />} />
                    </Tooltip>
                    <Tooltip title="更多">
                        <Button type="text" size="small" icon={<MoreOutlined />} />
                    </Tooltip>
                </Space>
            </Flex>
        </Card>
    );
};
