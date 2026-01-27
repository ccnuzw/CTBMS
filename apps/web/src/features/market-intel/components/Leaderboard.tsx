import React, { useState } from 'react';
import {
    Card,
    Table,
    Tag,
    Typography,
    theme,
    Empty,
    Flex,
    Spin,
    Avatar,
    Segmented,
    Statistic,
    Space,
} from 'antd';
import {
    TrophyOutlined,
    CrownOutlined,
    UserOutlined,
    RiseOutlined,
    FireOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLeaderboard } from '../api';
import { LeaderboardEntry } from '@packages/types';

const { Title, Text } = Typography;

export const Leaderboard: React.FC = () => {
    const { token } = theme.useToken();
    const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'year'>('day');
    const { data: leaderboard, isLoading } = useLeaderboard(10, timeframe);

    // 获取前三名
    const topThree = leaderboard?.slice(0, 3) || [];
    const restList = leaderboard?.slice(3) || [];

    // 颜色定义
    const RANK_COLORS = {
        1: { main: '#FFD700', shadow: '#E6C200', bg: 'linear-gradient(180deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0) 100%)' },
        2: { main: '#C0C0C0', shadow: '#A9A9A9', bg: 'linear-gradient(180deg, rgba(192, 192, 192, 0.2) 0%, rgba(192, 192, 192, 0) 100%)' },
        3: { main: '#CD7F32', shadow: '#A0522D', bg: 'linear-gradient(180deg, rgba(205, 127, 50, 0.2) 0%, rgba(205, 127, 50, 0) 100%)' },
    };

    const columns: ColumnsType<LeaderboardEntry> = [
        {
            title: '排名',
            dataIndex: 'rank',
            key: 'rank',
            width: 80,
            align: 'center',
            render: (rank) => (
                <Flex justify="center" align="center" style={{ width: 28, height: 28, background: token.colorFillAlter, borderRadius: '50%', fontWeight: 'bold', color: token.colorTextSecondary }}>
                    {rank}
                </Flex>
            ),
        },
        {
            title: '情报员',
            key: 'user',
            render: (_, record) => (
                <Flex align="center" gap={12}>
                    <Avatar src={record.avatar} icon={<UserOutlined />} style={{ background: token.colorPrimaryBg }}>
                        {record.name?.[0]}
                    </Avatar>
                    <Flex vertical gap={2}>
                        <Text strong>{record.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.organizationName || record.region || '未归属'}
                        </Text>
                    </Flex>
                </Flex>
            ),

        },
        {
            title: '积分',
            dataIndex: 'score',
            key: 'score',
            align: 'center',
            render: (val) => <Text strong style={{ color: token.colorPrimary, fontSize: 16 }}>{val}</Text>,
        },
        {
            title: '提交数',
            dataIndex: 'submissionCount',
            key: 'submissionCount',
            align: 'center',
            render: (val) => <Tag bordered={false}>{val}</Tag>,
        },
        {
            title: '准确率',
            dataIndex: 'accuracyRate',
            key: 'accuracyRate',
            align: 'center',
            render: (rate) => (
                <Text type={rate >= 80 ? 'success' : 'secondary'}>{rate ? `${rate}%` : '-'}</Text>
            ),
        },
    ];

    const PodiumItem = ({ entry, rank, scale = 1 }: { entry?: LeaderboardEntry; rank: number; scale?: number }) => {
        const config = RANK_COLORS[rank as 1 | 2 | 3] || RANK_COLORS[3];

        if (!entry) {
            // Empty slot placeholder
            return (
                <div style={{ width: 140 * scale, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.3 }}>
                    <div style={{ width: 80 * scale, height: 80 * scale, borderRadius: '50%', background: token.colorFillAlter, marginBottom: 16 }} />
                    <div style={{ width: 60, height: 12, background: token.colorFillAlter, borderRadius: 6 }} />
                </div>
            )
        }

        const isChampion = rank === 1;

        return (
            <Flex vertical align="center" style={{
                position: 'relative',
                zIndex: isChampion ? 2 : 1,
                // Make non-champions sit slightly lower
                marginTop: isChampion ? 0 : 40
            }}>
                {/* Visual Glow for Champion */}
                {isChampion && (
                    <div style={{
                        position: 'absolute',
                        top: -40,
                        width: 200,
                        height: 200,
                        background: 'radial-gradient(circle, rgba(255,215,0,0.2) 0%, rgba(255,255,255,0) 70%)',
                        zIndex: -1,
                    }} />
                )}

                {/* Avatar Section */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                    <CrownOutlined style={{
                        fontSize: 32 * scale,
                        color: config.main,
                        position: 'absolute',
                        top: -42 * scale,
                        left: '50%',
                        transform: 'translateX(-50%) rotate(-5deg)',
                        filter: `drop-shadow(0 2px 4px ${config.shadow}80)`,
                        display: isChampion ? 'block' : 'none',
                        zIndex: 2
                    }} />

                    <Avatar
                        size={84 * scale}
                        src={entry.avatar}
                        icon={<UserOutlined />}
                        style={{
                            border: `4px solid ${config.main}`,
                            boxShadow: `0 8px 20px ${config.shadow}40`,
                        }}
                    >
                        {entry.name?.[0]}
                    </Avatar>

                    <div style={{
                        position: 'absolute',
                        bottom: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: `linear-gradient(90deg, ${config.main}, ${config.shadow})`,
                        color: '#FFF',
                        borderRadius: '16px',
                        padding: '2px 12px',
                        fontSize: 12,
                        fontWeight: 'bold',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                        whiteSpace: 'nowrap',
                        zIndex: 3
                    }}>
                        NO.{rank}
                    </div>
                </div>

                {/* Info Section */}
                <Flex vertical align="center" gap={4}>
                    <Text strong style={{ fontSize: 18 * scale, color: token.colorTextHeading }}>
                        {entry.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {entry.organizationName || entry.region}
                    </Text>
                </Flex>

                {/* Score Pedestal Visual */}
                <div style={{
                    marginTop: 12,
                    padding: '8px 24px',
                    background: config.bg,
                    borderRadius: 8,
                    textAlign: 'center',
                    border: `1px solid ${config.main}20`
                }}>
                    <Statistic
                        value={entry.score}
                        valueStyle={{ color: config.main, fontSize: 24 * scale, fontWeight: 800, fontFamily: 'monospace' }}
                        suffix={<span style={{ fontSize: 12, color: token.colorTextSecondary, fontWeight: 'normal' }}>分</span>}
                    />
                </div>
            </Flex>
        );
    };

    return (
        <Flex vertical gap={0} style={{ padding: 0, background: token.colorBgLayout }}>
            {/* Header Area */}
            <Flex justify="space-between" align="center" wrap="wrap" gap={16} style={{ marginBottom: 24 }}>
                <Flex align="center" gap={12}>
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 4px 12px ${token.colorPrimary}40`
                    }}>
                        <TrophyOutlined style={{ fontSize: 20, color: '#fff' }} />
                    </div>
                    <div>
                        <Title level={4} style={{ margin: 0 }}>绩效英雄榜</Title>
                        <Text type="secondary" style={{ fontSize: 12 }}>实时动态更新 · 数据驱动决策</Text>
                    </div>
                </Flex>

                <Segmented
                    value={timeframe}
                    onChange={(val) => setTimeframe(val as any)}
                    options={[
                        { label: '今日', value: 'day' },
                        { label: '本周', value: 'week' },
                        { label: '本月', value: 'month' },
                        { label: '年度', value: 'year' },
                    ]}
                />
            </Flex>

            {isLoading ? (
                <Flex justify="center" align="center" style={{ height: 400 }}>
                    <Spin size="large" tip="计算排名中...">
                        <div style={{ padding: 50 }} />
                    </Spin>
                </Flex>
            ) : (!leaderboard || leaderboard.length === 0) ? (
                <Empty description="当前周期暂无数据，快去提交第一条情报吧！" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <Flex vertical gap={24}>
                    {/* Top Section: Podium Stage */}
                    <Card bordered={false} bodyStyle={{ padding: '32px 24px 48px' }} style={{
                        background: token.colorBgContainer, // Use plain container background for cleanliness, or subtle gradient
                        backgroundImage: `radial-gradient(circle at 50% 10%, ${token.colorPrimary}08 0%, transparent 60%)`, // Subtle glow from top
                        borderRadius: 16
                    }}>
                        <Flex justify="center" align="flex-end" gap={32} wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 10 }}>
                            {/* Order: 2 - 1 - 3 */}
                            <PodiumItem entry={topThree[1]} rank={2} scale={0.9} />
                            <PodiumItem entry={topThree[0]} rank={1} scale={1.1} />
                            <PodiumItem entry={topThree[2]} rank={3} scale={0.9} />
                        </Flex>
                    </Card>

                    {/* Bottom Section: List */}
                    {restList.length > 0 && (
                        <Card
                            title={<Flex gap={8}><FireOutlined style={{ color: token.colorError }} /> 风云榜 (Top 4-10)</Flex>}
                            bordered={false}
                            style={{ borderRadius: 16 }}
                            bodyStyle={{ padding: 0 }}
                        >
                            <Table
                                columns={columns}
                                dataSource={restList}
                                rowKey="userId"
                                pagination={false}
                                size="middle"
                            />
                        </Card>
                    )}
                </Flex>
            )}
        </Flex>
    );
};

export default Leaderboard;
