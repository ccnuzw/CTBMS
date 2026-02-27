import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    App,
    Button,
    Card,
    Col,
    Divider,
    Empty,
    Grid,
    Input,
    List,
    Row,
    Space,
    Spin,
    Steps,
    Tag,
    Typography,
} from 'antd';
import {
    BarChartOutlined,
    BulbOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    LineChartOutlined,
    MessageOutlined,
    PlusOutlined,
    SafetyOutlined,
    SendOutlined,
    SettingOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { getApiError } from '../../../api/client';
import {
    useConversationSessions,
    useConversationDetail,
    useConversationResult,
    useCreateConversationSession,
    useSendConversationTurn,
    useConfirmConversationPlan,
    useExportConversationResult,
    useDeliverConversation,
    useResolveScheduleCommand,
} from '../api/conversations';

const { Text, Title } = Typography;

// ─── Types ───────────────────────────────────────────────────────────────────

interface CopilotChatViewProps {
    isAdminUser: boolean;
    onSwitchToAdmin?: () => void;
}

type LocalConversationTurn = {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    structuredPayload?: Record<string, unknown>;
    createdAt: string;
    pending?: boolean;
    failed?: boolean;
};

// ─── 场景卡片 ───────────────────────────────────────────────────────────────

const scenarioCards = [
    {
        key: 'weekly-review',
        icon: <BarChartOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
        title: '周度复盘',
        description: '综合日报、周报与持仓数据，一键生成复盘报告',
        prompt: '请结合日报/周报/研报和期货持仓，做过去一周复盘并给风险提示。',
    },
    {
        key: 'forecast-3m',
        icon: <LineChartOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
        title: '价格预测',
        description: '分析近期走势，预测未来三个月行情',
        prompt: '请分析最近一周东北玉米价格并给出未来三个月建议，输出Markdown+JSON。',
    },
    {
        key: 'risk-scan',
        icon: <SafetyOutlined style={{ fontSize: 28, color: '#fa8c16' }} />,
        title: '风控扫描',
        description: '扫描持仓风险敞口，生成预警与建议',
        prompt: '请扫描当前持仓风险敞口并给出预警与优化建议。',
    },
];

// ─── 术语映射 ─────────────────────────────────────────────────────────────

const userFriendlyStatusText: Record<string, string> = {
    INTENT_CAPTURE: '等待提问',
    SLOT_FILLING: '需要补充一些信息',
    PLAN_PREVIEW: '准备就绪',
    USER_CONFIRM: '准备就绪',
    EXECUTING: '分析中...',
    RESULT_DELIVERY: '整理结论中...',
    DONE: '已完成',
    FAILED: '分析遇到了问题',
};

const slotLabelMap: Record<string, string> = {
    timeRange: '时间段',
    region: '地区',
    outputFormat: '输出格式',
    topic: '关注主题',
};

// ─── 常量 ─────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE_TURN_COUNT = 30;
const LOAD_MORE_TURN_STEP = 20;
const ASSISTANT_COLLAPSE_THRESHOLD = 300;

// ─── 工具函数 ─────────────────────────────────────────────────────────────

const toSafeText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (value === null || value === undefined) return '';
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const extractFirstParagraph = (text: string): string => {
    const cleaned = text.trim();
    const lines = cleaned.split('\n').map((l) => l.trim());
    const firstContentLine = lines.find(
        (l) => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('```'),
    );
    return firstContentLine || lines[0] || '助手已生成回复。';
};

const buildMissingSlotQuestion = (slots: string[]): string => {
    if (slots.length === 0) return '';
    const labels = slots.map((s) => slotLabelMap[s] || s);
    if (labels.length === 1) return `请问你想看哪个${labels[0]}的数据？`;
    return `请补充以下信息：${labels.join('、')}`;
};

// ─── 组件 ─────────────────────────────────────────────────────────────────

export const CopilotChatView: React.FC<CopilotChatViewProps> = ({ isAdminUser, onSwitchToAdmin }) => {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();

    // ── 状态 ──
    const [activeSessionId, setActiveSessionId] = useState<string>();
    const [input, setInput] = useState('');
    const [localTurns, setLocalTurns] = useState<LocalConversationTurn[]>([]);
    const [visibleTurnCount, setVisibleTurnCount] = useState(DEFAULT_VISIBLE_TURN_COUNT);
    const [expandedTurnMap, setExpandedTurnMap] = useState<Record<string, boolean>>({});
    const timelineRef = useRef<HTMLDivElement | null>(null);

    // ── Query / Mutation ──
    const sessionsQuery = useConversationSessions({ page: 1, pageSize: 50 });
    const detailQuery = useConversationDetail(activeSessionId);
    const resultQuery = useConversationResult(activeSessionId);
    const createSessionMutation = useCreateConversationSession();
    const sendTurnMutation = useSendConversationTurn();
    const confirmPlanMutation = useConfirmConversationPlan();
    const exportMutation = useExportConversationResult();
    const deliverMutation = useDeliverConversation();
    const resolveScheduleMutation = useResolveScheduleCommand();

    // ── 衍生数据 ──
    const sessionList = Array.isArray(sessionsQuery.data?.data) ? sessionsQuery.data.data : [];
    const detailTurns = detailQuery.data?.turns ?? [];
    const allTurns = useMemo(() => {
        if (!localTurns.length) return detailTurns;
        return [...detailTurns, ...localTurns].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
    }, [detailTurns, localTurns]);
    const hiddenTurnCount = Math.max(0, allTurns.length - visibleTurnCount);
    const visibleTurns = useMemo(
        () => (hiddenTurnCount > 0 ? allTurns.slice(-visibleTurnCount) : allTurns),
        [allTurns, hiddenTurnCount, visibleTurnCount],
    );
    const currentStatus = String(resultQuery.data?.status ?? detailQuery.data?.state ?? 'INTENT_CAPTURE');
    const statusText = userFriendlyStatusText[currentStatus] || currentStatus;

    const latestPlan = useMemo(() => detailQuery.data?.plans?.[0], [detailQuery.data?.plans]);

    // ── 进度步骤 ──
    const progressStep = useMemo(() => {
        if (['DONE', 'RESULT_DELIVERY'].includes(currentStatus)) return 2;
        if (['EXECUTING', 'PLAN_PREVIEW', 'USER_CONFIRM'].includes(currentStatus)) return 1;
        return 0;
    }, [currentStatus]);

    // ── Effects ──
    useEffect(() => {
        setLocalTurns([]);
        setVisibleTurnCount(DEFAULT_VISIBLE_TURN_COUNT);
        setExpandedTurnMap({});
    }, [activeSessionId]);

    useEffect(() => {
        if (!timelineRef.current) return;
        timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }, [visibleTurns.length, sendTurnMutation.isSuccess]);

    // ── Handlers ──
    const showError = (error: unknown, fallback: string) => {
        const apiError = getApiError(error);
        message.error(apiError?.message || fallback);
    };

    const handleCreateSession = async () => {
        try {
            const session = await createSessionMutation.mutateAsync({});
            setActiveSessionId(session.id);
        } catch (error) {
            showError(error, '创建会话失败');
        }
    };

    const createOptimisticTurnPair = (content: string) => {
        const userTurnId = `local_user_${Date.now()}`;
        const assistantTurnId = `local_assistant_${Date.now()}`;
        setLocalTurns((prev) => [
            ...prev,
            {
                id: userTurnId,
                role: 'USER',
                content,
                createdAt: new Date().toISOString(),
            },
            {
                id: assistantTurnId,
                role: 'ASSISTANT',
                content: '',
                createdAt: new Date().toISOString(),
                pending: true,
            },
        ]);
        return { userTurnId, assistantTurnId };
    };

    const clearOptimisticTurnPair = (pair: { userTurnId: string; assistantTurnId: string }) => {
        setLocalTurns((prev) => prev.filter((t) => t.id !== pair.userTurnId && t.id !== pair.assistantTurnId));
    };

    const markOptimisticTurnPairFailed = (
        pair: { userTurnId: string; assistantTurnId: string },
        fallbackMessage: string,
    ) => {
        setLocalTurns((prev) =>
            prev.map((t) => {
                if (t.id === pair.assistantTurnId) {
                    return {
                        ...t,
                        content: fallbackMessage,
                        pending: false,
                        failed: true,
                        structuredPayload: { retryMessage: prev.find((u) => u.id === pair.userTurnId)?.content },
                    };
                }
                return t;
            }),
        );
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        setInput('');

        let sessionId = activeSessionId;
        if (!sessionId) {
            try {
                const session = await createSessionMutation.mutateAsync({ title: trimmed.slice(0, 40) });
                sessionId = session.id;
                setActiveSessionId(sessionId);
            } catch (error) {
                showError(error, '创建会话失败');
                return;
            }
        }

        const pair = createOptimisticTurnPair(trimmed);
        try {
            await sendTurnMutation.mutateAsync({ sessionId, message: trimmed });
            clearOptimisticTurnPair(pair);
        } catch (error) {
            markOptimisticTurnPairFailed(pair, '发送失败，请重试');
            showError(error, '发送失败');
        }
    };

    const handleQuickPromptSend = async (prompt: string) => {
        let sessionId = activeSessionId;
        if (!sessionId) {
            try {
                const session = await createSessionMutation.mutateAsync({ title: prompt.slice(0, 40) });
                sessionId = session.id;
                setActiveSessionId(sessionId);
            } catch (error) {
                showError(error, '创建会话失败');
                return;
            }
        }

        const pair = createOptimisticTurnPair(prompt);
        try {
            await sendTurnMutation.mutateAsync({ sessionId, message: prompt });
            clearOptimisticTurnPair(pair);
        } catch (error) {
            markOptimisticTurnPairFailed(pair, '发送失败，请重试');
            showError(error, '发送失败');
        }
    };

    const handleReplyOptionSelect = async (option: {
        mode?: string;
        value?: string;
        tab?: string;
    }) => {
        if (option.mode === 'SEND' && option.value) {
            setInput(option.value);
            // 自动发送
            let sessionId = activeSessionId;
            if (!sessionId) return;
            const pair = createOptimisticTurnPair(option.value);
            try {
                await sendTurnMutation.mutateAsync({ sessionId, message: option.value });
                clearOptimisticTurnPair(pair);
            } catch (error) {
                markOptimisticTurnPairFailed(pair, '发送失败，请重试');
                showError(error, '发送失败');
            }
        }
        // 对于 OPEN_TAB 类型在极简视图中不做处理
    };

    const handleConfirmPlan = async () => {
        if (!activeSessionId || !latestPlan) return;
        const planSnapshot = latestPlan.planSnapshot as { planId?: string } | null;
        if (!planSnapshot?.planId) return;
        try {
            await confirmPlanMutation.mutateAsync({
                sessionId: activeSessionId,
                planId: planSnapshot.planId,
                planVersion: latestPlan.version,
            });
            message.success('已开始执行');
        } catch (error) {
            showError(error, '确认执行失败');
        }
    };

    const handleExportPdf = async () => {
        if (!activeSessionId) return;
        try {
            const result = await exportMutation.mutateAsync({
                sessionId: activeSessionId,
                format: 'PDF',
                sections: ['CONCLUSION', 'EVIDENCE', 'RISK_ASSESSMENT'],
            });
            const exportData = result.data;
            if (exportData.downloadUrl) {
                message.success('报告已生成，正在下载...');
                window.open(exportData.downloadUrl, '_blank');
            } else {
                message.info('报告生成中，请稍后在结果区查看');
            }
        } catch (error) {
            showError(error, '导出失败');
        }
    };


    // ── JSX ──
    const isLoading = ['EXECUTING', 'SLOT_FILLING', 'PLAN_PREVIEW', 'USER_CONFIRM'].includes(currentStatus);
    const showConfirmCard = latestPlan && !latestPlan.isConfirmed && currentStatus === 'PLAN_PREVIEW';
    const hasResult = Boolean(resultQuery.data?.result);
    const hasNoSession = !activeSessionId;

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {/* ── 头部 ── */}
            <Card>
                <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                        <BulbOutlined style={{ color: '#1677ff' }} />
                        <Title level={4} style={{ margin: 0 }}>
                            智能助手
                        </Title>
                        <Text type="secondary">有什么想问的，直接说就好</Text>
                    </Space>
                    <Space>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSession}>
                            新对话
                        </Button>
                        {isAdminUser && onSwitchToAdmin ? (
                            <Button icon={<SettingOutlined />} onClick={onSwitchToAdmin}>
                                管理视图
                            </Button>
                        ) : null}
                    </Space>
                </Space>
            </Card>

            {/* ── 主体 ── */}
            <Row gutter={16}>
                {/* ── 会话列表 ── */}
                <Col xs={24} md={6} lg={5}>
                    <Card title="历史对话" bodyStyle={{ padding: 8 }}>
                        {sessionList.length ? (
                            <List
                                size="small"
                                dataSource={sessionList}
                                renderItem={(item) => (
                                    <List.Item
                                        style={{
                                            cursor: 'pointer',
                                            borderRadius: 8,
                                            padding: 10,
                                            background: item.id === activeSessionId ? '#e6f4ff' : undefined,
                                        }}
                                        onClick={() => setActiveSessionId(item.id)}
                                    >
                                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                            <Text strong ellipsis>
                                                {item.title || '新对话'}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {new Date(item.updatedAt).toLocaleString('zh-CN')}
                                            </Text>
                                        </Space>
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对话，开始你的第一次提问吧" />
                        )}
                    </Card>
                </Col>

                {/* ── 对话区 ── */}
                <Col xs={24} md={18} lg={19}>
                    <Card bodyStyle={{ height: 700, display: 'flex', flexDirection: 'column' }}>
                        {/* 消息流 */}
                        <div ref={timelineRef} style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
                            {allTurns.length ? (
                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                    {hiddenTurnCount > 0 ? (
                                        <Button
                                            size="small"
                                            block
                                            onClick={() => setVisibleTurnCount((prev) => prev + LOAD_MORE_TURN_STEP)}
                                        >
                                            加载更早消息（剩余 {hiddenTurnCount} 条）
                                        </Button>
                                    ) : null}
                                    {visibleTurns.map((turn) => {
                                        const roleText = toSafeText(turn.role || 'UNKNOWN');
                                        const contentText = toSafeText(turn.content);
                                        const turnPayload = (turn.structuredPayload ?? {}) as Record<string, unknown>;
                                        const isPendingTurn = Boolean((turn as LocalConversationTurn).pending);
                                        const isFailedTurn = Boolean((turn as LocalConversationTurn).failed);
                                        const isExpanded = Boolean(expandedTurnMap[turn.id]);

                                        // 系统消息渲染为居中小标签
                                        if (roleText === 'SYSTEM') {
                                            return (
                                                <div key={turn.id} style={{ textAlign: 'center' }}>
                                                    <Tag color="default" style={{ fontSize: 11 }}>
                                                        {contentText.slice(0, 60) || '系统消息'}
                                                    </Tag>
                                                </div>
                                            );
                                        }

                                        // 解析回复选项
                                        const turnReplyOptions = Array.isArray(turnPayload.replyOptions)
                                            ? (turnPayload.replyOptions as Array<Record<string, unknown>>)
                                                .filter((item) => typeof item.label === 'string' && item.label)
                                                .filter((item) => item.mode === 'SEND') // 极简视图只保留 SEND 类型
                                                .map((item) => ({
                                                    id: typeof item.id === 'string' ? item.id : `r_${Math.random().toString(36).slice(2, 6)}`,
                                                    label: String(item.label),
                                                    mode: 'SEND' as const,
                                                    value: typeof item.value === 'string' ? item.value : undefined,
                                                }))
                                            : [];

                                        // 助手消息：折叠长文本
                                        const isLongAssistantReply = roleText === 'ASSISTANT' && contentText.length > ASSISTANT_COLLAPSE_THRESHOLD;
                                        const displayContent =
                                            roleText === 'ASSISTANT' && isLongAssistantReply && !isExpanded
                                                ? extractFirstParagraph(contentText)
                                                : contentText;

                                        return (
                                            <div
                                                key={turn.id}
                                                style={{
                                                    alignSelf: roleText === 'USER' ? 'flex-end' : 'flex-start',
                                                    maxWidth: '85%',
                                                    background: roleText === 'USER' ? '#e6f4ff' : '#fafafa',
                                                    border: isFailedTurn ? '1px solid #ffccc7' : '1px solid #f0f0f0',
                                                    borderRadius: 12,
                                                    padding: '10px 14px',
                                                    opacity: isPendingTurn ? 0.6 : 1,
                                                }}
                                            >
                                                {/* 角色标签 */}
                                                <Text type="secondary" style={{ fontSize: 11, marginBottom: 4, display: 'block' }}>
                                                    {roleText === 'USER' ? '我' : '助手'}
                                                </Text>

                                                {/* 消息内容 */}
                                                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7 }}>
                                                    {displayContent}
                                                </div>

                                                {/* pending / failed 状态 */}
                                                {isPendingTurn ? (
                                                    <Space style={{ marginTop: 6 }}>
                                                        <Spin size="small" />
                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                            思考中...
                                                        </Text>
                                                    </Space>
                                                ) : null}
                                                {isFailedTurn ? (
                                                    <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                                                        发送失败，可重试或改写后继续
                                                    </Text>
                                                ) : null}

                                                {/* 长文本折叠 */}
                                                {isLongAssistantReply ? (
                                                    <Button
                                                        size="small"
                                                        type="link"
                                                        style={{ padding: 0, marginTop: 6 }}
                                                        onClick={() =>
                                                            setExpandedTurnMap((prev) => ({
                                                                ...prev,
                                                                [turn.id]: !prev[turn.id],
                                                            }))
                                                        }
                                                    >
                                                        {isExpanded ? '收起' : '📎 查看完整分析 ▸'}
                                                    </Button>
                                                ) : null}

                                                {/* 下一步建议（对话式提示语） */}
                                                {roleText === 'ASSISTANT' && turnReplyOptions.length > 0 && !isPendingTurn ? (
                                                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #e8e8e8' }}>
                                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                                            你可以接着问我：
                                                        </Text>
                                                        <Space direction="vertical" size={4}>
                                                            {turnReplyOptions.slice(0, 3).map((option) => (
                                                                <Button
                                                                    key={option.id}
                                                                    type="text"
                                                                    size="small"
                                                                    style={{
                                                                        textAlign: 'left',
                                                                        color: '#1677ff',
                                                                        padding: '2px 0',
                                                                        height: 'auto',
                                                                    }}
                                                                    onClick={() => void handleReplyOptionSelect(option)}
                                                                >
                                                                    "{option.label}"
                                                                </Button>
                                                            ))}
                                                        </Space>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </Space>
                            ) : hasNoSession ? (
                                // ── 新会话开场：场景卡片 ──
                                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                    <Title level={4} style={{ marginBottom: 24, fontWeight: 400 }}>
                                        👋 你好，有什么我可以帮你的？
                                    </Title>
                                    <Row gutter={[16, 16]} justify="center">
                                        {scenarioCards.map((card) => (
                                            <Col key={card.key} xs={24} sm={8}>
                                                <Card
                                                    hoverable
                                                    bodyStyle={{ textAlign: 'center', padding: 20 }}
                                                    onClick={() => void handleQuickPromptSend(card.prompt)}
                                                >
                                                    {card.icon}
                                                    <Title level={5} style={{ marginTop: 12, marginBottom: 4 }}>
                                                        {card.title}
                                                    </Title>
                                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                                        {card.description}
                                                    </Text>
                                                </Card>
                                            </Col>
                                        ))}
                                    </Row>
                                </div>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="开始你的第一个问题吧" />
                            )}
                        </div>

                        {/* ── 确认卡片（仅在需要确认时显示） ── */}
                        {showConfirmCard ? (
                            <Card
                                size="small"
                                style={{ marginBottom: 8, background: '#fffbe6', borderColor: '#ffe58f' }}
                            >
                                <Space>
                                    <Text>方案已就绪，确认后将开始分析</Text>
                                    <Button
                                        type="primary"
                                        size="small"
                                        loading={confirmPlanMutation.isPending}
                                        onClick={handleConfirmPlan}
                                    >
                                        开始分析
                                    </Button>
                                </Space>
                            </Card>
                        ) : null}

                        {/* ── 进度指示器（执行中时显示） ── */}
                        {isLoading && activeSessionId ? (
                            <Steps
                                size="small"
                                current={progressStep}
                                style={{ marginBottom: 8, padding: '0 20px' }}
                                items={[
                                    { title: '理解需求' },
                                    { title: '分析中' },
                                    { title: '生成结论' },
                                ]}
                            />
                        ) : null}

                        {/* ── 状态栏 ── */}
                        {activeSessionId ? (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '4px 0',
                                    marginBottom: 4,
                                }}
                            >
                                <Space size={8}>
                                    {currentStatus === 'FAILED' ? (
                                        <ExclamationCircleOutlined style={{ color: '#cf1322' }} />
                                    ) : ['DONE', 'RESULT_DELIVERY'].includes(currentStatus) ? (
                                        <CheckCircleOutlined style={{ color: '#389e0d' }} />
                                    ) : isLoading ? (
                                        <SyncOutlined spin style={{ color: '#1677ff' }} />
                                    ) : null}
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        {statusText}
                                    </Text>
                                </Space>
                                {hasResult ? (
                                    <Button
                                        size="small"
                                        icon={<BarChartOutlined />}
                                        loading={exportMutation.isPending}
                                        onClick={handleExportPdf}
                                    >
                                        导出 PDF
                                    </Button>
                                ) : null}
                            </div>
                        ) : null}

                        <Divider style={{ margin: '4px 0' }} />

                        {/* ── 输入框 ── */}
                        <Space.Compact style={{ width: '100%' }}>
                            <Input.TextArea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                autoSize={{ minRows: 2, maxRows: 4 }}
                                placeholder="有什么想问的，直接说就好..."
                                onPressEnter={(e) => {
                                    if (!e.shiftKey) {
                                        e.preventDefault();
                                        void handleSend();
                                    }
                                }}
                            />
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                loading={sendTurnMutation.isPending}
                                onClick={handleSend}
                                style={{ height: 'auto', width: 80 }}
                            >
                                发送
                            </Button>
                        </Space.Compact>
                    </Card>
                </Col>
            </Row>
        </Space>
    );
};
