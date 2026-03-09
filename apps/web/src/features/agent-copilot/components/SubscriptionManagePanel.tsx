import React from 'react';
import {
    Alert,
    Button,
    Card,
    Empty,
    Flex,
    List,
    Popconfirm,
    Space,
    Spin,
    Tag,
    Typography,
} from 'antd';
import {
    ClockCircleOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    ScheduleOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    useConversationSubscriptions,
    useUpdateConversationSubscription,
    useRunConversationSubscription,
} from '../api/conversations';

const { Text } = Typography;

const statusConfig: Record<string, { text: string; color: string }> = {
    ACTIVE: { text: '运行中', color: 'success' },
    PAUSED: { text: '已暂停', color: 'warning' },
    FAILED: { text: '失败', color: 'error' },
    ARCHIVED: { text: '已归档', color: 'default' },
};

interface SubscriptionManagePanelProps {
    sessionId: string | null;
}

export const SubscriptionManagePanel: React.FC<SubscriptionManagePanelProps> = ({ sessionId }) => {
    const subscriptionsQuery = useConversationSubscriptions(sessionId ?? undefined);
    const updateMutation = useUpdateConversationSubscription();
    const runMutation = useRunConversationSubscription();

    if (!sessionId) {
        return <Alert type="info" showIcon message="请先选择会话后再查看自动更新" />;
    }

    if (subscriptionsQuery.isLoading) {
        return (
            <Flex justify="center" style={{ padding: 24 }}>
                <Spin size="small" />
            </Flex>
        );
    }

    const items = subscriptionsQuery.data ?? [];

    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
                size="small"
                title={
                    <Space size={6}>
                        <ScheduleOutlined />
                        <span>自动更新</span>
                    </Space>
                }
                extra={
                    <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => void subscriptionsQuery.refetch()}
                    >
                        刷新
                    </Button>
                }
            >
                <Text type="secondary">
                    共 {items.length} 个自动更新任务。你也可以直接在结果页点“设为每周更新”。
                </Text>
            </Card>

            {items.length > 0 ? (
                <List
                    itemLayout="vertical"
                    dataSource={items}
                    renderItem={(sub) => {
                        const st = statusConfig[sub.status] ?? statusConfig['ACTIVE'];
                        const latestRun = sub.runs?.[0];

                        return (
                            <Card size="small" style={{ marginBottom: 8 }}>
                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                    <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                                        <Space size={8}>
                                            <Text strong>{sub.name}</Text>
                                            <Tag color={st.color}>{st.text}</Tag>
                                        </Space>
                                        <Space size={4}>
                                            {sub.status === 'ACTIVE' ? (
                                                <Popconfirm
                                                    title="确认暂停这个自动更新？"
                                                    onConfirm={() => {
                                                        updateMutation.mutate(
                                                            { sessionId, subscriptionId: sub.id, status: 'PAUSED' },
                                                            { onSuccess: () => void subscriptionsQuery.refetch() },
                                                        );
                                                    }}
                                                >
                                                    <Button size="small" icon={<PauseCircleOutlined />}>
                                                        暂停
                                                    </Button>
                                                </Popconfirm>
                                            ) : sub.status === 'PAUSED' ? (
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    icon={<PlayCircleOutlined />}
                                                    onClick={() => {
                                                        updateMutation.mutate(
                                                            { sessionId, subscriptionId: sub.id, status: 'ACTIVE' },
                                                            { onSuccess: () => void subscriptionsQuery.refetch() },
                                                        );
                                                    }}
                                                >
                                                    恢复
                                                </Button>
                                            ) : null}
                                            <Button
                                                size="small"
                                                icon={<ThunderboltOutlined />}
                                                loading={runMutation.isPending}
                                                onClick={() => {
                                                    runMutation.mutate(
                                                        { sessionId, subscriptionId: sub.id },
                                                        { onSuccess: () => void subscriptionsQuery.refetch() },
                                                    );
                                                }}
                                            >
                                                立即执行
                                            </Button>
                                        </Space>
                                    </Flex>

                                    <Space size={16} wrap>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                                            规则: {sub.cronExpr}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            时区: {sub.timezone}
                                        </Text>
                                        {sub.nextRunAt ? (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                下次执行: {dayjs(sub.nextRunAt).format('MM-DD HH:mm')}
                                            </Text>
                                        ) : null}
                                        {sub.lastRunAt ? (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                最近执行: {dayjs(sub.lastRunAt).format('MM-DD HH:mm')}
                                            </Text>
                                        ) : null}
                                    </Space>

                                    {latestRun ? (
                                        <Flex align="center" gap={8} wrap="wrap">
                                            <Tag
                                                color={
                                                    latestRun.status === 'COMPLETED'
                                                        ? 'green'
                                                        : latestRun.status === 'FAILED'
                                                            ? 'red'
                                                            : 'processing'
                                                }
                                            >
                                                最近: {latestRun.status}
                                            </Tag>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {dayjs(latestRun.startedAt).format('MM-DD HH:mm:ss')}
                                            </Text>
                                            {latestRun.errorMessage ? (
                                                <Text type="danger" style={{ fontSize: 11 }}>
                                                    {latestRun.errorMessage.slice(0, 60)}
                                                </Text>
                                            ) : null}
                                        </Flex>
                                    ) : null}
                                </Space>
                            </Card>
                        );
                    }}
                />
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有自动更新任务" />
            )}
        </Space>
    );
};
