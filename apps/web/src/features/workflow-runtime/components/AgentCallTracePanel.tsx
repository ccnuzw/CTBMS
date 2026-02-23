import React, { useState } from 'react';
import {
    Badge,
    Card,
    Collapse,
    Flex,
    Space,
    Tag,
    Timeline,
    Typography,
    theme,
} from 'antd';
import {
    ApiOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CommentOutlined,
    RobotOutlined,
    ToolOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

// Represents one message turn in the agent conversation history
interface ConversationTurn {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
            name?: string;
            arguments?: string;
        };
    }>;
    tool_call_id?: string;
    name?: string; // for tool results
}

interface AgentCallTracePanelProps {
    /** The outputSnapshot from a NodeExecution of type agent-call */
    outputSnapshot: Record<string, unknown> | null | undefined;
    /** The inputSnapshot from a NodeExecution of type agent-call */
    inputSnapshot?: Record<string, unknown> | null | undefined;
    /** Node status */
    status?: string;
    /** Duration in ms */
    durationMs?: number | null;
}

const roleConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    system: { label: '系统提示', color: 'default', icon: <RobotOutlined /> },
    user: { label: '用户', color: 'blue', icon: <CommentOutlined /> },
    assistant: { label: '大模型', color: 'purple', icon: <RobotOutlined /> },
    tool: { label: '工具结果', color: 'green', icon: <ToolOutlined /> },
};

