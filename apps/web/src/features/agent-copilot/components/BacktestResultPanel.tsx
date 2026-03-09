import React, { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Collapse,
    Empty,
    Flex,
    List,
    Progress,
    Select,
    Space,
    Spin,
    Statistic,
    Tag,
    Typography,
} from 'antd';
import {
    DiffOutlined,
    ExperimentOutlined,
    FallOutlined,
    HistoryOutlined,
    ReloadOutlined,
    RiseOutlined,
    TrophyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    useConversationBacktest,
    useConversationBacktestList,
    useConversationBacktestCompare,
} from '../api/conversations';

const { Text } = Typography;

interface BacktestResultPanelProps {
    sessionId: string | null;
    backtestJobId?: string | null;
}

const statusLabel: Record<string, { text: string; color: string }> = {
    QUEUED: { text: '排队中', color: 'default' },
    RUNNING: { text: '运行中', color: 'processing' },
    COMPLETED: { text: '已完成', color: 'success' },
    FAILED: { text: '失败', color: 'error' },
};

const scoreColor = (score: number): string => {
    if (score >= 0.7) return '#52c41a';
    if (score >= 0.4) return '#fa8c16';
    return '#cf1322';
};

const diffColor = (diff: number): string => (diff > 0 ? '#52c41a' : diff < 0 ? '#cf1322' : '#999');

/**
 * 策略回测结果展示面板（PRD FR-WF-005）
 *
 * 展示回测核心指标：收益率、最大回撤、胜率、综合评分
 * 支持历史版本对比
 */
