import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Progress, Flex, Tag, Typography, Divider, theme } from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ClockCircleOutlined,
    ThunderboltOutlined,
    SafetyOutlined,
    DashboardOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

// ────────────────── Types ──────────────────

interface StatsData {
    totalNodes: number;
    executedNodes: number;
    successNodes: number;
    failedNodes: number;
    skippedNodes: number;
    totalDurationMs: number;
    avgNodeDurationMs: number;
    maxNodeDurationMs: number;
    maxNodeId?: string;
}

interface MetricsDashboardProps {
    stats: StatsData;
    evidenceBundle?: {
        totalItems?: number;
        categories?: Record<string, number>;
    };
    decisionOutput?: {
        action?: string;
        confidence?: number;
        riskLevel?: string;
    } | null;
    isLoading?: boolean;
}

// ────────────────── Helpers ──────────────────

const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}min`;
};

const RISK_COLORS: Record<string, string> = {
    LOW: 'green',
    MEDIUM: 'gold',
    HIGH: 'orange',
    CRITICAL: 'red',
};

// ────────────────── Component ──────────────────

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
    stats,
    evidenceBundle,
    decisionOutput,
    isLoading = false,
}) => {
    const { token } = theme.useToken();

    const successRate = useMemo(
        () => (stats.executedNodes > 0 ? (stats.successNodes / stats.executedNodes) * 100 : 0),
        [stats],
    );

    const failureRate = useMemo(
        () => (stats.executedNodes > 0 ? (stats.failedNodes / stats.executedNodes) * 100 : 0),
        [stats],
    );

    return (
        <Flex vertical gap={16}>
            {/* 核心指标 */}
            <Card
                title={
                    <Flex align="center" gap={8}>
                        <DashboardOutlined />
                        <span>执行指标概览</span>
                    </Flex>
                }
                loading={isLoading}
            >
                <Row gutter={[16, 16]}>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="成功率"
                            value={successRate}
                            precision={1}
                            suffix="%"
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{
                                color: successRate >= 80 ? token.colorSuccess : token.colorWarning,
                            }}
                        />
                        <Progress
                            percent={Math.round(successRate)}
                            showInfo={false}
                            strokeColor={successRate >= 80 ? token.colorSuccess : token.colorWarning}
                            size="small"
                            style={{ marginTop: 8 }}
                        />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="失败率"
                            value={failureRate}
                            precision={1}
                            suffix="%"
                            prefix={<CloseCircleOutlined />}
                            valueStyle={{
                                color: failureRate > 20 ? token.colorError : token.colorTextSecondary,
                            }}
                        />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="总耗时"
                            value={formatDuration(stats.totalDurationMs)}
                            prefix={<ClockCircleOutlined />}
                        />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="平均节点耗时"
                            value={formatDuration(stats.avgNodeDurationMs)}
                            prefix={<ThunderboltOutlined />}
                        />
                    </Col>
                </Row>

                <Divider style={{ margin: '16px 0' }} />

                <Row gutter={[16, 16]}>
                    <Col xs={8} md={4}>
                        <Statistic title="总节点" value={stats.totalNodes} />
                    </Col>
                    <Col xs={8} md={4}>
                        <Statistic
                            title="已执行"
                            value={stats.executedNodes}
                            valueStyle={{ color: token.colorPrimary }}
                        />
                    </Col>
                    <Col xs={8} md={4}>
                        <Statistic
                            title="成功"
                            value={stats.successNodes}
                            valueStyle={{ color: token.colorSuccess }}
                        />
                    </Col>
                    <Col xs={8} md={4}>
                        <Statistic
                            title="失败"
                            value={stats.failedNodes}
                            valueStyle={{ color: stats.failedNodes > 0 ? token.colorError : undefined }}
                        />
                    </Col>
                    <Col xs={8} md={4}>
                        <Statistic title="跳过" value={stats.skippedNodes} />
                    </Col>
                    <Col xs={8} md={4}>
                        <Statistic
                            title="最慢节点"
                            value={formatDuration(stats.maxNodeDurationMs)}
                            valueStyle={{
                                color:
                                    stats.maxNodeDurationMs > 10_000
                                        ? token.colorWarning
                                        : token.colorTextSecondary,
                            }}
                        />
                    </Col>
                </Row>
            </Card>

            {/* 决策输出 */}
            {decisionOutput && (
                <Card
                    title={
                        <Flex align="center" gap={8}>
                            <SafetyOutlined />
                            <span>决策输出</span>
                        </Flex>
                    }
                    loading={isLoading}
                >
                    <Row gutter={[16, 16]}>
                        {decisionOutput.action && (
                            <Col xs={12} md={8}>
                                <Text type="secondary">推荐操作</Text>
                                <br />
                                <Tag
                                    color="blue"
                                    style={{ fontSize: 14, padding: '4px 12px', marginTop: 4 }}
                                >
                                    {decisionOutput.action}
                                </Tag>
                            </Col>
                        )}
                        {decisionOutput.confidence !== undefined && (
                            <Col xs={12} md={8}>
                                <Statistic
                                    title="置信度"
                                    value={decisionOutput.confidence * 100}
                                    precision={1}
                                    suffix="%"
                                    valueStyle={{
                                        color:
                                            decisionOutput.confidence >= 0.7
                                                ? token.colorSuccess
                                                : token.colorWarning,
                                    }}
                                />
                            </Col>
                        )}
                        {decisionOutput.riskLevel && (
                            <Col xs={12} md={8}>
                                <Text type="secondary">风险等级</Text>
                                <br />
                                <Tag
                                    color={RISK_COLORS[decisionOutput.riskLevel] ?? 'default'}
                                    style={{ fontSize: 14, padding: '4px 12px', marginTop: 4 }}
                                >
                                    {decisionOutput.riskLevel}
                                </Tag>
                            </Col>
                        )}
                    </Row>
                </Card>
            )}

            {/* 证据链 */}
            {evidenceBundle && (evidenceBundle.totalItems ?? 0) > 0 && (
                <Card
                    title="证据链摘要"
                    loading={isLoading}
                    size="small"
                >
                    <Row gutter={[8, 8]}>
                        <Col span={8}>
                            <Statistic title="证据总数" value={evidenceBundle.totalItems ?? 0} />
                        </Col>
                        {evidenceBundle.categories &&
                            Object.entries(evidenceBundle.categories).map(([cat, count]) => (
                                <Col span={8} key={cat}>
                                    <Statistic title={cat} value={count} />
                                </Col>
                            ))}
                    </Row>
                </Card>
            )}
        </Flex>
    );
};
