import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Button,
    Card,
    Empty,
    Flex,
    Input,
    Space,
    Spin,
    Tag,
    Typography,
    theme,
    Collapse,
} from 'antd';
import {
    SendOutlined,
    PlusOutlined,
    RobotOutlined,
    UserOutlined,
    ToolOutlined,
    LoadingOutlined,
} from '@ant-design/icons';
import { useCreateChatSession, useSendMessage } from './api';

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    toolsUsed?: Array<{ toolId: string; summary: string }>;
    timestamp: Date;
}

/**
 * 对话助手面板
 *
 * 功能：
 *   - 创建会话 → 多轮对话
 *   - 用户输入自然语言 → LLM Agent 自动调用工具 → 返回中文分析结果
 *   - 显示工具调用摘要（可折叠）
 *   - 支持 Enter 发送，Shift+Enter 换行
 */
export const AgentChatPanel: React.FC = () => {
    const { token } = theme.useToken();

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isSending, setIsSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const createSessionMutation = useCreateChatSession();
    const sendMessageMutation = useSendMessage();

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 创建新会话
    const handleNewSession = useCallback(async () => {
        const result = await createSessionMutation.mutateAsync('current-user');
        setSessionId(result.sessionId);
        setMessages([]);
    }, [createSessionMutation]);

    // 发送消息
    const handleSend = useCallback(async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isSending) return;

        // 如果还没有会话，先创建
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            const result = await createSessionMutation.mutateAsync('current-user');
            currentSessionId = result.sessionId;
            setSessionId(currentSessionId);
        }

        // 添加用户消息
        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: trimmed,
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInputValue('');
        setIsSending(true);

        try {
            const response = await sendMessageMutation.mutateAsync({
                sessionId: currentSessionId,
                message: trimmed,
            });

            const assistantMsg: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: response.reply,
                toolsUsed: response.toolsUsed,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch (error: any) {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: `抱歉，处理您的请求时出现了问题：${error.message || '未知错误'}`,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setIsSending(false);
        }
    }, [inputValue, isSending, sessionId, createSessionMutation, sendMessageMutation]);

    // 快捷键
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // 快捷问题
    const QUICK_QUESTIONS = [
        '帮我查看一下今天的玉米行情',
        '分析一下最近大豆价格走势',
        '生成一份本周玉米市场日报',
        '对比一下华北和东北地区的玉米价格差异',
    ];

    return (
        <Card
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: token.borderRadiusLG,
                overflow: 'hidden',
            }}
            bodyStyle={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden',
            }}
        >
            {/* 头部 */}
            <Flex
                justify="space-between"
                align="center"
                style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgContainer,
                }}
            >
                <Space>
                    <RobotOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                    <Text strong style={{ fontSize: 15 }}>粮贸智能助手</Text>
                    {sessionId && (
                        <Tag color="blue" style={{ fontSize: 11 }}>对话中</Tag>
                    )}
                </Space>
                <Button
                    type="text"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleNewSession}
                >
                    新对话
                </Button>
            </Flex>

            {/* 消息区域 */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 16,
                    background: token.colorFillQuaternary,
                }}
            >
                {messages.length === 0 ? (
                    <Flex vertical align="center" justify="center" style={{ height: '100%' }}>
                        <RobotOutlined style={{ fontSize: 48, color: token.colorTextQuaternary, marginBottom: 16 }} />
                        <Title level={4} style={{ color: token.colorTextSecondary, marginBottom: 8 }}>
                            您好！我是粮贸智能助手
                        </Title>
                        <Paragraph type="secondary" style={{ textAlign: 'center', maxWidth: 400, marginBottom: 24 }}>
                            我可以帮您查询行情、分析数据、生成报告。试试下面的问题，或直接输入您的需求。
                        </Paragraph>
                        <Flex wrap="wrap" gap={8} justify="center" style={{ maxWidth: 500 }}>
                            {QUICK_QUESTIONS.map((q, i) => (
                                <Tag
                                    key={i}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '6px 12px',
                                        fontSize: 13,
                                        borderRadius: token.borderRadiusLG,
                                    }}
                                    onClick={() => {
                                        setInputValue(q);
                                    }}
                                >
                                    {q}
                                </Tag>
                            ))}
                        </Flex>
                    </Flex>
                ) : (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        {messages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} token={token} />
                        ))}
                        {isSending && (
                            <Flex gap={8} align="flex-start">
                                <div
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: `${token.colorPrimary}15`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <RobotOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
                                </div>
                                <div
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: token.borderRadiusLG,
                                        background: token.colorBgContainer,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                    }}
                                >
                                    <Space>
                                        <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} />} />
                                        <Text type="secondary">正在分析中，可能需要调用多个工具...</Text>
                                    </Space>
                                </div>
                            </Flex>
                        )}
                        <div ref={messagesEndRef} />
                    </Space>
                )}
            </div>

            {/* 输入区域 */}
            <div
                style={{
                    padding: '12px 16px',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgContainer,
                }}
            >
                <Flex gap={8}>
                    <TextArea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="输入您的问题，例如：帮我查看今天的玉米行情..."
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        disabled={isSending}
                        style={{ borderRadius: token.borderRadiusLG }}
                    />
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleSend}
                        loading={isSending}
                        disabled={!inputValue.trim()}
                        style={{ borderRadius: token.borderRadiusLG, height: 'auto' }}
                    >
                        发送
                    </Button>
                </Flex>
                <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                    按 Enter 发送 · Shift+Enter 换行 · AI 可能会查询数据和调用分析工具
                </Text>
            </div>
        </Card>
    );
};

// ── 消息气泡子组件 ───────────────────────────────────────

interface MessageBubbleProps {
    message: ChatMessage;
    token: any;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, token }) => {
    const isUser = message.role === 'user';

    return (
        <Flex
            gap={8}
            align="flex-start"
            style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
        >
            {/* 头像 */}
            <div
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: isUser
                        ? `${token.colorPrimary}20`
                        : `${token.colorPrimary}10`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                {isUser ? (
                    <UserOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
                ) : (
                    <RobotOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
                )}
            </div>

            {/* 内容 */}
            <div style={{ maxWidth: '75%' }}>
                <div
                    style={{
                        padding: '10px 14px',
                        borderRadius: token.borderRadiusLG,
                        background: isUser ? token.colorPrimary : token.colorBgContainer,
                        color: isUser ? '#fff' : token.colorText,
                        border: isUser ? 'none' : `1px solid ${token.colorBorderSecondary}`,
                        lineHeight: 1.6,
                        fontSize: 14,
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {message.content}
                </div>

                {/* 工具调用摘要 */}
                {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <Collapse
                        size="small"
                        ghost
                        style={{ marginTop: 4 }}
                        items={[
                            {
                                key: 'tools',
                                label: (
                                    <Space size={4}>
                                        <ToolOutlined style={{ fontSize: 11, color: token.colorTextSecondary }} />
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            调用了 {message.toolsUsed.length} 个工具
                                        </Text>
                                    </Space>
                                ),
                                children: (
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                        {message.toolsUsed.map((tool, i) => (
                                            <Flex key={i} gap={6} align="center">
                                                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                                                    {tool.toolId}
                                                </Tag>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {tool.summary}
                                                </Text>
                                            </Flex>
                                        ))}
                                    </Space>
                                ),
                            },
                        ]}
                    />
                )}

                {/* 时间 */}
                <Text
                    type="secondary"
                    style={{
                        fontSize: 10,
                        marginTop: 4,
                        display: 'block',
                        textAlign: isUser ? 'right' : 'left',
                    }}
                >
                    {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </div>
        </Flex>
    );
};
