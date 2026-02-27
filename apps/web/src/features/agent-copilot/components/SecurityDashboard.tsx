/**
 * SecurityDashboard — 安全仪表盘
 *
 * 功能：
 *   - 临时 Agent/Workflow 配额环形图
 *   - 治理事件时间线
 *   - DSL 校验规则概览
 *   - 风险等级分布
 */
import React, { useMemo } from 'react';
import {
    Alert,
    Badge,
    Card,
    Col,
    Descriptions,
    Flex,
    Progress,
    Row,
    Space,
    Statistic,
    Tag,
    Timeline,
    Typography,
    theme,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    RocketOutlined,
    SafetyCertificateOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useSessionCostSummary, useListEphemeralAgents } from '../api/orchestration';
import type { EphemeralAgent, SessionCostSummary } from '../api/orchestration';

const { Text, Title } = Typography;

// ── Sub: Quota Ring ───────────────────────────────────────────────────────────

const QuotaRing: React.FC<{
    label: string;
    used: number;
    limit: number;
    color: string;
}> = ({ label, used, limit, color }) => {
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const status = pct >= 90 ? 'exception' : pct >= 70 ? 'active' : 'normal';
    return (
        <Flex vertical align="center" gap={4}>
            <Progress
                type="circle"
                percent={pct}
                size={72}
                status={status}
                strokeColor={color}
                format={() => `${used}/${limit}`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
        </Flex>
    );
};

// ── Sub: Governance Timeline ──────────────────────────────────────────────────

const GovernanceTimeline: React.FC<{ agents: EphemeralAgent[] }> = ({ agents }) => {
    const { token } = theme.useToken();
    const items = useMemo(() => {
        const sorted = [...agents].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        return sorted.slice(0, 8).map((a) => {
            const colorMap: Record<string, string> = {
                ACTIVE: token.colorSuccess,
                EXPIRED: token.colorTextDisabled,
                PROMOTED: token.colorPrimary,
            };
            const iconMap: Record<string, React.ReactNode> = {
                ACTIVE: <ThunderboltOutlined />,
                EXPIRED: <ClockCircleOutlined />,
                PROMOTED: <RocketOutlined />,
            };
            return {
                color: colorMap[a.status] ?? token.colorTextSecondary,
                dot: iconMap[a.status],
                children: (
                    <Flex vertical gap={2}>
                        <Text strong style={{ fontSize: 13 }}>{a.name}</Text>
                        <Flex gap={4}>
                            <Tag
                                color={a.status === 'ACTIVE' ? 'green' : a.status === 'PROMOTED' ? 'blue' : 'default'}
                                style={{ fontSize: 10 }}
                            >
                                {a.status === 'ACTIVE' ? '活跃' : a.status === 'PROMOTED' ? '已晋升' : '已过期'}
                            </Tag>
                            <Tag color={a.spec.riskLevel === 'MEDIUM' ? 'orange' : 'green'} style={{ fontSize: 10 }}>
                                {a.spec.riskLevel}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(a.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </Flex>
                    </Flex>
                ),
            };
        });
    }, [agents, token]);

    if (!items.length) {
        return <Text type="secondary" style={{ fontSize: 12 }}>暂无治理事件</Text>;
    }
    return <Timeline items={items} />;
};

// ── Sub: Safety Rules ─────────────────────────────────────────────────────────

const SafetyRulesCard: React.FC<{ limits: SessionCostSummary['limits'] }> = ({ limits }) => {
    const { token } = theme.useToken();
    return (
        <Card
            size="small"
            title={
                <Flex align="center" gap={6}>
                    <SafetyCertificateOutlined style={{ color: token.colorSuccess }} />
                    <Text strong style={{ fontSize: 13 }}>DSL 校验规则</Text>
                </Flex>
            }
            style={{ borderRadius: token.borderRadiusLG }}
        >
            <Descriptions column={1} size="small" style={{ fontSize: 12 }}>
                <Descriptions.Item label="最大 Agent 数/会话">
                    <Badge status="processing" text={`${limits.maxAgentsPerSession} 个`} />
                </Descriptions.Item>
                <Descriptions.Item label="最大节点数/工作流">
                    <Badge status="processing" text={`${limits.maxNodesPerWorkflow} 个`} />
                </Descriptions.Item>
                <Descriptions.Item label="默认 TTL">
                    <Badge status="processing" text={`${limits.defaultTtlHours} 小时`} />
                </Descriptions.Item>
                <Descriptions.Item label="环检测">
                    <Badge status="success" text="已启用" />
                </Descriptions.Item>
                <Descriptions.Item label="Agent 调用限制">
                    <Badge status="success" text="已启用" />
                </Descriptions.Item>
                <Descriptions.Item label="禁止数据源">
                    <Tag color="red" style={{ fontSize: 10 }}>EXTERNAL_API</Tag>
                    <Tag color="red" style={{ fontSize: 10 }}>DATABASE_WRITE</Tag>
                    <Tag color="red" style={{ fontSize: 10 }}>WEBHOOK_CALL</Tag>
                </Descriptions.Item>
            </Descriptions>
        </Card>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface SecurityDashboardProps {
    sessionId: string | null;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ sessionId }) => {
    const { token } = theme.useToken();
    const { data: cost, isLoading: isCostLoading } = useSessionCostSummary(sessionId);
    const { data: agents } = useListEphemeralAgents(sessionId);

    if (!sessionId) {
        return (
            <Alert
                type="info"
                message="请先选择或创建一个对话会话以查看安全仪表盘"
                showIcon
                style={{ borderRadius: token.borderRadiusLG }}
            />
        );
    }

    if (isCostLoading || !cost) {
        return (
            <Card loading style={{ borderRadius: token.borderRadiusLG }}>
                <div style={{ height: 200 }} />
            </Card>
        );
    }

    const { ephemeralAgents: agStats, ephemeralWorkflows: wfStats, limits } = cost;

    const riskDistribution = useMemo(() => {
        if (!agents?.length) return { low: 0, medium: 0 };
        const low = agents.filter((a) => a.spec.riskLevel === 'LOW').length;
        return { low, medium: agents.length - low };
    }, [agents]);

    return (
        <Flex vertical gap={16}>
            {/* 顶部警告 */}
            {agStats.total >= limits.maxAgentsPerSession && (
                <Alert
                    type="warning"
                    message="Agent 配额已满"
                    description={`当前会话已创建 ${agStats.total}/${limits.maxAgentsPerSession} 个临时 Agent。请等待过期或手动晋升。`}
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    style={{ borderRadius: token.borderRadiusLG }}
                />
            )}

            {/* 配额指标行 */}
            <Card
                size="small"
                title={
                    <Flex align="center" gap={6}>
                        <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
                        <Text strong>资源配额</Text>
                    </Flex>
                }
                style={{ borderRadius: token.borderRadiusLG }}
            >
                <Row gutter={[16, 16]} justify="space-around">
                    <Col>
                        <QuotaRing label="Agent 配额" used={agStats.total} limit={limits.maxAgentsPerSession} color={token.colorPrimary} />
                    </Col>
                    <Col>
                        <QuotaRing label="节点限制" used={wfStats.total * 3} limit={limits.maxNodesPerWorkflow * 2} color={token.colorWarning} />
                    </Col>
                    <Col>
                        <Flex vertical align="center" gap={8}>
                            <Statistic title="活跃 Agent" value={agStats.active} valueStyle={{ color: token.colorSuccess, fontSize: 24 }} prefix={<CheckCircleOutlined />} />
                            <Statistic title="已晋升" value={agStats.promoted} valueStyle={{ color: token.colorPrimary, fontSize: 24 }} prefix={<RocketOutlined />} />
                        </Flex>
                    </Col>
                </Row>
            </Card>

            {/* 双栏：风险分布 + DSL 规则 */}
            <Row gutter={[12, 12]}>
                <Col xs={24} md={12}>
                    <Card
                        size="small"
                        title={<Text strong style={{ fontSize: 13 }}>风险等级分布</Text>}
                        style={{ borderRadius: token.borderRadiusLG }}
                    >
                        <Flex vertical gap={8}>
                            <Flex justify="space-between" align="center">
                                <Flex align="center" gap={6}>
                                    <Badge color={token.colorSuccess} />
                                    <Text style={{ fontSize: 13 }}>LOW（安全）</Text>
                                </Flex>
                                <Text strong>{riskDistribution.low}</Text>
                            </Flex>
                            <Progress
                                percent={agents?.length ? Math.round((riskDistribution.low / agents.length) * 100) : 0}
                                strokeColor={token.colorSuccess}
                                showInfo={false}
                                size="small"
                            />
                            <Flex justify="space-between" align="center">
                                <Flex align="center" gap={6}>
                                    <Badge color={token.colorWarning} />
                                    <Text style={{ fontSize: 13 }}>MEDIUM（需审查）</Text>
                                </Flex>
                                <Text strong>{riskDistribution.medium}</Text>
                            </Flex>
                            <Progress
                                percent={agents?.length ? Math.round((riskDistribution.medium / agents.length) * 100) : 0}
                                strokeColor={token.colorWarning}
                                showInfo={false}
                                size="small"
                            />
                            <Space style={{ marginTop: 4 }}>
                                <Tag color="volcano" style={{ fontSize: 10 }}>HIGH 已禁止</Tag>
                                <Text type="secondary" style={{ fontSize: 11 }}>临时 Agent 不允许 HIGH 风险</Text>
                            </Space>
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <SafetyRulesCard limits={limits} />
                </Col>
            </Row>

            {/* 治理事件时间线 */}
            <Card
                size="small"
                title={
                    <Flex align="center" gap={6}>
                        <ClockCircleOutlined style={{ color: token.colorTextSecondary }} />
                        <Text strong style={{ fontSize: 13 }}>治理事件</Text>
                    </Flex>
                }
                style={{ borderRadius: token.borderRadiusLG }}
            >
                <GovernanceTimeline agents={agents ?? []} />
            </Card>
        </Flex>
    );
};
