import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../../api/client';
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Empty,
  Grid,
  Input,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  ApartmentOutlined,
  BarChartOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DiffOutlined,
  ExclamationCircleOutlined,
  ExperimentOutlined,
  MailOutlined,
  MenuOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyOutlined,
  SaveOutlined,
  ScheduleOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  SyncOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiError } from '../../../api/client';
import {
  useConversationSessions,
  useConversationDetail,
  useConversationResult,
  useCreateConversationSession,
  useDeleteConversationSession,
  useSendConversationTurn,
  useConfirmConversationPlan,
  useExportConversationResult,
  useDeliverConversation,
  useResolveScheduleCommand,
} from '../api/conversations';
import type {
  ConversationEvidenceItem,
  ConversationFreshnessStatus,
  ConversationResultConfidenceGate,
  ConversationResultQualityBreakdown,
  ConversationResultTraceability,
} from '../api/conversations';
import { useReportCards } from '../api/orchestration';
import { ReportCardView } from './ReportCardView';
import { EphemeralAgentPanel } from './EphemeralAgentPanel';
import { EphemeralWorkflowPanel } from './EphemeralWorkflowPanel';
import { SecurityDashboard } from './SecurityDashboard';
import { ResultDiffTimelinePanel } from './ResultDiffTimelinePanel';
import { ConversationEvidencePanel } from './ConversationEvidencePanel';
import { StructuredResultView } from './StructuredResultView';
import { DataLineagePanel } from './DataLineagePanel';
import { BacktestResultPanel } from './BacktestResultPanel';
import { SubscriptionManagePanel } from './SubscriptionManagePanel';
import { AuditLogPanel } from './AuditLogPanel';
import {
  type CopilotChatViewProps,
  type LocalConversationTurn,
  scenarioCards,
  userFriendlyStatusText,
  getSmartSuggestions,
  confidenceConfig,
  qualityConfig,
  resultFreshnessLabel,
  resultFreshnessColor,
  evidenceFreshnessLabel,
  evidenceFreshnessColor,
  evidenceQualityLabel,
  evidenceQualityColor,
  getQuickPhrases,
  groupSessionsByDate,
  shouldShowTimeSeparator,
  formatTurnTime,
  animationStyles,
  DEFAULT_VISIBLE_TURN_COUNT,
  LOAD_MORE_TURN_STEP,
  ASSISTANT_COLLAPSE_THRESHOLD,
  toSafeText,
  extractFirstParagraph,
  parseResultData,
} from './copilotChatConstants';
import { useTypingEffect } from './useTypingEffect';

const { Text, Title } = Typography;

// ─── 组件 ─────────────────────────────────────────────────────────────────