export const BacktestResultPanel: React.FC<BacktestResultPanelProps> = ({
    sessionId,
    backtestJobId,
}) => {
    const [compareJobA, setCompareJobA] = useState<string | undefined>();
    const [compareJobB, setCompareJobB] = useState<string | undefined>();

    const backtestQuery = useConversationBacktest(
        sessionId ?? undefined,
        backtestJobId ?? undefined,
    );
    const historyQuery = useConversationBacktestList(sessionId ?? undefined);
    const compareQuery = useConversationBacktestCompare(
        sessionId ?? undefined,
        compareJobA,
        compareJobB,
    );

    const completedHistory = useMemo(
        () => (historyQuery.data ?? []).filter((item) => item.status === 'COMPLETED'),
        [historyQuery.data],
    );

    if (!sessionId) {
        return <Alert type="info" showIcon message="请先选择会话后再查看回测结果" />;
    }

    if (!backtestJobId) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={'当前会话尚未执行回测。在对话中输入"回测验证"即可启动。'}
            />
        );
    }

    if (backtestQuery.isLoading) {
        return (
            <Flex justify="center" style={{ padding: 24 }}>
                <Spin size="small" tip="加载回测结果..." />
            </Flex>
        );
    }

    const data = backtestQuery.data;
    if (!data) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="回测数据不存在" />;
    }

    const st = statusLabel[data.status] ?? statusLabel['QUEUED'];
    const summary = data.summary as {
        returnPct?: number;
        maxDrawdownPct?: number;
        winRatePct?: number;
        score?: number;
    } | undefined;

    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
                size="small"
                title={
                    <Space size={6}>
                        <ExperimentOutlined />
                        <span>策略回测结果</span>
                    </Space>
                }
                extra={
                    <Space>
                        <Tag color={st.color}>{st.text}</Tag>
                        <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={() => void backtestQuery.refetch()}
                        >
                            刷新
                        </Button>
                    </Space>
                }
            >
                {data.status === 'RUNNING' || data.status === 'QUEUED' ? (
                    <Flex justify="center" align="center" style={{ padding: 24 }}>
                        <Space direction="vertical" align="center" size={12}>
                            <Spin />
                            <Text type="secondary">回测正在运行中，请稍候...</Text>
                        </Space>
                    </Flex>
                ) : data.status === 'FAILED' ? (
                    <Alert
                        type="error"
                        showIcon
                        message="回测失败"
                        description={data.errorMessage ?? '未知错误'}
                    />
                ) : summary ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {/* 核心指标卡片 */}
                        <Flex gap={12} wrap="wrap">
                            <Card size="small" style={{ flex: 1, minWidth: 120 }}>
                                <Statistic
                                    title="收益率"
                                    value={summary.returnPct ?? 0}
                                    precision={2}
                                    suffix="%"
                                    prefix={
                                        (summary.returnPct ?? 0) >= 0 ? (
                                            <RiseOutlined style={{ color: '#52c41a' }} />
                                        ) : (
                                            <FallOutlined style={{ color: '#cf1322' }} />
                                        )
                                    }
                                    valueStyle={{
                                        color: (summary.returnPct ?? 0) >= 0 ? '#52c41a' : '#cf1322',
                                    }}
                                />
                            </Card>
                            <Card size="small" style={{ flex: 1, minWidth: 120 }}>
                                <Statistic
                                    title="最大回撤"
                                    value={summary.maxDrawdownPct ?? 0}
                                    precision={2}
                                    suffix="%"
                                    prefix={<FallOutlined style={{ color: '#cf1322' }} />}
                                    valueStyle={{ color: '#cf1322' }}
                                />
                            </Card>
                            <Card size="small" style={{ flex: 1, minWidth: 120 }}>
                                <Statistic
                                    title="胜率"
                                    value={summary.winRatePct ?? 0}
                                    precision={1}
                                    suffix="%"
                                    prefix={<TrophyOutlined style={{ color: '#fa8c16' }} />}
                                    valueStyle={{
                                        color: (summary.winRatePct ?? 50) >= 50 ? '#52c41a' : '#fa8c16',
                                    }}
                                />
                            </Card>
                        </Flex>

                        {/* 综合评分 */}
                        {summary.score !== undefined ? (
                            <Card size="small" title="综合评分">
                                <Flex align="center" gap={16}>
                                    <Progress
                                        type="dashboard"
                                        size={80}
                                        percent={Math.round(summary.score * 100)}
                                        strokeColor={scoreColor(summary.score)}
                                        format={(pct) => `${pct}`}
                                    />
                                    <Space direction="vertical" size={4}>
                                        <Text strong style={{ fontSize: 16 }}>
                                            {summary.score >= 0.7
                                                ? '策略表现优秀'
                                                : summary.score >= 0.4
                                                    ? '策略表现一般'
                                                    : '策略需要优化'}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            综合收益、风控、胜率等维度评估
                                        </Text>
                                    </Space>
                                </Flex>
                            </Card>
                        ) : null}

                        {/* 回测完成时间 */}
                        {data.completedAt ? (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                回测完成于 {new Date(data.completedAt).toLocaleString('zh-CN')}
                            </Text>
                        ) : null}
                    </Space>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无回测摘要数据" />
                )}
            </Card>

            {/* ── 历史版本对比 ── */}
            {completedHistory.length >= 2 ? (
                <Collapse
                    size="small"
                    items={[
                        {
                            key: 'compare',
                            label: (
                                <Space size={6}>
                                    <DiffOutlined />
                                    <span>回测版本对比</span>
                                    <Tag>{completedHistory.length} 条历史</Tag>
                                </Space>
                            ),
                            children: (
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <Flex gap={8} wrap="wrap" align="center">
                                        <Text type="secondary">基准：</Text>
                                        <Select
                                            size="small"
                                            style={{ minWidth: 200 }}
                                            placeholder="选择基准回测"
                                            value={compareJobA}
                                            onChange={setCompareJobA}
                                            options={completedHistory.map((item) => ({
                                                value: item.backtestJobId,
                                                label: `${item.backtestJobId.slice(0, 8)} (${dayjs(item.createdAt).format('MM-DD HH:mm')})`,
                                            }))}
                                        />
                                        <Text type="secondary">对比：</Text>
                                        <Select
                                            size="small"
                                            style={{ minWidth: 200 }}
                                            placeholder="选择对比回测"
                                            value={compareJobB}
                                            onChange={setCompareJobB}
                                            options={completedHistory
                                                .filter((item) => item.backtestJobId !== compareJobA)
                                                .map((item) => ({
                                                    value: item.backtestJobId,
                                                    label: `${item.backtestJobId.slice(0, 8)} (${dayjs(item.createdAt).format('MM-DD HH:mm')})`,
                                                }))}
                                        />
                                    </Flex>

                                    {compareQuery.isLoading ? (
                                        <Flex justify="center" style={{ padding: 16 }}>
                                            <Spin size="small" />
                                        </Flex>
                                    ) : compareQuery.data ? (
                                        <Flex gap={8} wrap="wrap">
                                            {(
                                                [
                                                    { key: 'returnPct', label: '收益率', suffix: '%' },
                                                    { key: 'maxDrawdownPct', label: '最大回撤', suffix: '%' },
                                                    { key: 'winRatePct', label: '胜率', suffix: '%' },
                                                    { key: 'score', label: '评分', suffix: '' },
                                                ] as const
                                            ).map(({ key, label, suffix }) => {
                                                const item = compareQuery.data!.comparison[key];
                                                return (
                                                    <Card size="small" key={key} style={{ flex: 1, minWidth: 110 }}>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            {label}
                                                        </Text>
                                                        <Flex justify="space-between" align="baseline">
                                                            <Text style={{ fontSize: 13 }}>
                                                                {item.a.toFixed(2)}{suffix} → {item.b.toFixed(2)}{suffix}
                                                            </Text>
                                                            <Text strong style={{ color: diffColor(item.diff), fontSize: 13 }}>
                                                                {item.diff > 0 ? '+' : ''}{item.diff.toFixed(2)}{suffix}
                                                            </Text>
                                                        </Flex>
                                                    </Card>
                                                );
                                            })}
                                        </Flex>
                                    ) : null}
                                </Space>
                            ),
                        },
                    ]}
                />
            ) : null}

            {/* ── 回测历史列表 ── */}
            {(historyQuery.data ?? []).length > 1 ? (
                <Collapse
                    size="small"
                    items={[
                        {
                            key: 'history',
                            label: (
                                <Space size={6}>
                                    <HistoryOutlined />
                                    <span>回测历史 ({(historyQuery.data ?? []).length})</span>
                                </Space>
                            ),
                            children: (
                                <List
                                    size="small"
                                    dataSource={historyQuery.data ?? []}
                                    renderItem={(item) => {
                                        const s = statusLabel[item.status] ?? statusLabel['QUEUED'];
                                        const itemSummary = item.summary as {
                                            returnPct?: number;
                                            winRatePct?: number;
                                            score?: number;
                                        } | undefined;
                                        return (
                                            <List.Item>
                                                <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                                                    <Space size={8}>
                                                        <Text code style={{ fontSize: 11 }}>
                                                            {item.backtestJobId.slice(0, 8)}
                                                        </Text>
                                                        <Tag color={s.color}>{s.text}</Tag>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            {dayjs(item.createdAt).format('MM-DD HH:mm')}
                                                        </Text>
                                                    </Space>
                                                    {itemSummary && item.status === 'COMPLETED' ? (
                                                        <Space size={12}>
                                                            <Text style={{ fontSize: 12 }}>
                                                                收益 {(itemSummary.returnPct ?? 0).toFixed(1)}%
                                                            </Text>
                                                            <Text style={{ fontSize: 12 }}>
                                                                胜率 {(itemSummary.winRatePct ?? 0).toFixed(0)}%
                                                            </Text>
                                                            <Text style={{ fontSize: 12 }}>
                                                                评分 {((itemSummary.score ?? 0) * 100).toFixed(0)}
                                                            </Text>
                                                        </Space>
                                                    ) : null}
                                                </Flex>
                                            </List.Item>
                                        );
                                    }}
                                />
                            ),
                        },
                    ]}
                />
            ) : null}
        </Space>
    );
};
