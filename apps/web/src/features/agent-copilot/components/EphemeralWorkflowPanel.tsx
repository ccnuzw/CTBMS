/**
 * EphemeralWorkflowPanel — 临时工作流可视化面板
 *
 * 功能：
 *   - 从自然语言组装工作流
 *   - 可视化 DSL 节点（Steps）
 *   - 参数覆盖输入
 */
import React, { useState } from 'react';
import {
    Button,
    Card,
    Drawer,
    Empty,
    Flex,
    Input,
    Space,
    Steps,
    Tag,
    Typography,
    theme,
} from 'antd';
import {
    ApartmentOutlined,
    SettingOutlined,
    ThunderboltOutlined,
    DatabaseOutlined,
    CalculatorOutlined,
    MergeCellsOutlined,
} from '@ant-design/icons';
import {
    useAssembleEphemeralWorkflow,
    useApplyEphemeralOverrides,
} from '../api/orchestration';
import type { EphemeralWorkflow, EphemeralWorkflowNode } from '../api/orchestration';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// ── Node Icons ────────────────────────────────────────────────────────────────

const nodeIconMap: Record<string, React.ReactNode> = {
    'agent-call': <ThunderboltOutlined />,
    'data-fetch': <DatabaseOutlined />,
    'formula-calc': <CalculatorOutlined />,
    'join': <MergeCellsOutlined />,
};

const nodeColorMap: Record<string, string> = {
    'agent-call': 'processing',
    'data-fetch': 'cyan',
    'formula-calc': 'orange',
    'join': 'purple',
};

// ── Workflow Visualizer ───────────────────────────────────────────────────────

const WorkflowSteps: React.FC<{ nodes: EphemeralWorkflowNode[] }> = ({ nodes }) => {
    const items = nodes.map((node) => ({
        title: (
            <Space size={4}>
                <Text strong style={{ fontSize: 13 }}>{node.label}</Text>
                <Tag color={nodeColorMap[node.type] ?? 'default'} style={{ fontSize: 11 }}>
                    {node.type}
                </Tag>
            </Space>
        ),
        description: node.config?.agentCode
            ? <Text type="secondary" style={{ fontSize: 11 }}>Agent: {String(node.config.agentCode)}</Text>
            : null,
        icon: nodeIconMap[node.type] ?? <SettingOutlined />,
    }));

    return <Steps direction="vertical" size="small" current={-1} items={items} />;
};

// ── Main Panel ────────────────────────────────────────────────────────────────

interface EphemeralWorkflowPanelProps {
    sessionId: string | null;
}

export const EphemeralWorkflowPanel: React.FC<EphemeralWorkflowPanelProps> = ({ sessionId }) => {
    const { token } = theme.useToken();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isOverrideOpen, setIsOverrideOpen] = useState(false);
    const [instruction, setInstruction] = useState('');
    const [overrideMessage, setOverrideMessage] = useState('');
    const [currentWorkflow, setCurrentWorkflow] = useState<EphemeralWorkflow | null>(null);

    const assembleMutation = useAssembleEphemeralWorkflow(sessionId);
    const overrideMutation = useApplyEphemeralOverrides(sessionId);

    const handleAssemble = async () => {
        if (!instruction.trim()) return;
        const result = await assembleMutation.mutateAsync({ userInstruction: instruction.trim() });
        setCurrentWorkflow(result);
        setInstruction('');
        setIsCreateOpen(false);
    };

    const handleOverride = async () => {
        if (!overrideMessage.trim()) return;
        await overrideMutation.mutateAsync({ userMessage: overrideMessage.trim() });
        setOverrideMessage('');
        setIsOverrideOpen(false);
    };

    if (!sessionId) return null;

    return (
        <div style={{ padding: 12 }}>
            {/* Header */}
            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                <Space>
                    <ApartmentOutlined style={{ color: token.colorPrimary }} />
                    <Text strong>动态工作流</Text>
                </Space>
                <Space>
                    <Button size="small" icon={<SettingOutlined />} onClick={() => setIsOverrideOpen(true)}>
                        参数调整
                    </Button>
                    <Button type="primary" size="small" icon={<ApartmentOutlined />} onClick={() => setIsCreateOpen(true)}>
                        组装
                    </Button>
                </Space>
            </Flex>

            {/* Workflow Display */}
            {currentWorkflow ? (
                <Card
                    size="small"
                    title={
                        <Flex align="center" gap={8}>
                            <Text strong>{currentWorkflow.name}</Text>
                            <Tag color={currentWorkflow.mode === 'DAG' ? 'purple' : 'blue'}>{currentWorkflow.mode}</Tag>
                            <Tag color={currentWorkflow.status === 'ACTIVE' ? 'green' : 'default'}>{currentWorkflow.status}</Tag>
                        </Flex>
                    }
                    style={{ borderRadius: token.borderRadiusLG }}
                >
                    <WorkflowSteps nodes={currentWorkflow.nodes} />
                    <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {currentWorkflow.nodes.length} 节点 · {currentWorkflow.edges.length} 边
                        </Text>
                    </Flex>
                </Card>
            ) : (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text type="secondary">暂无工作流，点击「组装」开始</Text>}
                />
            )}

            {/* Create Drawer */}
            <Drawer
                title="组装临时工作流"
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                width={400}
                extra={
                    <Button type="primary" loading={assembleMutation.isPending} onClick={handleAssemble}>
                        生成
                    </Button>
                }
            >
                <Paragraph type="secondary">
                    用自然语言描述工作流编排逻辑，系统将自动生成 DSL 并校验安全性。
                </Paragraph>
                <TextArea
                    rows={6}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="例：先用供应链分析 Agent 提取风险因子，再用市场情绪 Agent 做交叉验证，最后汇总结论"
                    maxLength={500}
                    showCount
                />
            </Drawer>

            {/* Override Drawer */}
            <Drawer
                title="临时参数调整"
                open={isOverrideOpen}
                onClose={() => setIsOverrideOpen(false)}
                width={360}
                extra={
                    <Button type="primary" loading={overrideMutation.isPending} onClick={handleOverride}>
                        应用
                    </Button>
                }
            >
                <Paragraph type="secondary">
                    用自然语言描述你想修改的参数或规则，系统将自动提取并覆盖当前设置。
                </Paragraph>
                <TextArea
                    rows={4}
                    value={overrideMessage}
                    onChange={(e) => setOverrideMessage(e.target.value)}
                    placeholder="例：把风险阈值调到 EXTREME，忽略物流因素，只看最近 7 天"
                    maxLength={300}
                    showCount
                />
                {overrideMutation.data?.applied && (
                    <Card size="small" style={{ marginTop: 12, background: token.colorSuccessBg }}>
                        <Text type="success">✓ 覆盖已生效</Text>
                        {Object.keys(overrideMutation.data.paramOverrides).length > 0 && (
                            <div style={{ marginTop: 4 }}>
                                {Object.entries(overrideMutation.data.paramOverrides).map(([k, v]) => (
                                    <Tag key={k} style={{ fontSize: 11 }}>{k}: {String(v)}</Tag>
                                ))}
                            </div>
                        )}
                        {overrideMutation.data.nodeSkips.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>跳过节点: </Text>
                                {overrideMutation.data.nodeSkips.map((n) => (
                                    <Tag key={n} color="warning" style={{ fontSize: 11 }}>{n}</Tag>
                                ))}
                            </div>
                        )}
                    </Card>
                )}
            </Drawer>
        </div>
    );
};
