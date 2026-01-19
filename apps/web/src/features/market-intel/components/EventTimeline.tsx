import React, { useMemo } from 'react';
import { Timeline, Typography, Empty, Spin, theme, Flex } from 'antd';
import { MarketEventResponse } from '../api/hooks';
import { EventCard } from './EventCard';
import { ClockCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface EventTimelineProps {
    events: MarketEventResponse[];
    loading?: boolean;
    onEventClick?: (event: MarketEventResponse) => void;
    onViewSource?: (event: MarketEventResponse) => void;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
    events,
    loading = false,
    onEventClick,
    onViewSource,
}) => {
    const { token } = theme.useToken();

    // 按日期分组事件
    const groupedEvents = useMemo(() => {
        const groups: Record<string, MarketEventResponse[]> = {};

        events.forEach(event => {
            const date = new Date(event.createdAt).toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(event);
        });

        // 按日期倒序排序
        return Object.entries(groups).sort((a, b) => {
            // 简单比较第一个事件的时间（假设列表预先是倒序的）
            if (a[1].length === 0 || b[1].length === 0) return 0;
            return new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime();
        });
    }, [events]);

    if (loading && events.length === 0) {
        return (
            <Flex justify="center" align="center" style={{ padding: 40 }}>
                <Spin tip="加载事件流...">
                    <div style={{ padding: 50 }} />
                </Spin>
            </Flex>
        );
    }

    if (!loading && events.length === 0) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无市场事件"
                style={{ padding: 40 }}
            />
        );
    }

    return (
        <div style={{ padding: '0 12px' }}>
            <Timeline
                mode="left"
                items={groupedEvents.flatMap(([date, dayEvents]) => {
                    // 日期标题项
                    const dateItem = {
                        color: 'gray',
                        dot: <ClockCircleOutlined style={{ fontSize: 16 }} />,
                        children: (
                            <div style={{ paddingBottom: 16, paddingTop: 4 }}>
                                <Title level={5} style={{ margin: 0 }}>{date}</Title>
                            </div>
                        ),
                    };

                    // 事件列表项
                    const eventItems = dayEvents.map(event => ({
                        color: event.eventType.color || token.colorPrimary,
                        children: (
                            <div style={{ paddingBottom: 24 }}>
                                <div style={{
                                    marginBottom: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 12,
                                    color: token.colorTextSecondary
                                }}>
                                    <Text type="secondary">
                                        {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                    <div style={{ width: 1, height: 10, background: token.colorSplit }} />
                                    <Text type="secondary">{event.eventType.name}</Text>
                                </div>

                                <EventCard
                                    event={event}
                                    variant="compact"
                                    onClick={() => onEventClick?.(event)}
                                    onViewSource={() => onViewSource?.(event)}
                                    style={{
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                        border: `1px solid ${token.colorBorderSecondary}`
                                    }}
                                />
                            </div>
                        ),
                    }));

                    return [dateItem, ...eventItems];
                })}
            />
        </div>
    );
};