const MessageBubble: React.FC<{ turn: ConversationTurn; index: number }> = ({ turn, index }) => {
    const { token } = theme.useToken();
    const cfg = roleConfig[turn.role] ?? { label: turn.role, color: 'default', icon: <CommentOutlined /> };
    const hasToolCalls = turn.tool_calls && turn.tool_calls.length > 0;

    // Parse tool call arguments safely
    const parseArgs = (raw?: string): Record<string, unknown> => {
        if (!raw) return {};
        try { return JSON.parse(raw); } catch { return { raw }; }
    };

    return (
        <Timeline.Item
            key={index}
            dot={
                <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: turn.role === 'assistant' ? token.colorPrimaryBg : token.colorFillAlter,
                    border: `1px solid ${turn.role === 'assistant' ? token.colorPrimaryBorder : token.colorBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: turn.role === 'assistant' ? token.colorPrimary : token.colorTextSecondary,
                }}>
                    {cfg.icon}
                </div>
            }
        >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Flex align="center" gap={8}>
                    <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>
                    {turn.name && (
                        <Text code style={{ fontSize: 11 }}>{turn.name}</Text>
                    )}
                    {turn.tool_call_id && (
                        <Text type="secondary" style={{ fontSize: 10 }}>call_id: {turn.tool_call_id.slice(0, 12)}…</Text>
                    )}
                </Flex>

                {/* Text content */}
                {turn.content != null && (
                    <div style={{ background: token.colorFillAlter, borderRadius: token.borderRadiusSM, padding: '8px 12px' }}>
                        <Paragraph style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }} ellipsis={{ rows: 6, expandable: true }}>
                            {String(turn.content)}
                        </Paragraph>
                    </div>
                )}

                {/* Tool calls */}
                {hasToolCalls && (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        {turn.tool_calls!.map((tc, i) => (
                            <Card
                                key={i}
                                size="small"
                                style={{ borderColor: token.colorSuccessBorder, background: token.colorSuccessBg }}
                                title={
                                    <Flex align="center" gap={8}>
                                        <ApiOutlined style={{ color: token.colorSuccess }} />
                                        <Text strong style={{ fontSize: 12 }}>{tc.function?.name ?? '未知工具'}</Text>
                                        {tc.id && <Text type="secondary" style={{ fontSize: 10 }}>id: {tc.id.slice(0, 12)}…</Text>}
                                    </Flex>
                                }
                            >
                                <Collapse
                                    ghost
                                    size="small"
                                    items={[{
                                        key: 'args',
                                        label: <Text type="secondary" style={{ fontSize: 11 }}>调用参数</Text>,
                                        children: (
                                            <pre style={{ fontSize: 11, margin: 0, overflow: 'auto', maxHeight: 200 }}>
                                                {JSON.stringify(parseArgs(tc.function?.arguments), null, 2)}
                                            </pre>
                                        ),
                                    }]}
                                />
                            </Card>
                        ))}
                    </Space>
                )}
            </Space>
        </Timeline.Item>
    );
};

export const AgentCallTracePanel: React.FC<AgentCallTracePanelProps> = ({
    outputSnapshot,
    inputSnapshot,
    status,
    durationMs,
}) => {
    const { token } = theme.useToken();
    const [expanded, setExpanded] = useState(true);

    // Extract conversation history from output or input snapshot
    const executionTrace: ConversationTurn[] =
        (outputSnapshot?.executionTrace as ConversationTurn[]) ||
        (inputSnapshot?.executionTrace as ConversationTurn[]) ||
        (outputSnapshot?.chatHistory as ConversationTurn[]) ||
        [];

    const finalAnswer = outputSnapshot?.content as string | undefined
        || outputSnapshot?.text as string | undefined;

    const toolCallCount = executionTrace.filter(t => t.role === 'assistant' && t.tool_calls?.length).length;

    if (executionTrace.length === 0 && !finalAnswer) {
        return null; // Nothing to show
    }

    return (
        <Card
            size="small"
            style={{ borderColor: token.colorBorder }}
            title={
                <Flex align="center" justify="space-between">
                    <Space size={8}>
                        <RobotOutlined style={{ color: token.colorPrimary }} />
                        <Text strong>Agent 推演追踪</Text>
                        {toolCallCount > 0 && (
                            <Tag color="orange" style={{ margin: 0 }}>{toolCallCount} 次工具调用</Tag>
                        )}
                    </Space>
                    <Space size={8}>
                        {durationMs != null && (
                            <Text type="secondary" style={{ fontSize: 11 }}>{(durationMs / 1000).toFixed(1)}s</Text>
                        )}
                        {status === 'COMPLETED' ? (
                            <Badge status="success" text={<Text type="success" style={{ fontSize: 11 }}>成功</Text>} />
                        ) : status === 'FAILED' ? (
                            <Badge status="error" text={<Text type="danger" style={{ fontSize: 11 }}>失败</Text>} />
                        ) : null}
                    </Space>
                </Flex>
            }
            extra={
                <Text
                    type="secondary"
                    style={{ fontSize: 12, cursor: 'pointer' }}
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? '收起' : '展开'}
                </Text>
            }
        >
            {expanded && (
                <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
                    {executionTrace.length > 0 ? (
                        <Timeline style={{ marginTop: 8 }}>
                            {executionTrace.map((turn, idx) => (
                                <MessageBubble key={idx} turn={turn} index={idx} />
                            ))}
                            {/* Final answer syntheis */}
                            {finalAnswer && (
                                <Timeline.Item
                                    dot={
                                        <div style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: '50%',
                                            background: token.colorSuccessBg,
                                            border: `1px solid ${token.colorSuccessBorder}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                            <CheckCircleOutlined style={{ fontSize: 14, color: token.colorSuccess }} />
                                        </div>
                                    }
                                >
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                        <Tag color="success">最终输出</Tag>
                                        <div style={{ background: token.colorSuccessBg, borderRadius: token.borderRadiusSM, padding: '8px 12px' }}>
                                            <Paragraph style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }} ellipsis={{ rows: 8, expandable: true }}>
                                                {finalAnswer}
                                            </Paragraph>
                                        </div>
                                    </Space>
                                </Timeline.Item>
                            )}
                        </Timeline>
                    ) : finalAnswer ? (
                        <div style={{ background: token.colorSuccessBg, borderRadius: token.borderRadiusSM, padding: '12px 16px' }}>
                            <Paragraph style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }} ellipsis={{ rows: 10, expandable: true }}>
                                {finalAnswer}
                            </Paragraph>
                        </div>
                    ) : null}
                </div>
            )}
        </Card>
    );
};