export const CopilotChatView: React.FC<CopilotChatViewProps> = ({
  isAdminUser,
  onSwitchToAdmin,
}) => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();

  // ── 状态 ──
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [input, setInput] = useState('');
  const [localTurns, setLocalTurns] = useState<LocalConversationTurn[]>([]);
  const [visibleTurnCount, setVisibleTurnCount] = useState(DEFAULT_VISIBLE_TURN_COUNT);
  const [expandedTurnMap, setExpandedTurnMap] = useState<Record<string, boolean>>({});
  const [sessionSearch, setSessionSearch] = useState('');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [isScheduleQuickOpen, setIsScheduleQuickOpen] = useState(false);
  const [scheduleInstruction, setScheduleInstruction] = useState('每周一早上8点自动执行这个分析');
  const [isToolDrawerOpen, setIsToolDrawerOpen] = useState(false);
  const [toolTabKey, setToolTabKey] = useState('evidence');
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const isMobile = !screens.md;

  // ── Query / Mutation ──
  const sessionsQuery = useConversationSessions({ page: 1, pageSize: 50 });
  const detailQuery = useConversationDetail(activeSessionId);
  const resultQuery = useConversationResult(activeSessionId);
  const createSessionMutation = useCreateConversationSession();
  const deleteSessionMutation = useDeleteConversationSession();
  const sendTurnMutation = useSendConversationTurn();
  const confirmPlanMutation = useConfirmConversationPlan();
  const exportMutation = useExportConversationResult();
  const deliverMutation = useDeliverConversation();
  const resolveScheduleMutation = useResolveScheduleCommand();
  const reportCardsQuery = useReportCards(activeSessionId ?? '');

  // ── 衍生数据 ──
  const sessionList = Array.isArray(sessionsQuery.data?.data) ? sessionsQuery.data.data : [];
  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessionList;
    const keyword = sessionSearch.trim().toLowerCase();
    return sessionList.filter((s) => (s.title || '').toLowerCase().includes(keyword));
  }, [sessionList, sessionSearch]);
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
  const currentStatus = String(
    resultQuery.data?.status ?? detailQuery.data?.state ?? 'INTENT_CAPTURE',
  );
  const statusText = userFriendlyStatusText[currentStatus] || currentStatus;
  const latestPlan = useMemo(() => detailQuery.data?.plans?.[0], [detailQuery.data?.plans]);
  const hasResult = Boolean(resultQuery.data?.result);

  // ── 结果数据提取 ──
  const resultData = useMemo(
    () => parseResultData(resultQuery.data?.result as Record<string, unknown> | null | undefined),
    [resultQuery.data?.result],
  );

  // ── 智能追问 ──
  const smartSuggestions = useMemo(
    () => getSmartSuggestions(currentStatus, hasResult),
    [currentStatus, hasResult],
  );

  // ── 快捷短语 ──
  const quickPhrases = useMemo(
    () => getQuickPhrases(currentStatus, hasResult, !activeSessionId),
    [currentStatus, hasResult, activeSessionId],
  );

  // ── 会话分组 ──
  const sessionGroups = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions]);

  // ── 进度步骤 ──
  const progressStep = useMemo(() => {
    if (['DONE', 'RESULT_DELIVERY'].includes(currentStatus)) return 2;
    if (['EXECUTING', 'PLAN_PREVIEW', 'USER_CONFIRM'].includes(currentStatus)) return 1;
    return 0;
  }, [currentStatus]);

  // ── 打字机效果：最新助手消息 ──
  const latestAssistantTurn = useMemo(() => {
    const turns = [...allTurns].reverse();
    return turns.find((t) => t.role === 'ASSISTANT');
  }, [allTurns]);
  const typingResult = useTypingEffect(
    toSafeText(latestAssistantTurn?.content),
    Boolean(
      latestAssistantTurn &&
      !localTurns.some((lt) => lt.id === latestAssistantTurn.id && lt.pending),
    ),
  );

  // ── 新消息悬浮提示 ──
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const handleTimelineScroll = useCallback(() => {
    const el = timelineRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsUserScrolledUp(!isNearBottom);
    if (isNearBottom) setHasNewMessage(false);
  }, []);

  // ── Effects ──
  useEffect(() => {
    setLocalTurns([]);
    setVisibleTurnCount(DEFAULT_VISIBLE_TURN_COUNT);
    setExpandedTurnMap({});
    setIsUserScrolledUp(false);
    setHasNewMessage(false);
  }, [activeSessionId]);

  useEffect(() => {
    if (!timelineRef.current) return;
    if (isUserScrolledUp) {
      setHasNewMessage(true);
      return;
    }
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [visibleTurns.length, sendTurnMutation.isSuccess, isUserScrolledUp]);

  const scrollToBottom = useCallback(() => {
    if (!timelineRef.current) return;
    timelineRef.current.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' });
    setHasNewMessage(false);
  }, []);

  // ── Handlers ──
  const showError = (error: unknown, fallback: string) => {
    const apiError = getApiError(error);
    message.error(apiError?.message || fallback);
  };

  const handleRetry = async (originalMessage: string) => {
    if (!activeSessionId || !originalMessage) return;
    const pair = createOptimisticTurnPair(originalMessage);
    try {
      await sendTurnMutation.mutateAsync({ sessionId: activeSessionId, message: originalMessage });
      clearOptimisticTurnPair(pair);
    } catch (error) {
      markOptimisticTurnPairFailed(pair, '重试失败');
      showError(error, '重试失败');
    }
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
    // 用户主动发送时强制滚动到底部，确保新消息立即可见
    setIsUserScrolledUp(false);
    setHasNewMessage(false);
    // 使用 double-rAF 确保 React 完成 DOM 更新后再滚动
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (timelineRef.current) {
          timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
        }
      });
    });
    return { userTurnId, assistantTurnId };
  };

  const clearOptimisticTurnPair = (pair: { userTurnId: string; assistantTurnId: string }) => {
    setLocalTurns((prev) =>
      prev.filter((t) => t.id !== pair.userTurnId && t.id !== pair.assistantTurnId),
    );
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
            structuredPayload: {
              retryMessage: prev.find((u) => u.id === pair.userTurnId)?.content,
            },
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
      const sessionId = activeSessionId;
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
        // downloadUrl 是相对后端路径，需加 API base 前缀
        const apiBase = apiClient.defaults.baseURL || '/api';
        window.open(`${apiBase}${exportData.downloadUrl}`, '_blank');
      } else {
        message.info('报告生成中，请稍后在结果区查看');
      }
    } catch (error) {
      showError(error, '导出失败');
    }
  };

  const handleSendEmail = async () => {
    if (!activeSessionId || !emailTo.trim()) return;
    try {
      const exportResult = await exportMutation.mutateAsync({
        sessionId: activeSessionId,
        format: 'PDF',
        sections: ['CONCLUSION', 'EVIDENCE', 'RISK_ASSESSMENT'],
      });
      const exportTaskId =
        (
          exportResult.data as unknown as {
            exportTaskId?: string;
            taskId?: string;
          }
        )?.exportTaskId ??
        (
          exportResult.data as unknown as {
            exportTaskId?: string;
            taskId?: string;
          }
        )?.taskId;
      if (!exportTaskId || typeof exportTaskId !== 'string') {
        message.warning('导出任务创建失败，无法发送邮件');
        return;
      }
      await deliverMutation.mutateAsync({
        sessionId: activeSessionId,
        exportTaskId,
        channel: 'EMAIL',
        to: emailTo
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      message.success('邮件已发送');
      setShowEmailForm(false);
      setEmailTo('');
    } catch (error) {
      showError(error, '发送邮件失败');
    }
  };

  const handleResolveSchedule = async () => {
    if (!activeSessionId || !scheduleInstruction.trim()) return;
    try {
      const result = await resolveScheduleMutation.mutateAsync({
        sessionId: activeSessionId,
        instruction: scheduleInstruction.trim(),
      });
      const resolution = result.data;
      const nextRunText = resolution.nextRunAt
        ? `，下次执行：${new Date(resolution.nextRunAt).toLocaleString('zh-CN')}`
        : '';
      message.success(`已设置自动更新${nextRunText}`);
      setIsScheduleQuickOpen(false);
    } catch (error) {
      showError(error, '设置自动更新失败');
    }
  };

  // ── JSX ──
  const isExecuting = currentStatus === 'EXECUTING';
  const isLoading = ['SLOT_FILLING', 'PLAN_PREVIEW', 'USER_CONFIRM'].includes(currentStatus);
  // 自动执行感知：当最新助手消息标记 autoExecuted=true 时，跳过确认卡片
  const isAutoExecuted = allTurns.some(
    (t) =>
      t.role === 'ASSISTANT' &&
      (t.structuredPayload as Record<string, unknown>)?.autoExecuted === true,
  );
  const showConfirmCard =
    latestPlan && !latestPlan.isConfirmed && currentStatus === 'PLAN_PREVIEW' && !isAutoExecuted;
  const hasNoSession = !activeSessionId;
  // 执行中时输入框提示文字
  const inputPlaceholder = isExecuting
    ? '分析进行中，你也可以继续追问内贸玉米相关问题...'
    : '例如：东北玉米价格怎么走，港口库存有什么变化？';

  // ── 会话列表渲染（桌面端侧栏 / 移动端 Drawer 共享） ──
  const sessionListContent = (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索玉米分析记录"
        allowClear
        size="small"
        value={sessionSearch}
        onChange={(e) => setSessionSearch(e.target.value)}
      />
      {sessionGroups.length > 0 ? (
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {sessionGroups.map((group) => (
            <div key={group.label}>
              <Text type="secondary" style={{ fontSize: 11, padding: '4px 0', display: 'block' }}>
                {group.label}
              </Text>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    padding: '8px 10px',
                    background: item.id === activeSessionId ? '#e6f4ff' : undefined,
                    marginBottom: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 4,
                  }}
                  onClick={() => {
                    setActiveSessionId(item.id);
                    if (isMobile) setIsMobileDrawerOpen(false);
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>
                      {item.title || '未命名分析'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(item.updatedAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </div>
                  <Popconfirm
                    title="确认删除"
                    description="删除后无法恢复，确定要删除这条分析记录吗？"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      deleteSessionMutation.mutate(item.id, {
                        onSuccess: () => {
                          message.success('分析记录已删除');
                          if (activeSessionId === item.id) {
                            setActiveSessionId(undefined);
                          }
                        },
                        onError: (err: unknown) => {
                          const apiErr = getApiError(err);
                          message.error(apiErr?.message || '删除失败');
                        },
                      });
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flexShrink: 0 }}
                    />
                  </Popconfirm>
                </div>
              ))}
            </div>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有玉米分析记录，可以先问我内贸玉米行情"
        />
      )}
    </Space>
  );

  return (
    <>
      {/* ── CSS 动画注入 ── */}
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />

      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {/* ── 头部 ── */}
        <Card>
          <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              {isMobile ? (
                <Button icon={<MenuOutlined />} onClick={() => setIsMobileDrawerOpen(true)} />
              ) : null}
              <BulbOutlined style={{ color: '#1677ff' }} />
              <Title level={4} style={{ margin: 0 }}>
                内贸玉米分析助手
              </Title>
              {!isMobile ? <Text type="secondary">直接问内贸玉米相关问题，我会先给你结论，再补充依据和建议</Text> : null}
            </Space>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSession}>
                {isMobile ? '' : '新建分析'}
              </Button>
              {activeSessionId ? (
                <Button icon={<ToolOutlined />} onClick={() => setIsToolDrawerOpen(true)}>
                  {isMobile ? '' : '查看更多分析'}
                </Button>
              ) : null}
              {isAdminUser && onSwitchToAdmin ? (
                <Button icon={<SettingOutlined />} onClick={onSwitchToAdmin}>
                  {isMobile ? '' : '进入管理台'}
                </Button>
              ) : null}
            </Space>
          </Space>
        </Card>

        {/* ── 移动端 Drawer ── */}
        {isMobile ? (
          <Drawer
            title="最近分析"
            placement="left"
            width={280}
            open={isMobileDrawerOpen}
            onClose={() => setIsMobileDrawerOpen(false)}
          >
            {sessionListContent}
          </Drawer>
        ) : null}

        {/* ── 主体 ── */}
        <Row gutter={16}>
          {/* ── 桌面端会话列表 ── */}
          {!isMobile ? (
            <Col md={6} lg={5}>
              <Card title="最近分析" bodyStyle={{ padding: 8 }}>
                {sessionListContent}
              </Card>
            </Col>
          ) : null}

          {/* ── 对话区 ── */}
          <Col xs={24} md={18} lg={19}>
            <Card
              bodyStyle={{
                height: isMobile ? 'calc(100vh - 180px)' : 700,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* 消息流 */}
              <div
                ref={timelineRef}
                onScroll={handleTimelineScroll}
                style={{ flex: 1, overflow: 'auto', marginBottom: 12, position: 'relative' }}
              >
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
                    {visibleTurns.map((turn, turnIndex) => {
                      const roleText = toSafeText(turn.role || 'UNKNOWN');
                      const contentText = toSafeText(turn.content);
                      const turnPayload = (turn.structuredPayload ?? {}) as Record<string, unknown>;
                      const isPendingTurn = Boolean((turn as LocalConversationTurn).pending);
                      const isFailedTurn = Boolean((turn as LocalConversationTurn).failed);
                      const isExpanded = Boolean(expandedTurnMap[turn.id]);
                      const prevTurnTime =
                        turnIndex > 0 ? visibleTurns[turnIndex - 1].createdAt : undefined;
                      const showTimeSep = shouldShowTimeSeparator(prevTurnTime, turn.createdAt);
                      const retryMsg = isFailedTurn
                        ? (turnPayload.retryMessage as string) || ''
                        : '';

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
                          .filter((item) => item.mode === 'SEND')
                          .map((item) => ({
                            id:
                              typeof item.id === 'string'
                                ? item.id
                                : `r_${Math.random().toString(36).slice(2, 6)}`,
                            label: String(item.label),
                            mode: 'SEND' as const,
                            value: typeof item.value === 'string' ? item.value : undefined,
                          }))
                        : [];

                      // 助手消息：折叠长文本
                      const isAssistant = roleText === 'ASSISTANT';
                      const isLongAssistantReply =
                        isAssistant && contentText.length > ASSISTANT_COLLAPSE_THRESHOLD;
                      const displayContent =
                        isAssistant && isLongAssistantReply && !isExpanded
                          ? extractFirstParagraph(contentText)
                          : contentText;

                      return (
                        <React.Fragment key={turn.id}>
                          {/* 时间分隔线 */}
                          {showTimeSep ? (
                            <div style={{ textAlign: 'center', margin: '4px 0' }}>
                              <Text
                                type="secondary"
                                style={{ fontSize: 11, background: '#fff', padding: '0 8px' }}
                              >
                                {formatTurnTime(turn.createdAt)}
                              </Text>
                            </div>
                          ) : null}
                          <div
                            className={
                              roleText === 'USER' ? 'copilot-msg-right' : 'copilot-msg-left'
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              alignSelf: roleText === 'USER' ? 'flex-end' : 'flex-start',
                              maxWidth: '85%',
                              flexDirection: roleText === 'USER' ? 'row-reverse' : 'row',
                            }}
                          >
                            {/* 头像 */}
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                background:
                                  roleText === 'USER'
                                    ? '#e6f4ff'
                                    : 'linear-gradient(135deg, #667eea, #764ba2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                flexShrink: 0,
                                color: roleText === 'USER' ? '#1677ff' : '#fff',
                              }}
                            >
                              {roleText === 'USER' ? '👤' : '🤖'}
                            </div>
                            <div
                              style={{
                                background: roleText === 'USER' ? '#e6f4ff' : '#fafafa',
                                border: isFailedTurn ? '1px solid #ffccc7' : '1px solid #f0f0f0',
                                borderRadius: 12,
                                padding: '10px 14px',
                                opacity: isPendingTurn ? 0.6 : 1,
                                flex: 1,
                              }}
                            >
                              {/* 消息内容：助手用 Markdown 渲染，用户保持纯文本 */}
                              {isAssistant ? (
                                <>
                                  <div
                                    className={`copilot-markdown${typingResult.isTyping && turn.id === latestAssistantTurn?.id ? ' copilot-typing-cursor' : ''}`}
                                    style={{ lineHeight: 1.7 }}
                                  >
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {displayContent}
                                    </ReactMarkdown>
                                  </div>
                                  {/* ── 嵌入报告卡片（如果有的话） ── */}
                                  {Array.isArray(reportCardsQuery.data) &&
                                    reportCardsQuery.data.length > 0 &&
                                    turn.id === latestAssistantTurn?.id &&
                                    currentStatus === 'DONE' ? (
                                    <div style={{ marginTop: 10 }}>
                                      <ReportCardView cards={reportCardsQuery.data} />
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div
                                  style={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.7,
                                  }}
                                >
                                  {displayContent}
                                </div>
                              )}

                              {/* pending / failed 状态 */}
                              {isPendingTurn ? (
                                <Space style={{ marginTop: 6 }}>
                                  <Spin size="small" />
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    琢磨中...
                                  </Text>
                                </Space>
                              ) : null}
                              {isFailedTurn ? (
                                <Space style={{ marginTop: 6 }}>
                                  <Text type="danger" style={{ fontSize: 12 }}>
                                    发送失败
                                  </Text>
                                  {retryMsg ? (
                                    <Button
                                      size="small"
                                      type="link"
                                      danger
                                      icon={<SyncOutlined />}
                                      onClick={() => void handleRetry(retryMsg)}
                                    >
                                      重试
                                    </Button>
                                  ) : null}
                                </Space>
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
                              {isAssistant && turnReplyOptions.length > 0 && !isPendingTurn ? (
                                <div
                                  style={{
                                    marginTop: 10,
                                    paddingTop: 8,
                                    borderTop: '1px dashed #e8e8e8',
                                  }}
                                >
                                  <Text
                                    type="secondary"
                                    style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                                  >
                                    你也可以继续这样说：
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
                                        &quot;{option.label}&quot;
                                      </Button>
                                    ))}
                                  </Space>
                                </div>
                              ) : null}
                            </div>{' '}
                            {/* 消息气泡内容结束 */}
                          </div>{' '}
                          {/* flex 容器结束 */}
                        </React.Fragment>
                      );
                    })}

                    {/* ── 结果摘要卡片（结论生成后内嵌于消息流末尾） ── */}
                    {resultData && currentStatus === 'DONE' ? (
                      <Card
                        className="copilot-card-in"
                        size="small"
                        style={{
                          background: 'linear-gradient(135deg, #f0f5ff 0%, #e6fffb 100%)',
                          borderColor: '#91caff',
                          borderRadius: 12,
                        }}
                      >
                        <Space direction="vertical" style={{ width: '100%' }} size={8}>
                          <Space align="center">
                            <CheckCircleOutlined style={{ color: '#389e0d', fontSize: 16 }} />
                            <Text strong>结果已经好了</Text>
                          </Space>

                          {/* 四段式结构化结论（PRD §9.2） */}
                          <StructuredResultView
                            resultData={resultData}
                            onOpenEvidencePanel={() => {
                              setToolTabKey('evidence');
                              setIsToolDrawerOpen(true);
                            }}
                          />

                          <Space direction="vertical" style={{ width: '100%' }} size={12}>
                            <Card size="small" style={{ background: '#fff' }}>
                              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Text strong>如果你还想继续，我可以马上帮你做这些</Text>
                                <Space size={8} wrap>
                                  <Button
                                    size="small"
                                    type="primary"
                                    icon={<MailOutlined />}
                                    onClick={() => {
                                      setShowEmailForm((prev) => !prev);
                                      setIsScheduleQuickOpen(false);
                                    }}
                                  >
                                    发给同事
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<ScheduleOutlined />}
                                    onClick={() => {
                                      setIsScheduleQuickOpen((prev) => !prev);
                                      setShowEmailForm(false);
                                    }}
                                  >
                                    设为每周更新
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<BarChartOutlined />}
                                    loading={exportMutation.isPending}
                                    onClick={handleExportPdf}
                                  >
                                    导出这份报告
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<SyncOutlined />}
                                    onClick={() =>
                                      void handleQuickPromptSend('请换一个角度，重新分析内贸玉米采购节奏和库存变化')
                                    }
                                  >
                                    换个角度再看
                                  </Button>
                                </Space>
                                <Space size={8} wrap>
                                  <Button
                                    size="small"
                                    icon={<DiffOutlined />}
                                    onClick={() => {
                                      setToolTabKey('result-diff');
                                      setIsToolDrawerOpen(true);
                                    }}
                                  >
                                    对比前后变化
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<SearchOutlined />}
                                    onClick={() => {
                                      setToolTabKey('evidence');
                                      setIsToolDrawerOpen(true);
                                    }}
                                  >
                                    看看依据
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<SaveOutlined />}
                                    onClick={() =>
                                      void handleQuickPromptSend('请保存这次内贸玉米分析，方便后面继续追问和复盘')
                                    }
                                  >
                                    先留着这次分析
                                  </Button>
                                </Space>
                              </Space>
                            </Card>

                            {showEmailForm ? (
                              <Card size="small" style={{ background: '#fff' }}>
                                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                  <Text strong>把这份结果发给谁？</Text>
                                  <Input
                                    placeholder="收件人邮箱（多个用逗号分隔）"
                                    value={emailTo}
                                    onChange={(e) => setEmailTo(e.target.value)}
                                    prefix={<MailOutlined />}
                                  />
                                  <Space>
                                    <Button
                                      type="primary"
                                      size="small"
                                      loading={deliverMutation.isPending || exportMutation.isPending}
                                      disabled={!emailTo.trim()}
                                      onClick={() => void handleSendEmail()}
                                    >
                                      发出这份分析
                                    </Button>
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        setShowEmailForm(false);
                                        setEmailTo('');
                                      }}
                                    >
                                      先不发了
                                    </Button>
                                  </Space>
                                </Space>
                              </Card>
                            ) : null}

                            {isScheduleQuickOpen ? (
                              <Card size="small" style={{ background: '#fff' }}>
                                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                  <Text strong>想按什么频率自动更新？</Text>
                                  <Select
                                    size="small"
                                    value={scheduleInstruction}
                                    onChange={setScheduleInstruction}
                                    options={[
                                      { label: '每周一早上 8 点推送玉米周报', value: '每周一早上8点自动执行这个分析' },
                                      { label: '每个工作日早上 8 点更新晨报', value: '每个工作日早上8点自动执行这个分析' },
                                      { label: '每天下午 6 点更新收盘复盘', value: '每天下午6点自动执行这个分析' },
                                    ]}
                                  />
                                  <Space>
                                    <Button
                                      type="primary"
                                      size="small"
                                      loading={resolveScheduleMutation.isPending}
                                      onClick={() => void handleResolveSchedule()}
                                    >
                                      就按这个频率
                                    </Button>
                                    <Button size="small" onClick={() => setIsScheduleQuickOpen(false)}>
                                      先不设置
                                    </Button>
                                    <Button
                                      size="small"
                                      type="link"
                                      onClick={() => {
                                        setToolTabKey('subscriptions');
                                        setIsToolDrawerOpen(true);
                                      }}
                                    >
                                      查看全部自动更新
                                    </Button>
                                  </Space>
                                </Space>
                              </Card>
                            ) : null}
                          </Space>
                        </Space>
                      </Card>
                    ) : null}

                    {/* ── 智能追问建议（无后端 replyOptions 时触发） ── */}
                    {smartSuggestions.length > 0 && !isLoading ? (
                      <div style={{ paddingTop: 4 }}>
                        <Text
                          type="secondary"
                          style={{ fontSize: 12, display: 'block', marginBottom: 6 }}
                        >
                          你还可以继续这样问：
                        </Text>
                        <Space size={8} wrap>
                          {smartSuggestions.map((s) => (
                            <Button
                              key={s.id}
                              size="small"
                              style={{ borderRadius: 16 }}
                              onClick={() => void handleQuickPromptSend(s.value)}
                            >
                              {s.label}
                            </Button>
                          ))}
                        </Space>
                      </div>
                    ) : null}
                  </Space>
                ) : hasNoSession ? (
                  // ── 新会话开场：场景卡片 ──
                  <div
                    style={{ padding: isMobile ? '20px 10px' : '40px 20px', textAlign: 'center' }}
                  >
                    <Title level={4} style={{ marginBottom: 12, fontWeight: 400 }}>
                      你好，直接告诉我你想看哪一块内贸玉米市场
                    </Title>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                      我可以帮你看价格、上量、港口库存、成交变化、采购节奏和短期走势。
                    </Text>
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
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先问我一个内贸玉米问题吧" />
                )}
              </div>

              {/* ── 确认卡片（对话式气泡风格） ── */}
              {showConfirmCard ? (
                <div
                  className="copilot-card-in"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    maxWidth: '85%',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                      color: '#fff',
                    }}
                  >
                    🤖
                  </div>
                  <div
                    style={{
                      background: '#fafafa',
                      border: '1px solid #f0f0f0',
                      borderRadius: 12,
                      padding: '10px 14px',
                    }}
                  >
                    <Text style={{ display: 'block', marginBottom: 8 }}>
                      我已经把这次玉米分析整理好了，要我现在直接给你结论吗？
                    </Text>
                    <Space size={8}>
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={confirmPlanMutation.isPending}
                        onClick={handleConfirmPlan}
                      >
                        直接看结论
                      </Button>
                      <Button size="small" onClick={() => setInput('请调整一下，')}>
                        换个分析重点
                      </Button>
                    </Space>
                  </div>
                </div>
              ) : null}

              {/* ── 进度指示器（执行中时显示） ── */}
              {(isLoading || isExecuting) && activeSessionId ? (
                <Steps
                  size="small"
                  current={progressStep}
                  style={{ marginBottom: 8, padding: '0 20px' }}
                  items={[{ title: '整理问题' }, { title: '分析玉米行情' }, { title: '给出结论' }]}
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
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        现在这条分析：
                      </Text>
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
                </div>
              ) : null}

              <Divider style={{ margin: '4px 0' }} />

              {/* ── 新消息悬浮提示 ── */}
              {hasNewMessage && isUserScrolledUp ? (
                <div style={{ textAlign: 'center', marginBottom: 4 }}>
                  <Button
                    size="small"
                    type="primary"
                    style={{ borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                    onClick={scrollToBottom}
                  >
                    ↓ 有新消息
                  </Button>
                </div>
              ) : null}

              {/* ── 快捷短语栏 ── */}
              {quickPhrases.length > 0 ? (
                <div
                  style={{
                    marginBottom: 6,
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    paddingBottom: 2,
                  }}
                >
                  <Space size={6}>
                    {quickPhrases.map((phrase) => (
                      <Tag
                        key={phrase}
                        color="blue"
                        style={{ cursor: 'pointer', borderRadius: 12, fontSize: 12, margin: 0 }}
                        onClick={() => void handleQuickPromptSend(phrase)}
                      >
                        {phrase}
                      </Tag>
                    ))}
                  </Space>
                </div>
              ) : null}

              {/* ── 输入框 ── */}
              <div
                style={
                  isMobile
                    ? {
                      position: 'sticky',
                      bottom: 0,
                      background: '#fff',
                      paddingBottom: 'env(safe-area-inset-bottom)',
                    }
                    : undefined
                }
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input.TextArea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder={inputPlaceholder}
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
                    继续提问
                  </Button>
                </Space.Compact>
              </div>
            </Card>
          </Col>
        </Row>
      </Space>

      {/* ── 玉米分析辅助信息 ── */}
      <Drawer
        title="更多可查看内容"
        placement="right"
        width={isMobile ? '100%' : 480}
        open={isToolDrawerOpen}
        onClose={() => setIsToolDrawerOpen(false)}
        styles={{ body: { padding: '0 16px 16px' } }}
      >
        <Tabs
          activeKey={toolTabKey}
          onChange={setToolTabKey}
          items={[
            {
              key: 'agents',
              label: (
                <span>
                  <RobotOutlined style={{ marginRight: 4 }} />
                  助手分工
                </span>
              ),
              children: <EphemeralAgentPanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'workflows',
              label: (
                <span>
                  <BarChartOutlined style={{ marginRight: 4 }} />
                  分析步骤
                </span>
              ),
              children: <EphemeralWorkflowPanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'security',
              label: (
                <span>
                  <SafetyOutlined style={{ marginRight: 4 }} />
                  风险校验
                </span>
              ),
              children: <SecurityDashboard sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'result-diff',
              label: (
                <span>
                  <DiffOutlined style={{ marginRight: 4 }} />
                  结论对比
                </span>
              ),
              children: <ResultDiffTimelinePanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'evidence',
              label: (
                <span>
                  <SearchOutlined style={{ marginRight: 4 }} />
                  行情依据
                </span>
              ),
              children: <ConversationEvidencePanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'lineage',
              label: (
                <span>
                  <ApartmentOutlined style={{ marginRight: 4 }} />
                  数据来路
                </span>
              ),
              children: <DataLineagePanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'backtest',
              label: (
                <span>
                  <ExperimentOutlined style={{ marginRight: 4 }} />
                  历史验证
                </span>
              ),
              children: <BacktestResultPanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'subscriptions',
              label: (
                <span>
                  <ScheduleOutlined style={{ marginRight: 4 }} />
                  自动盯盘
                </span>
              ),
              children: <SubscriptionManagePanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'audit',
              label: (
                <span>
                  <SafetyOutlined style={{ marginRight: 4 }} />
                  分析留痕
                </span>
              ),
              children: <AuditLogPanel sessionId={activeSessionId ?? null} />,
            },
          ]}
        />
      </Drawer>
    </>
  );
};
