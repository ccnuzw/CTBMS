import React from 'react';
import { Card, List, Tag, Typography, Space, theme } from 'antd';
import { ClockCircleOutlined, AlertOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useIntelligenceFeed } from '../../../../api/hooks';
import { ContentType, IntelItem } from '../../types';

const { Text } = Typography;

export const RecentEventsWidget: React.FC = () => {
    const { token } = theme.useToken();

    // Fetch recent events/signals
    const { data: feedData, isLoading } = useIntelligenceFeed({
        limit: 5,
        contentTypes: [ContentType.DAILY_REPORT], // Assuming DAILY_REPORT contains events
        // In real scenario, filter by "has events" or similar
    });

    const events = feedData?.slice(0, 5) || [];

    return (
        <Card
            title={
                <Space>
                    <AlertOutlined style={{ color: token.colorPrimary }} />
                    <span>实时事件流</span>
                </Space>
            }
            bodyStyle={{ padding: '0 12px' }}
        >
            <List
                loading={isLoading}
                itemLayout="horizontal"
                dataSource={events}
                renderItem={(item: IntelItem) => (
                    <List.Item style={{ padding: '10px 0' }}>
                        <List.Item.Meta
                            avatar={
                                <div style={{ marginTop: 4 }}>
                                    <Tag color={item.confidence && item.confidence > 80 ? 'red' : 'blue'}>
                                        {item.sourceType === 'OFFICIAL' ? '官方' : '情报'}
                                    </Tag>
                                </div>
                            }
                            title={
                                <Text
                                    ellipsis={{ tooltip: true }}
                                    style={{ width: '100%', fontSize: 13 }}
                                >
                                    {item.title || item.summary?.substring(0, 20)}
                                </Text>
                            }
                            description={
                                <Space size={4} style={{ fontSize: 11 }}>
                                    <ClockCircleOutlined />
                                    <span>{dayjs(item.effectiveTime).format('MM-DD HH:mm')}</span>
                                    {item.location && (
                                        <>
                                            <span style={{ margin: '0 4px' }}>|</span>
                                            <span>{item.location}</span>
                                        </>
                                    )}
                                </Space>
                            }
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
};
