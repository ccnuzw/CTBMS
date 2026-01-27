import React, { useMemo } from 'react';
import { Timeline, Card, Typography, Tag, Flex, Space, Empty, Spin, theme, Badge } from 'antd';
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

const { Text } = Typography;

interface TimelineViewProps {
    filterState: IntelFilterState;
    items: IntelItem[];
    loading: boolean;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

const CONTENT_TYPE_CONFIG: Record<ContentType, { icon: React.ReactNode; color: string; label: string }> = {
    [ContentType.DAILY_REPORT]: { icon: <FileTextOutlined />, color: '#1890ff', label: '日报' },
    [ContentType.RESEARCH_REPORT]: { icon: <FilePdfOutlined />, color: '#52c41a', label: '研报' },
    [ContentType.POLICY_DOC]: { icon: <FileProtectOutlined />, color: '#722ed1', label: '政策' },
};

const DEFAULT_CONTENT_CONFIG = { icon: <FileTextOutlined />, color: '#1890ff', label: '情报' };

const STATUS_CONFIG: Record<string, { label: string; badgeStatus: 'processing' | 'success' | 'error' | 'default' }> =
    {
        pending: { label: '待处理', badgeStatus: 'processing' },
        confirmed: { label: '已确认', badgeStatus: 'success' },
        flagged: { label: '已标记', badgeStatus: 'error' },
        archived: { label: '已归档', badgeStatus: 'default' },
    };

const UNKNOWN_DATE_KEY = 'UNKNOWN';

export const TimelineView: React.FC<TimelineViewProps> = ({
    filterState: _filterState,
    items,
    loading,
    onIntelSelect,
    selectedIntelId,
}) => {
    const { token } = theme.useToken();

    const groupedTimeline = useMemo(() => {
        if (!items || items.length === 0) return [];

        const groups = new Map<string, IntelItem[]>();

        const getItemTime = (item: IntelItem) => item.effectiveTime || item.createdAt;
        const getDateKey = (item: IntelItem) => {
            const time = getItemTime(item);
            const date = dayjs(time);
            return date.isValid() ? date.format('YYYY-MM-DD') : UNKNOWN_DATE_KEY;
        };

        items.forEach(item => {
            const key = getDateKey(item);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(item);
        });

        const getDateValue = (dateKey: string) => {
            if (dateKey === UNKNOWN_DATE_KEY) return -Infinity;
            const value = dayjs(dateKey).valueOf();
            return Number.isNaN(value) ? -Infinity : value;
        };

        return Array.from(groups.entries())
            .map(([date, groupItems]) => ({
                date,
                items: groupItems.sort((a, b) => {
                    const aTimeRaw = dayjs(getItemTime(a)).valueOf();
                    const bTimeRaw = dayjs(getItemTime(b)).valueOf();
                    const aTime = Number.isNaN(aTimeRaw) ? -Infinity : aTimeRaw;
                    const bTime = Number.isNaN(bTimeRaw) ? -Infinity : bTimeRaw;
                    return bTime - aTime;
                }),
            }))
            .sort((a, b) => getDateValue(b.date) - getDateValue(a.date));
    }, [items]);

    if (loading) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (groupedTimeline.length === 0) {
        return <Empty description="暂无情报数据" style={{ marginTop: 60 }} />;
    }

    return (
        <div style={{ maxWidth: 900, padding: '0 16px' }}>
            {groupedTimeline.map(group => (
                <div key={group.date} style={{ marginBottom: 32 }}>
                    {/* 日期标题 */}
                    <Flex align="center" gap={8} style={{ marginBottom: 16 }}>
                        <ClockCircleOutlined style={{ color: token.colorPrimary }} />
                        <Text strong style={{ fontSize: 16 }}>
                            {group.date === UNKNOWN_DATE_KEY
                                ? '未知日期'
                                : dayjs(group.date).format('MM月DD日 dddd')}
                        </Text>
                        <Badge count={group.items.length} style={{ backgroundColor: token.colorPrimary }} />
                    </Flex>

                    {/* 时间线 */}
                    <Timeline
                        items={group.items.map(item => {
                            const config = CONTENT_TYPE_CONFIG[item.contentType] || DEFAULT_CONTENT_CONFIG;
                            const isSelected = selectedIntelId === item.id;
                            const title = item.title || item.summary || '未命名情报';
                            const summary = item.summary || item.rawContent || '';
                            const statusConfig = STATUS_CONFIG[item.status];
                            const displayTime = dayjs(item.effectiveTime || item.createdAt).format('HH:mm');

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
                                        data-intel-id={item.intelId || item.id}
                                    >
                                        <Flex justify="space-between" align="start">
                                            <div style={{ flex: 1 }}>
                                                <Flex align="center" gap={8} style={{ marginBottom: 4 }}>
                                                    <Text strong>{title}</Text>
                                                    <Tag color={config.color} bordered={false} style={{ fontSize: 10 }}>
                                                        {config.label}
                                                    </Tag>
                                                    {statusConfig && (
                                                        <Badge
                                                            status={statusConfig.badgeStatus}
                                                            text={statusConfig.label}
                                                        />
                                                    )}
                                                </Flex>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {summary || '暂无摘要'}
                                                </Text>
                                            </div>
                                            <Space direction="vertical" align="end" size={0}>
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    {displayTime}
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
