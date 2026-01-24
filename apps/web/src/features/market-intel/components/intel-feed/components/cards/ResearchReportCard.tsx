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

    // 获取研报关联数据
    const reportData = intel.researchReport || {};

    // 解析关键观点
    const keyPoints = Array.isArray(reportData.keyPoints)
        ? reportData.keyPoints.map((k: any) => typeof k === 'string' ? k : k.point)
        : [];

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
                    <Title level={5} style={{ margin: 0 }}>{reportData.title || intel.title || '无标题研报'}</Title>
                </Flex>
                <Tag color="green" bordered={false}>研报</Tag>
            </Flex>

            {/* 元信息 */}
            <Flex gap={16} wrap="wrap" style={{ marginBottom: 12, fontSize: 12, color: token.colorTextSecondary }}>
                <Flex align="center" gap={4}>
                    <TeamOutlined />
                    <span>{reportData.source || '未知机构'}</span>
                </Flex>
                <Flex align="center" gap={4}>
                    <CalendarOutlined />
                    <span>
                        {dayjs(reportData.publishDate || intel.effectiveTime).format('YYYY-MM-DD')}
                    </span>
                </Flex>
                {/* 暂时没有页数和大小信息，先隐藏或显示默认 */}
                <Flex align="center" gap={4}>
                    <BookOutlined />
                    <span>PDF文档</span>
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
                {reportData.summary || intel.summary || '暂无摘要'}
            </Paragraph>

            {/* 核心观点 */}
            {keyPoints.length > 0 && (
                <div style={{ marginBottom: 12, padding: 12, background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
                    <Flex align="center" gap={6} style={{ marginBottom: 8 }}>
                        <FileTextOutlined style={{ color: '#52c41a' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>核心观点</Text>
                    </Flex>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {keyPoints.slice(0, 3).map((point: string, idx: number) => (
                            <li key={idx} style={{ fontSize: 13, marginBottom: 4 }}>
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

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
