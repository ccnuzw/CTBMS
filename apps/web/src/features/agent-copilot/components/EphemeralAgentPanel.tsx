/**
 * EphemeralAgentPanel — 临时智能体管理面板
 *
 * 功能：
 *   - 展示会话内临时 Agent 卡片列表
 *   - 创建新 Agent（自然语言输入）
 *   - 晋升 Agent 为持久能力
 *   - 成本统计
 */
import React, { useState } from 'react';
import {
    Badge,
    Button,
    Card,
    Empty,
    Flex,
    Input,
    Modal,
    Progress,
    Space,
    Spin,
    Tag,
    Tooltip,
    Typography,
    theme,
} from 'antd';
import {
    PlusOutlined,
    RobotOutlined,
    ThunderboltOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    UpCircleOutlined,
} from '@ant-design/icons';
import {
    useListEphemeralAgents,
    useGenerateEphemeralAgent,
    usePromoteEphemeralAgent,
    useSessionCostSummary,
} from '../api/orchestration';
import type { EphemeralAgent } from '../api/orchestration';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// ── Status Config ─────────────────────────────────────────────────────────────

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    ACTIVE: { color: 'green', icon: <ThunderboltOutlined />, label: '运行中' },
    EXPIRED: { color: 'default', icon: <ClockCircleOutlined />, label: '已过期' },
    PROMOTED: { color: 'blue', icon: <UpCircleOutlined />, label: '已晋升' },
};

// ── TTL Helpers ───────────────────────────────────────────────────────────────

function getRemainingHours(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.round(diff / (60 * 60 * 1000) * 10) / 10);
}

function getTtlPercent(expiresAt: string, ttlHours: number): number {
    const remaining = getRemainingHours(expiresAt);
    return Math.round((remaining / ttlHours) * 100);
}

// ── Agent Card ────────────────────────────────────────────────────────────────

interface AgentCardProps {
    agent: EphemeralAgent;
    onPromote: (agentId: string) => void;
    isPromoting: boolean;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onPromote, isPromoting }) => {
    const { token } = theme.useToken();
    const config = statusConfig[agent.status] ?? statusConfig.ACTIVE;
    const remaining = getRemainingHours(agent.expiresAt);
    const ttlPct = getTtlPercent(agent.expiresAt, agent.ttlHours);

    return (
        <Card
            size="small"
            style={{
                borderRadius: token.borderRadiusLG,
                borderLeft: `3px solid ${agent.status === 'ACTIVE' ? token.colorSuccess : agent.status === 'PROMOTED' ? token.colorPrimary : token.colorTextQuaternary}`,
            }}
        >
            <Flex justify="space-between" align="start">
                <Flex gap={8} align="center">
                    <RobotOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                    <div>
                        <Text strong>{agent.name}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{agent.agentCode}</Text>
                    </div>
                </Flex>
                <Tag icon={config.icon} color={config.color}>{config.label}</Tag>
            </Flex>

            {agent.status === 'ACTIVE' && (
                <Flex align="center" gap={8} style={{ marginTop: 8 }}>
                    <Tooltip title={`剩余 ${remaining} 小时`}>
                        <Progress
                            percent={ttlPct}
                            size="small"
                            showInfo={false}
                            strokeColor={ttlPct > 30 ? token.colorSuccess : token.colorWarning}
                            style={{ flex: 1 }}
                        />
                    </Tooltip>
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{remaining}h</Text>
                </Flex>
            )}

            <Flex gap={4} wrap="wrap" style={{ marginTop: 8 }}>
                <Tag color="processing">风险: {agent.spec.riskLevel}</Tag>
                {agent.spec.requiredDataSources.slice(0, 2).map((ds) => (
                    <Tag key={ds} style={{ fontSize: 11 }}>{ds}</Tag>
                ))}
            </Flex>

            {agent.status === 'ACTIVE' && (
                <Flex justify="end" style={{ marginTop: 8 }}>
                    <Button
                        type="link"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={isPromoting}
                        onClick={() => onPromote(agent.id)}
                    >
                        晋升为持久能力
                    </Button>
                </Flex>
            )}
        </Card>
    );
};

// ── Main Panel ────────────────────────────────────────────────────────────────

interface EphemeralAgentPanelProps {
    sessionId: string | null;
}

export const EphemeralAgentPanel: React.FC<EphemeralAgentPanelProps> = ({ sessionId }) => {
    const { token } = theme.useToken();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [instruction, setInstruction] = useState('');

    const { data: agents, isLoading } = useListEphemeralAgents(sessionId);
    const { data: costSummary } = useSessionCostSummary(sessionId);
    const generateMutation = useGenerateEphemeralAgent(sessionId);
    const promoteMutation = usePromoteEphemeralAgent(sessionId);

    const handleCreate = async () => {
        if (!instruction.trim()) return;
        await generateMutation.mutateAsync({ userInstruction: instruction.trim() });
        setInstruction('');
        setIsCreateOpen(false);
    };

    const handlePromote = (agentAssetId: string) => {
        promoteMutation.mutate({ agentAssetId });
    };

    if (!sessionId) return null;

    const activeCount = costSummary?.ephemeralAgents.active ?? 0;
    const maxCount = costSummary?.limits.maxAgentsPerSession ?? 5;

    return (
        <div style={{ padding: 12 }}>
            {/* Header */}
            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                <Space>
                    <RobotOutlined style={{ color: token.colorPrimary }} />
                    <Text strong>临时智能体</Text>
                    <Badge count={activeCount} style={{ backgroundColor: token.colorSuccess }} />
                </Space>
                <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={activeCount >= maxCount}
                    onClick={() => setIsCreateOpen(true)}
                >
                    创建
                </Button>
            </Flex>

            {/* 限额进度 */}
            {costSummary && (
                <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>配额</Text>
                    <Progress
                        percent={Math.round((activeCount / maxCount) * 100)}
                        size="small"
                        showInfo={false}
                        style={{ flex: 1 }}
                    />
                    <Text type="secondary" style={{ fontSize: 11 }}>{activeCount}/{maxCount}</Text>
                </Flex>
            )}

            {/* Agent List */}
            {isLoading ? (
                <Flex justify="center" style={{ padding: 24 }}><Spin size="small" /></Flex>
            ) : !agents?.length ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text type="secondary">暂无临时智能体</Text>}
                />
            ) : (
                <Flex vertical gap={8}>
                    {agents.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            onPromote={handlePromote}
                            isPromoting={promoteMutation.isPending}
                        />
                    ))}
                </Flex>
            )}

            {/* Create Modal */}
            <Modal
                title="创建临时智能体"
                open={isCreateOpen}
                onCancel={() => setIsCreateOpen(false)}
                onOk={handleCreate}
                confirmLoading={generateMutation.isPending}
                okText="生成"
                cancelText="取消"
            >
                <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    用自然语言描述你需要的智能体，系统将自动生成其系统提示、输出格式和数据源配置。
                </Paragraph>
                <TextArea
                    rows={4}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="例：创建一个分析供应链风险的智能体，关注东南亚物流和原材料价格波动"
                    maxLength={500}
                    showCount
                />
            </Modal>
        </div>
    );
};
