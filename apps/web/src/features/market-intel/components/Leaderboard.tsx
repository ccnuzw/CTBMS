import React from 'react';
import { Card, Table, Tag, Space, Typography, theme, Empty, Flex, Spin, Avatar } from 'antd';
import { TrophyOutlined, CrownOutlined, StarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLeaderboard } from '../api';
import { LeaderboardEntry } from '../types';

const { Title, Text } = Typography;

export const Leaderboard: React.FC = () => {
    const { token } = theme.useToken();
    const { data: leaderboard, isLoading } = useLeaderboard(10);

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <CrownOutlined style={{ color: '#FFD700', fontSize: 20 }} />;
        if (rank === 2) return <TrophyOutlined style={{ color: '#C0C0C0', fontSize: 18 }} />;
        if (rank === 3) return <TrophyOutlined style={{ color: '#CD7F32', fontSize: 16 }} />;
        return <Text type="secondary">{rank}</Text>;
    };

    const columns: ColumnsType<LeaderboardEntry> = [
        {
            title: '排名',
            dataIndex: 'rank',
            key: 'rank',
            width: 80,
            align: 'center',
            render: (rank) => getRankIcon(rank),
        },
        {
            title: '情报员',
            key: 'user',
            render: (_, record) => (
                <Flex align="center" gap={12}>
                    <Avatar src={record.avatar} style={{ background: token.colorPrimary }}>
                        {record.name?.[0]}
                    </Avatar>
                    <div>
                        <Text strong>{record.name}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.role} | {record.region}
                        </Text>
                    </div>
                </Flex>
            ),
        },
        {
            title: '月度积分',
            dataIndex: 'monthlyPoints',
            key: 'monthlyPoints',
            align: 'right',
            render: (points) => (
                <Text strong style={{ color: token.colorPrimary, fontSize: 16 }}>
                    {points.toLocaleString()}
                </Text>
            ),
        },
        {
            title: '信用系数',
            dataIndex: 'creditCoefficient',
            key: 'creditCoefficient',
            align: 'center',
            render: (coef) => (
                <Flex align="center" gap={4} justify="center">
                    {Array.from({ length: Math.floor(coef) }).map((_, i) => (
                        <StarOutlined key={i} style={{ color: '#FFD700' }} />
                    ))}
                    <Text>{coef.toFixed(1)}</Text>
                </Flex>
            ),
        },
        {
            title: '提交数',
            dataIndex: 'submissionCount',
            key: 'submissionCount',
            align: 'center',
        },
        {
            title: '准确率',
            dataIndex: 'accuracyRate',
            key: 'accuracyRate',
            align: 'center',
            render: (rate) => (
                <Tag color={rate >= 95 ? 'green' : rate >= 80 ? 'blue' : 'default'}>{rate}%</Tag>
            ),
        },
        {
            title: '高价值引用',
            dataIndex: 'highValueCount',
            key: 'highValueCount',
            align: 'center',
            render: (count) => <Tag color="orange">{count}</Tag>,
        },
    ];

    if (isLoading) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large" />
            </Flex>
        );
    }

    return (
        <div style={{ padding: 24, background: token.colorBgLayout, minHeight: '100%' }}>
            <Title level={3} style={{ marginBottom: 24 }}>
                <TrophyOutlined style={{ color: '#FFD700', marginRight: 8 }} />
                绩效排行榜
            </Title>

            <Card>
                {leaderboard && leaderboard.length > 0 ? (
                    <Table
                        columns={columns}
                        dataSource={leaderboard}
                        rowKey="userId"
                        pagination={false}
                        size="middle"
                    />
                ) : (
                    <Empty description="暂无排行数据" />
                )}
            </Card>
        </div>
    );
};

export default Leaderboard;
