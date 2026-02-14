import React, { useMemo } from 'react';
import { Card, Timeline, Tag, Space, Typography, Statistic, Row, Col, Flex, Tooltip, theme } from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    MinusCircleOutlined,
    ClockCircleOutlined,
    NodeIndexOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

// ────────────────── Types ──────────────────

interface NodeSnapshot {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    startedAt: string;
    completedAt: string;
    durationMs: number;
    attempts: number;
    errorMessage?: string;
    failureCategory?: string;
    skipReason?: string;
}

interface ReplayTimelineProps {
    timeline: NodeSnapshot[];
    totalDurationMs: number;
    isLoading?: boolean;
}

// ────────────────── Helpers ──────────────────

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    SUCCESS: { color: 'success', icon: <CheckCircleOutlined />, label: '成功' },
    FAILED: { color: 'error', icon: <CloseCircleOutlined />, label: '失败' },
    SKIPPED: { color: 'default', icon: <MinusCircleOutlined />, label: '跳过' },
};

const NODE_TYPE_LABELS: Record<string, string> = {
    trigger: '触发器',
    'manual-trigger': '手动触发',
    'cron-trigger': '定时触发',
    'event-trigger': '事件触发',
    'api-trigger': 'API 触发',
    'agent-call': '智能体调用',
    'single-agent': '单智能体',
    'data-fetch': '数据获取',
    'market-data-fetch': '行情获取',
    'rule-eval': '规则评估',
    'rule-pack-eval': '规则包评估',
    'risk-gate': '风控门禁',
    'formula-calc': '公式计算',
    'feature-calc': '特征计算',
    compute: '计算',
    notify: '通知',
    'report-generate': '报告生成',
    'debate-round': '辩论轮次',
    'if-else': '条件分支',
    switch: '分支选择',
    'parallel-split': '并行拆分',
    join: '并行汇聚',
    'decision-merge': '决策合成',
    approval: '人工审批',
};

const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}min`;
};

// ────────────────── Component ──────────────────

export const ReplayTimeline: React.FC<ReplayTimelineProps> = ({
    timeline,
    totalDurationMs,
    isLoading = false,
}) => {
    const { token } = theme.useToken();

    const stats = useMemo(() => {
        const successCount = timeline.filter((n) => n.status === 'SUCCESS').length;
        const failedCount = timeline.filter((n) => n.status === 'FAILED').length;
        const skippedCount = timeline.filter((n) => n.status === 'SKIPPED').length;
        return { successCount, failedCount, skippedCount, total: timeline.length };
    }, [timeline]);

    const timelineItems = useMemo(
        () =>
            timeline.map((node) => {
                const config = STATUS_CONFIG[node.status] ?? STATUS_CONFIG.SKIPPED;
                const typeLabel = NODE_TYPE_LABELS[node.nodeType] ?? node.nodeType;

                return {
                    key: node.nodeId,
                    color: config.color as 'green' | 'red' | 'gray',
                    dot: config.icon,
                    children: (
                        <Card
                            size="small"
                            style={{
                                marginBottom: 8,
                                borderLeft: `3px solid ${node.status === 'SUCCESS'
                                        ? token.colorSuccess
                                        : node.status === 'FAILED'
                                            ? token.colorError
                                            : token.colorTextQuaternary
                                    }`,
                            }}
                        >
                            <Flex justify="space-between" align="center">
                                <Space>
                                    <Text strong>{node.nodeName}</Text>
                                    <Tag>{typeLabel}</Tag>
                                    <Tag color={config.color}>{config.label}</Tag>
                                </Space>
                                <Space>
                                    <Tooltip title="执行耗时">
                                        <Space size={4}>
                                            <ClockCircleOutlined
                                                style={{ color: token.colorTextSecondary }}
                                            />
                                            <Text type="secondary">{formatDuration(node.durationMs)}</Text>
                                        </Space>
                                    </Tooltip>
                                    {node.attempts > 1 && (
                                        <Tooltip title="重试次数">
                                            <Tag color="warning">重试 ×{node.attempts}</Tag>
                                        </Tooltip>
                                    )}
                                </Space>
                            </Flex>
                            {node.errorMessage && (
                                <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                                    {node.failureCategory && (
                                        <Tag color="error" style={{ marginRight: 4 }}>
                                            {node.failureCategory}
                                        </Tag>
                                    )}
                                    {node.errorMessage}
                                </Text>
                            )}
                            {node.skipReason && (
                                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                                    跳过原因: {node.skipReason}
                                </Text>
                            )}
                        </Card>
                    ),
                };
            }),
        [timeline, token],
    );

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <NodeIndexOutlined />
                    <span>执行回放时间线</span>
                </Flex>
            }
            loading={isLoading}
        >
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <Statistic title="总节点" value={stats.total} />
                </Col>
                <Col xs={12} sm={6}>
                    <Statistic
                        title="成功"
                        value={stats.successCount}
                        valueStyle={{ color: token.colorSuccess }}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Statistic
                        title="失败"
                        value={stats.failedCount}
                        valueStyle={{ color: token.colorError }}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Statistic title="总耗时" value={formatDuration(totalDurationMs)} />
                </Col>
            </Row>

            <Timeline items={timelineItems} />
        </Card>
    );
};
