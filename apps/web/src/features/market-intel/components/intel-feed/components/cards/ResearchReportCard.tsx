import React, { useState } from 'react';
import { Card, Typography, Tag, Flex, Space, Button, Tooltip, Divider, theme, Progress, Modal, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import {
    FileTextOutlined,
    FilePdfOutlined,
    DownloadOutlined,
    EyeOutlined,
    StarOutlined,
    StarFilled,
    LinkOutlined,
    MoreOutlined,
    CalendarOutlined,
    TeamOutlined,
    BookOutlined,
    EditOutlined,
    DeleteOutlined,
    ShareAltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { IntelItem } from '../../types';
import { useIncrementViewCount, useIncrementDownloadCount } from '../../../../api/hooks';
import { stripHtml } from '../../utils';

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
    const navigate = useNavigate();
    const [isFavorited, setIsFavorited] = useState(false);

    const { mutate: incrementView } = useIncrementViewCount();
    const { mutate: incrementDownload } = useIncrementDownloadCount();

    // 获取研报关联数据
    const reportData = intel.researchReport || {};
    const reportId = reportData.id;

    // 解析关键观点
    const keyPoints = Array.isArray(reportData.keyPoints)
        ? reportData.keyPoints.map((k: any) => typeof k === 'string' ? k : k.point)
        : [];

    // 预览功能
    const handlePreview = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (reportId) {
            incrementView(reportId);
            navigate(`/intel/research-reports/${reportId}`);
        } else {
            message.warning('研报ID不存在,无法预览');
        }
    };

    // 下载功能
    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (reportId) {
            incrementDownload(reportId);
            // TODO: 实际下载逻辑需要从后端获取文件URL
            message.info('下载功能开发中,请从详情页下载');
        } else {
            message.warning('研报ID不存在,无法下载');
        }
    };

    // 引用来源功能
    const handleViewSource = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (intel.id) {
            // 跳转到原始情报详情页
            navigate(`/intel/feed/${intel.intelId || intel.id}`);
        } else {
            message.warning('无法定位原始情报');
        }
    };

    // 收藏功能
    const handleFavorite = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFavorited(!isFavorited);
        message.success(isFavorited ? '已取消收藏' : '已收藏到个人知识库');
        // TODO: 调用收藏API
    };

    // 更多操作菜单
    const moreMenuItems: MenuProps['items'] = [
        {
            key: 'edit',
            label: '编辑',
            icon: <EditOutlined />,
            onClick: () => {
                navigate(`/intel/entry?id=${intel.id}`);
            },
        },
        {
            key: 'share',
            label: '分享',
            icon: <ShareAltOutlined />,
            onClick: () => {
                message.info('分享功能开发中...');
            },
        },
        {
            type: 'divider',
        },
        {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
                Modal.confirm({
                    title: '确认删除',
                    content: '确定要删除这篇研报吗?此操作不可恢复。',
                    okText: '确认',
                    cancelText: '取消',
                    onOk: () => {
                        message.success('删除成功');
                        // TODO: 调用删除API
                    },
                });
            },
        },
    ];

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
                {stripHtml(reportData.summary || intel.summary) || '暂无摘要'}
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
                                {stripHtml(point)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <Divider style={{ margin: '12px 0' }} />

            {/* 操作栏 */}
            <Flex justify="space-between" align="center">
                <Space>
                    <Button
                        type="primary"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={handlePreview}
                    >
                        预览
                    </Button>
                    <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={handleDownload}
                    >
                        下载
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        icon={<LinkOutlined />}
                        style={{ padding: 0 }}
                        onClick={handleViewSource}
                    >
                        引用来源
                    </Button>
                </Space>
                <Space>
                    <Tooltip title={isFavorited ? '取消收藏' : '收藏'}>
                        <Button
                            type="text"
                            size="small"
                            icon={isFavorited ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                            onClick={handleFavorite}
                        />
                    </Tooltip>
                    <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
                        <Button
                            type="text"
                            size="small"
                            icon={<MoreOutlined />}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </Dropdown>
                </Space>
            </Flex>
        </Card>
    );
};
