import React from 'react';
import { Card, Typography, Tag, Flex, Space, Button, Tooltip, Divider, theme, Progress } from 'antd';
import {
    FileTextOutlined,
    FilePdfOutlined,
    DownloadOutlined,
    EyeOutlined,
    StarOutlined,
    LinkOutlined,
    MoreOutlined,
    CalendarOutlined,
    TeamOutlined,
    BookOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { IntelItem } from '../../types';

const { Text, Paragraph, Title } = Typography;

interface ResearchReportCardProps {
    intel: IntelItem;
    style?: React.CSSProperties;
    onClick?: () => void;
}

export const ResearchReportCard: React.FC<ResearchReportCardProps> = ({
    intel,
    style,
    onClick,
}) => {
    const { token } = theme.useToken();

    // 模拟研报特有信息
    const reportMeta = {
        pages: 12,
        fileSize: '3.2MB',
        institution: 'XX期货研究院',
        author: '张三',
        keyPoints: [
            '东北港口库存处于历史低位',
            '预计Q2价格震荡上行',
            '关注进口玉米到港节奏',
        ],
    };

    return (
        <Card
            hoverable
            style={{
                ...style,
                borderLeft: `3px solid #52c41a`,
            }}
            bodyStyle={{ padding: 16 }}
            onClick={onClick}
        >
            {/* 头部 */}
            <Flex justify="space-between" align="start" style={{ marginBottom: 12 }}>
                <Flex align="center" gap={8}>
                    <FilePdfOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                    <Title level={5} style={{ margin: 0 }}>{intel.title}</Title>
                </Flex>
                <Tag color="green" bordered={false}>研报</Tag>
            </Flex>

            {/* 元信息 */}
            <Flex gap={16} wrap="wrap" style={{ marginBottom: 12, fontSize: 12, color: token.colorTextSecondary }}>
                <Flex align="center" gap={4}>
                    <TeamOutlined />
                    <span>{reportMeta.institution}</span>
                </Flex>
                <Flex align="center" gap={4}>
                    <CalendarOutlined />
                    <span>{dayjs(intel.effectiveTime).format('YYYY-MM-DD')}</span>
                </Flex>
                <Flex align="center" gap={4}>
                    <BookOutlined />
                    <span>{reportMeta.pages} 页 · {reportMeta.fileSize}</span>
                </Flex>
                {intel.confidence && (
                    <Flex align="center" gap={4}>
                        <span>质量评分</span>
                        <Progress
                            percent={intel.qualityScore || 0}
                            size="small"
                            style={{ width: 80, marginBottom: 0 }}
                            strokeColor={intel.qualityScore && intel.qualityScore >= 80 ? '#52c41a' : '#faad14'}
                            format={(p) => `${p}`}
                        />
                    </Flex>
                )}
            </Flex>

            {/* 摘要 */}
            <Paragraph
                ellipsis={{ rows: 2 }}
                style={{ marginBottom: 12, color: token.colorText }}
            >
                {intel.summary}
            </Paragraph>

            {/* 核心观点 */}
            <div style={{ marginBottom: 12, padding: 12, background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
                <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                    <FileTextOutlined style={{ color: '#52c41a' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>核心观点</Text>
                </Flex>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {reportMeta.keyPoints.map((point, idx) => (
                        <li key={idx} style={{ fontSize: 13, marginBottom: 4 }}>
                            {point}
                        </li>
                    ))}
                </ul>
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 操作栏 */}
            <Flex justify="space-between" align="center">
                <Space>
                    <Button type="primary" size="small" icon={<EyeOutlined />}>
                        预览
                    </Button>
                    <Button size="small" icon={<DownloadOutlined />}>
                        下载
                    </Button>
                    <Button type="link" size="small" icon={<LinkOutlined />} style={{ padding: 0 }}>
                        引用来源
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
