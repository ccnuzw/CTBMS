import React from 'react';
import { Card, List, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ClockCircleOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Text } = Typography;

interface RecentReport {
    id: string;
    title: string;
    reportType: string;
    source?: string;
    createdAt: Date | string;
    viewCount: number;
}

interface RecentReportsListProps {
    data: RecentReport[];
    loading?: boolean;
}

export const RecentReportsList: React.FC<RecentReportsListProps> = ({ data, loading }) => {
    const navigate = useNavigate();

    return (
        <Card title="最近更新" bordered={false} loading={loading}>
            <List
                dataSource={data}
                renderItem={(item) => (
                    <List.Item>
                        <List.Item.Meta
                            title={
                                <a onClick={() => navigate(`/intel/research-reports/${item.id}`)}>
                                    {item.title}
                                </a>
                            }
                            description={
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <Tag>{item.reportType}</Tag>
                                    {item.source && <Text type="secondary">{item.source}</Text>}
                                    <Text type="secondary">
                                        <ClockCircleOutlined /> {dayjs(item.createdAt).fromNow()}
                                    </Text>
                                    <Text type="secondary">
                                        <EyeOutlined /> {item.viewCount}
                                    </Text>
                                </div>
                            }
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
};
