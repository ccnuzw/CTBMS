import React, { useMemo } from 'react';
import { Timeline, Card, Typography, Tag, Flex, Space, Empty, theme, Badge } from 'antd';
import {
    FileTextOutlined,
    FilePdfOutlined,
    FileProtectOutlined,
    ClockCircleOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { IntelFilterState, IntelItem } from '../../types';
import { ContentType } from '../../../../types';

const { Text, Paragraph } = Typography;

interface TimelineViewProps {
    filterState: IntelFilterState;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

// 模拟数据（按日期分组）
const MOCK_TIMELINE_DATA: { date: string; items: IntelItem[] }[] = [
    {
        date: '2026-01-22',
        items: [
            {
                id: '1',
                type: 'intel',
                contentType: ContentType.DAILY_REPORT,
                sourceType: 'FIRST_LINE' as any,
                category: 'B_SEMI_STRUCTURED' as any,
                title: '锦州港玉米价格异动',
                summary: '锦州港玉米收购价上涨20元/吨',
                rawContent: '',
                effectiveTime: new Date(),
                createdAt: new Date(),
                location: '锦州港',
                confidence: 92,
                status: 'confirmed',
            },
            {
                id: '2',
                type: 'intel',
                contentType: ContentType.DAILY_REPORT,
                sourceType: 'FIRST_LINE' as any,
                category: 'B_SEMI_STRUCTURED' as any,
                title: '大连港玉米到港量下降',
                summary: '大连港今日玉米到港车辆较昨日减少15%',
                rawContent: '',
                effectiveTime: new Date(),
                createdAt: new Date(Date.now() - 3600000),
                location: '大连港',
                confidence: 89,
                status: 'pending',
            },
        ],
    },
    {
        date: '2026-01-21',
        items: [
            {
                id: '3',
                type: 'intel',
                contentType: ContentType.RESEARCH_REPORT,
                sourceType: 'RESEARCH_INST' as any,
                category: 'C_DOCUMENT' as any,
                title: '2024年Q1玉米市场回顾与展望',
                summary: '本报告对2024年第一季度玉米市场进行了全面分析',
                rawContent: '',
                effectiveTime: new Date(Date.now() - 86400000),
                createdAt: new Date(Date.now() - 86400000),
                location: 'XX期货研究院',
                confidence: 88,
                status: 'confirmed',
            },
        ],
    },
    {
        date: '2026-01-20',
        items: [
            {
                id: '4',
                type: 'intel',
                contentType: ContentType.POLICY_DOC,
                sourceType: 'OFFICIAL_GOV' as any,
                category: 'C_DOCUMENT' as any,
                title: '关于加强粮食市场监管的通知',
                summary: '国家粮食和物资储备局发布通知',
                rawContent: '',
                effectiveTime: new Date(Date.now() - 172800000),
                createdAt: new Date(Date.now() - 172800000),
                location: '国家粮食和物资储备局',
                confidence: 100,
                status: 'confirmed',
            },
        ],
    },
];

const CONTENT_TYPE_CONFIG: Record<ContentType, { icon: React.ReactNode; color: string; label: string }> = {
    [ContentType.DAILY_REPORT]: { icon: <FileTextOutlined />, color: '#1890ff', label: '日报' },
    [ContentType.RESEARCH_REPORT]: { icon: <FilePdfOutlined />, color: '#52c41a', label: '研报' },
    [ContentType.POLICY_DOC]: { icon: <FileProtectOutlined />, color: '#722ed1', label: '政策' },
};

export const TimelineView: React.FC<TimelineViewProps> = ({
    filterState,
    onIntelSelect,
    selectedIntelId,
}) => {
    const { token } = theme.useToken();

    if (MOCK_TIMELINE_DATA.length === 0) {
        return <Empty description="暂无情报数据" style={{ marginTop: 60 }} />;
    }

    return (
        <div style={{ maxWidth: 900, padding: '0 16px' }}>
            {MOCK_TIMELINE_DATA.map(group => (
                <div key={group.date} style={{ marginBottom: 32 }}>
                    {/* 日期标题 */}
                    <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
                        <ClockCircleOutlined style={{ color: token.colorPrimary }} />
                        <Text strong style={{ fontSize: 16 }}>
                            {dayjs(group.date).format('MM月DD日 dddd')}
                        </Text>
                        <Badge count={group.items.length} style={{ backgroundColor: token.colorPrimary }} />
                    </Flex>

                    {/* 时间线 */}
                    <Timeline
                        items={group.items.map(item => {
                            const config = CONTENT_TYPE_CONFIG[item.contentType];
                            const isSelected = selectedIntelId === item.id;

                            return {
                                dot: (
                                    <div
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: '50%',
                                            background: config.color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            fontSize: 14,
                                        }}
                                    >
                                        {config.icon}
                                    </div>
                                ),
                                children: (
                                    <Card
                                        hoverable
                                        size="small"
                                        style={{
                                            marginLeft: 8,
                                            cursor: 'pointer',
                                            borderColor: isSelected ? config.color : undefined,
                                            boxShadow: isSelected ? `0 0 0 2px ${config.color}20` : undefined,
                                        }}
                                        bodyStyle={{ padding: '12px 16px' }}
                                        onClick={() => onIntelSelect(item)}
                                    >
                                        <Flex justify="space-between" align="start">
                                            <div style={{ flex: 1 }}>
                                                <Flex align="center" gap={8} style={{ marginBottom: 4 }}>
                                                    <Text strong>{item.title}</Text>
                                                    <Tag color={config.color} bordered={false} style={{ fontSize: 10 }}>
                                                        {config.label}
                                                    </Tag>
                                                    {item.status === 'pending' && (
                                                        <Badge status="processing" text="待处理" />
                                                    )}
                                                </Flex>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {item.summary}
                                                </Text>
                                            </div>
                                            <Space direction="vertical" align="end" size={0}>
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    {dayjs(item.createdAt).format('HH:mm')}
                                                </Text>
                                                {item.location && (
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        <EnvironmentOutlined /> {item.location}
                                                    </Text>
                                                )}
                                            </Space>
                                        </Flex>
                                    </Card>
                                ),
                            };
                        })}
                    />
                </div>
            ))}
        </div>
    );
};
