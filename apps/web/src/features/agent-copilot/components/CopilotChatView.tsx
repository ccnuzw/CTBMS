import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  List,
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
  BarChartOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DiffOutlined,
  ExclamationCircleOutlined,
  LineChartOutlined,
  MailOutlined,
  MenuOutlined,
  NodeIndexOutlined,
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
  ConversationResultTraceability,
} from '../api/conversations';
import { useReportCards } from '../api/orchestration';
import { ReportCardView } from './ReportCardView';
import { EphemeralAgentPanel } from './EphemeralAgentPanel';
import { EphemeralWorkflowPanel } from './EphemeralWorkflowPanel';
import { SecurityDashboard } from './SecurityDashboard';
import { ResultDiffTimelinePanel } from './ResultDiffTimelinePanel';

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
  {
    key: 'create-agent',
    icon: <RobotOutlined style={{ fontSize: 28, color: '#722ed1' }} />,
    title: '创建专属智能体',
    description: '用自然语言描述需求，AI 自动生成专属分析智能体',
    prompt: '帮我创建一个专门分析铜价走势的智能体',
  },
  {
    key: 'workflow',
    icon: <NodeIndexOutlined style={{ fontSize: 28, color: '#13c2c2' }} />,
    title: '编排分析流程',
    description: '组合多个智能体形成完整分析流水线',
    prompt: '帮我组装一个工作流，先分析供给再分析需求最后汇总生成报告',
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

// ─── 智能追问建议 ────────────────────────────────────────────────────────

const getSmartSuggestions = (
  status: string,
  hasResult: boolean,
): Array<{ id: string; label: string; value: string }> => {
  if (status === 'DONE' && hasResult) {
    return [
      { id: 'send_email', label: '帮我发到邮箱', value: '请把这份报告发到我的邮箱' },
      { id: 'compare', label: '对比上周数据', value: '请对比上周同期数据，看看有什么变化' },
      { id: 'backtest', label: '回测验证', value: '请用历史数据回测验证这个分析结论' },
      { id: 'save_skill', label: '保存为常用能力', value: '保存这个智能体到系统中' },
      { id: 'schedule', label: '设为定时执行', value: '每周一早上8点自动执行这个分析' },
    ];
  }
  if (status === 'FAILED') {
    return [
      { id: 'retry', label: '重新分析', value: '重新分析一下' },
      { id: 'retry_narrow', label: '缩小范围重新分析', value: '请缩小分析范围重新尝试' },
      { id: 'retry_diff', label: '换个角度试试', value: '请换一个分析角度重新尝试' },
    ];
  }
  return [];
};

// ─── 置信度渲染 ──────────────────────────────────────────────────────────

const confidenceConfig = (pct: number) => {
  if (pct >= 80) return { color: '#52c41a', label: '结论可靠性：高' } as const;
  if (pct >= 50) return { color: '#fa8c16', label: '结论可靠性：中' } as const;
  return { color: '#cf1322', label: '仅供参考' } as const;
};

const evidenceFreshnessLabel: Record<'FRESH' | 'STALE' | 'UNKNOWN', string> = {
  FRESH: '新鲜',
  STALE: '滞后',
  UNKNOWN: '未知',
};

const evidenceFreshnessColor: Record<'FRESH' | 'STALE' | 'UNKNOWN', string> = {
  FRESH: 'green',
  STALE: 'orange',
  UNKNOWN: 'default',
};

const evidenceQualityLabel: Record<'RECONCILED' | 'INTERNAL' | 'EXTERNAL' | 'UNVERIFIED', string> =
  {
    RECONCILED: '已对账',
    INTERNAL: '内部',
    EXTERNAL: '外部',
    UNVERIFIED: '待核验',
  };

const evidenceQualityColor: Record<'RECONCILED' | 'INTERNAL' | 'EXTERNAL' | 'UNVERIFIED', string> =
  {
    RECONCILED: 'blue',
    INTERNAL: 'geekblue',
    EXTERNAL: 'purple',
    UNVERIFIED: 'default',
  };

// ─── 快捷短语（根据对话状态动态推荐） ─────────────────────────────────────

const getQuickPhrases = (status: string, hasResult: boolean, hasNoSession: boolean): string[] => {
  if (hasNoSession || status === 'INTENT_CAPTURE') {
    return ['玉米价格走势', '持仓风险扫描', '创建专属智能体', '编排分析流程'];
  }
  if (status === 'DONE' && hasResult) {
    return ['导出报告', '发到邮箱', '回测验证', '保存为常用能力', '设为定时执行'];
  }
  if (status === 'FAILED') {
    return ['重新分析', '换个角度试试', '缩小分析范围'];
  }
  if (status === 'SLOT_FILLING') {
    return ['最近一周', '东北地区', '全部品种'];
  }
  return [];
};

// ─── 会话分组 ────────────────────────────────────────────────────────────────

const groupSessionsByDate = <T extends { updatedAt: string }>(
  sessions: T[],
): Array<{ label: string; items: T[] }> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekStart = today - now.getDay() * 86400000;

  const groups: Record<string, T[]> = { 今天: [], 昨天: [], 本周: [], 更早: [] };
  for (const s of sessions) {
    const t = new Date(s.updatedAt).getTime();
    if (t >= today) groups['今天'].push(s);
    else if (t >= yesterday) groups['昨天'].push(s);
    else if (t >= weekStart) groups['本周'].push(s);
    else groups['更早'].push(s);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
};

// ─── 时间分隔判断 ────────────────────────────────────────────────────────────

const shouldShowTimeSeparator = (prev: string | undefined, curr: string): boolean => {
  if (!prev) return true;
  return new Date(curr).getTime() - new Date(prev).getTime() > 5 * 60 * 1000; // 5分钟间隔
};

const formatTurnTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ─── CSS 动画 ─────────────────────────────────────────────────────────────────

const animationStyles = `
@keyframes copilot-slide-in-left {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes copilot-slide-in-right {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes copilot-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes copilot-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.copilot-msg-left  { animation: copilot-slide-in-left 0.2s ease-out; }
.copilot-msg-right { animation: copilot-slide-in-right 0.2s ease-out; }
.copilot-card-in   { animation: copilot-scale-in 0.25s ease-out; }
.copilot-typing-cursor::after {
  content: '▍';
  animation: copilot-cursor-blink 0.8s steps(2) infinite;
  color: #1677ff;
}
.copilot-markdown p { margin: 0 0 0.4em; }
.copilot-markdown table { font-size: 13px; border-collapse: collapse; }
.copilot-markdown th, .copilot-markdown td { border: 1px solid #e8e8e8; padding: 4px 8px; }
.copilot-markdown pre { background: #f6f8fa; padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.copilot-markdown code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.copilot-markdown pre code { background: none; padding: 0; }
`;

// ─── 常量 ─────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE_TURN_COUNT = 30;
const LOAD_MORE_TURN_STEP = 20;
const ASSISTANT_COLLAPSE_THRESHOLD = 500;

// ─── 工具函数 ─────────────────────────────────────────────────────────────

const toSafeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
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

// ─── 打字机 Hook ─────────────────────────────────────────────────────────────

const useTypingEffect = (
  text: string,
  isActive: boolean,
  speed = 25,
): { displayText: string; isTyping: boolean } => {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const prevTextRef = useRef('');

  useEffect(() => {
    if (!isActive || !text) {
      setDisplayText(text);
      setIsTyping(false);
      return;
    }
    // 只对新内容启动打字机（避免切换会话时重复播放）
    if (text === prevTextRef.current) {
      setDisplayText(text);
      return;
    }
    prevTextRef.current = text;
    setIsTyping(true);
    setDisplayText('');
    let idx = 0;
    const timer = setInterval(() => {
      idx += 1;
      if (idx >= text.length) {
        setDisplayText(text);
        setIsTyping(false);
        clearInterval(timer);
      } else {
        setDisplayText(text.slice(0, idx));
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, isActive, speed]);

  return { displayText, isTyping };
};

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
  const [isToolDrawerOpen, setIsToolDrawerOpen] = useState(false);
  const [toolTabKey, setToolTabKey] = useState('agents');
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
  const resultData = useMemo(() => {
    const raw = resultQuery.data?.result as Record<string, unknown> | null | undefined;
    if (!raw) return null;

    const confidenceRaw = typeof raw.confidence === 'number' ? raw.confidence : null;
    const confidence = confidenceRaw !== null ? Math.round(confidenceRaw * 100) : null;

    const conclusion =
      typeof raw.conclusion === 'string'
        ? raw.conclusion
        : typeof raw.analysis === 'string'
          ? raw.analysis
          : null;

    const actionTexts: string[] = [];
    if (Array.isArray(raw.actions)) {
      for (const action of raw.actions as Array<Record<string, unknown>>) {
        if (typeof action === 'string') {
          actionTexts.push(action);
          continue;
        }
        if (typeof action?.text === 'string') {
          actionTexts.push(action.text);
          continue;
        }
        if (typeof action?.label === 'string') {
          actionTexts.push(action.label);
          continue;
        }
        actionTexts.push(toSafeText(action));
      }
    } else if (raw.actions && typeof raw.actions === 'object') {
      const actionRecord = raw.actions as Record<string, unknown>;
      const preferredAction =
        typeof actionRecord.recommendedAction === 'string' ? actionRecord.recommendedAction : null;
      if (preferredAction) {
        actionTexts.push(`建议动作：${preferredAction}`);
      }

      for (const [key, value] of Object.entries(actionRecord)) {
        if (key === 'riskDisclosure' || key === 'recommendedAction') {
          continue;
        }
        if (typeof value === 'string' && value.trim()) {
          actionTexts.push(`${key}: ${value}`);
          continue;
        }
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (typeof entry === 'string' && entry.trim()) {
              actionTexts.push(entry);
            }
          }
        }
      }
    }

    const traceabilityRaw =
      raw.traceability && typeof raw.traceability === 'object' && !Array.isArray(raw.traceability)
        ? (raw.traceability as Record<string, unknown>)
        : null;

    const traceability: ConversationResultTraceability | null = traceabilityRaw
      ? {
          executionId: toSafeText(traceabilityRaw.executionId),
          replayPath: toSafeText(traceabilityRaw.replayPath),
          executionPath: toSafeText(traceabilityRaw.executionPath),
          evidenceCount: Number(traceabilityRaw.evidenceCount ?? 0) || 0,
          strongEvidenceCount: Number(traceabilityRaw.strongEvidenceCount ?? 0) || 0,
          externalEvidenceCount: Number(traceabilityRaw.externalEvidenceCount ?? 0) || 0,
          generatedAt: toSafeText(traceabilityRaw.generatedAt),
        }
      : null;

    const evidenceItemsRaw = Array.isArray(raw.evidenceItems)
      ? raw.evidenceItems
      : ([] as Array<Record<string, unknown>>);

    const evidenceItems = evidenceItemsRaw.reduce<ConversationEvidenceItem[]>(
      (acc, item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return acc;
        }
        const row = item as Record<string, unknown>;
        const freshnessCandidate = toSafeText(row.freshness).toUpperCase();
        const freshness: ConversationEvidenceItem['freshness'] =
          freshnessCandidate === 'FRESH' || freshnessCandidate === 'STALE'
            ? (freshnessCandidate as 'FRESH' | 'STALE')
            : 'UNKNOWN';
        const qualityCandidate = toSafeText(row.quality).toUpperCase();
        const quality: ConversationEvidenceItem['quality'] =
          qualityCandidate === 'RECONCILED' ||
          qualityCandidate === 'INTERNAL' ||
          qualityCandidate === 'EXTERNAL'
            ? (qualityCandidate as 'RECONCILED' | 'INTERNAL' | 'EXTERNAL')
            : 'UNVERIFIED';
        acc.push({
          id: typeof row.id === 'string' && row.id ? row.id : `evidence_${index}`,
          title: toSafeText(row.title) || `证据 ${index + 1}`,
          summary: toSafeText(row.summary) || '无摘要',
          source: toSafeText(row.source) || 'unknown',
          sourceNodeId: typeof row.sourceNodeId === 'string' ? row.sourceNodeId : null,
          sourceNodeType: typeof row.sourceNodeType === 'string' ? row.sourceNodeType : null,
          sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : null,
          tracePath: typeof row.tracePath === 'string' ? row.tracePath : null,
          collectedAt:
            typeof row.collectedAt === 'string' && row.collectedAt
              ? row.collectedAt
              : new Date().toISOString(),
          timestamp: typeof row.timestamp === 'string' && row.timestamp ? row.timestamp : null,
          freshness,
          quality,
        });
        return acc;
      },
      [],
    );

    const dedupedActions = [...new Set(actionTexts.filter((item) => item.trim()))];

    return {
      confidence,
      conclusion,
      actions: dedupedActions.slice(0, 6),
      evidenceItems,
      traceability,
    };
  }, [resultQuery.data?.result]);

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
        window.open(exportData.downloadUrl, '_blank');
      } else {
        message.info('报告生成中，请稍后在结果区查看');
      }
    } catch (error) {
      showError(error, '导出失败');
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
    ? '分析进行中，你可以继续提其他问题...'
    : '有什么想问的，直接说就好...';

  // ── 会话列表渲染（桌面端侧栏 / 移动端 Drawer 共享） ──
  const sessionListContent = (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索历史对话"
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
                      {item.title || '新对话'}
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
                    description="删除后无法恢复，确定要删除这个会话吗？"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      deleteSessionMutation.mutate(item.id, {
                        onSuccess: () => {
                          message.success('会话已删除');
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
          description="还没有对话，开始你的第一次提问吧"
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
                智能助手
              </Title>
              {!isMobile ? <Text type="secondary">有什么想问的，直接说就好</Text> : null}
            </Space>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSession}>
                {isMobile ? '' : '新对话'}
              </Button>
              {activeSessionId ? (
                <Button icon={<ToolOutlined />} onClick={() => setIsToolDrawerOpen(true)}>
                  {isMobile ? '' : '工具箱'}
                </Button>
              ) : null}
              {isAdminUser && onSwitchToAdmin ? (
                <Button icon={<SettingOutlined />} onClick={onSwitchToAdmin}>
                  {isMobile ? '' : '管理视图'}
                </Button>
              ) : null}
            </Space>
          </Space>
        </Card>

        {/* ── 移动端 Drawer ── */}
        {isMobile ? (
          <Drawer
            title="历史对话"
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
              <Card title="历史对话" bodyStyle={{ padding: 8 }}>
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
                                    思考中...
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
                            <Text strong>分析完成</Text>
                          </Space>

                          {/* 置信度 */}
                          {resultData.confidence !== null ? (
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {confidenceConfig(resultData.confidence).label}
                              </Text>
                              <Progress
                                percent={resultData.confidence}
                                strokeColor={confidenceConfig(resultData.confidence).color}
                                size="small"
                                showInfo={false}
                                style={{ marginTop: 2 }}
                              />
                            </div>
                          ) : null}

                          {/* 核心结论 */}
                          {resultData.conclusion ? (
                            <div
                              className="copilot-markdown"
                              style={{ fontSize: 13, lineHeight: 1.6 }}
                            >
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {resultData.conclusion.slice(0, 300)}
                              </ReactMarkdown>
                            </div>
                          ) : null}

                          {/* 可追溯摘要 */}
                          {resultData.traceability ? (
                            <Space size={[6, 6]} wrap>
                              <Tag color="blue">
                                证据 {resultData.traceability.evidenceCount} 条
                              </Tag>
                              <Tag color="green">
                                强证据 {resultData.traceability.strongEvidenceCount}
                              </Tag>
                              <Tag color="purple">
                                外部 {resultData.traceability.externalEvidenceCount}
                              </Tag>
                              <Button
                                type="link"
                                size="small"
                                style={{ paddingInline: 0 }}
                                onClick={() => {
                                  const replayPath = resultData.traceability?.replayPath;
                                  if (replayPath) {
                                    window.open(replayPath, '_blank');
                                  }
                                }}
                              >
                                查看执行回放
                              </Button>
                            </Space>
                          ) : null}

                          {/* 证据链（来源 + 时间戳 + 新鲜度/质量） */}
                          {resultData.evidenceItems.length > 0 ? (
                            <div>
                              <Text
                                type="secondary"
                                style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                              >
                                证据链（点击可追溯）：
                              </Text>
                              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                {resultData.evidenceItems.slice(0, 4).map((evidence) => (
                                  <Card
                                    key={evidence.id}
                                    size="small"
                                    bodyStyle={{ padding: '8px 10px' }}
                                  >
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                      <Space size={[4, 4]} wrap>
                                        <Text strong style={{ fontSize: 12 }}>
                                          {evidence.title}
                                        </Text>
                                        <Tag>{evidence.source}</Tag>
                                        {evidence.timestamp ? (
                                          <Tag icon={<ClockCircleOutlined />}>
                                            {formatTurnTime(evidence.timestamp)}
                                          </Tag>
                                        ) : null}
                                        <Tag color={evidenceFreshnessColor[evidence.freshness]}>
                                          {evidenceFreshnessLabel[evidence.freshness]}
                                        </Tag>
                                        <Tag color={evidenceQualityColor[evidence.quality]}>
                                          {evidenceQualityLabel[evidence.quality]}
                                        </Tag>
                                      </Space>
                                      <Text type="secondary" style={{ fontSize: 12 }}>
                                        {evidence.summary}
                                      </Text>
                                      <Space size={8} wrap>
                                        {evidence.sourceUrl ? (
                                          <Button
                                            size="small"
                                            type="link"
                                            href={evidence.sourceUrl}
                                            target="_blank"
                                            style={{ paddingInline: 0 }}
                                          >
                                            查看来源
                                          </Button>
                                        ) : null}
                                        <Button
                                          size="small"
                                          type="link"
                                          style={{ paddingInline: 0 }}
                                          onClick={() => {
                                            const tracePath =
                                              evidence.tracePath ??
                                              resultData.traceability?.replayPath;
                                            if (tracePath) {
                                              window.open(tracePath, '_blank');
                                            }
                                          }}
                                        >
                                          追溯轨迹
                                        </Button>
                                      </Space>
                                    </Space>
                                  </Card>
                                ))}
                              </Space>
                              {resultData.evidenceItems.length > 4 ? (
                                <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                                  已展示前 4 条证据，可在执行回放中查看完整链路。
                                </Text>
                              ) : null}
                            </div>
                          ) : null}

                          {/* 行动建议 */}
                          {resultData.actions.length > 0 ? (
                            <div>
                              <Text
                                type="secondary"
                                style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                              >
                                行动建议：
                              </Text>
                              {resultData.actions.map((action, idx) => (
                                <Tag
                                  key={idx}
                                  color="blue"
                                  style={{ marginBottom: 4, fontSize: 12 }}
                                >
                                  {action}
                                </Tag>
                              ))}
                            </div>
                          ) : null}

                          {/* 操作按钮 */}
                          <Space size={8} wrap>
                            <Button
                              size="small"
                              icon={<BarChartOutlined />}
                              loading={exportMutation.isPending}
                              onClick={handleExportPdf}
                            >
                              导出 PDF
                            </Button>
                            <Button
                              size="small"
                              icon={<MailOutlined />}
                              onClick={() => setShowEmailForm(!showEmailForm)}
                            >
                              发送到邮箱
                            </Button>
                            <Divider type="vertical" />
                            <Button
                              size="small"
                              icon={<SaveOutlined />}
                              onClick={() => void handleQuickPromptSend('保存这个智能体到系统中')}
                            >
                              保存为常用
                            </Button>
                            <Button
                              size="small"
                              icon={<ScheduleOutlined />}
                              onClick={() =>
                                void handleQuickPromptSend('每周一早上8点自动执行这个分析')
                              }
                            >
                              定时执行
                            </Button>
                            <Button
                              size="small"
                              icon={<SyncOutlined />}
                              onClick={() => void handleQuickPromptSend('调整参数后重新分析')}
                            >
                              调参重跑
                            </Button>
                            <Button
                              size="small"
                              icon={<DiffOutlined />}
                              onClick={() => {
                                setToolTabKey('result-diff');
                                setIsToolDrawerOpen(true);
                              }}
                            >
                              结论变化
                            </Button>
                          </Space>

                          {/* 内嵌邮件发送表单 */}
                          {showEmailForm ? (
                            <Card size="small" style={{ background: '#fff', marginTop: 4 }}>
                              <Space direction="vertical" style={{ width: '100%' }} size={8}>
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
                                    loading={deliverMutation.isPending}
                                    disabled={!emailTo.trim()}
                                    onClick={async () => {
                                      if (!activeSessionId) return;
                                      try {
                                        // 先导出获取 exportTaskId
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
                                    }}
                                  >
                                    发送
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      setShowEmailForm(false);
                                      setEmailTo('');
                                    }}
                                  >
                                    取消
                                  </Button>
                                </Space>
                              </Space>
                            </Card>
                          ) : null}
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
                          💡 你可以继续问我：
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
                      我已经准备好分析方案了，需要我开始吗？
                    </Text>
                    <Space size={8}>
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={confirmPlanMutation.isPending}
                        onClick={handleConfirmPlan}
                      >
                        开始分析
                      </Button>
                      <Button size="small" onClick={() => setInput('请调整方案，')}>
                        🔧 调整一下
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
                  items={[{ title: '理解需求' }, { title: '分析中' }, { title: '生成结论' }]}
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
                    发送
                  </Button>
                </Space.Compact>
              </div>
            </Card>
          </Col>
        </Row>
      </Space>

      {/* ── 工具箱 Drawer ── */}
      <Drawer
        title="🧰 工具箱"
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
                  智能体
                </span>
              ),
              children: <EphemeralAgentPanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'workflows',
              label: (
                <span>
                  <BarChartOutlined style={{ marginRight: 4 }} />
                  工作流
                </span>
              ),
              children: <EphemeralWorkflowPanel sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'security',
              label: (
                <span>
                  <SafetyOutlined style={{ marginRight: 4 }} />
                  安全
                </span>
              ),
              children: <SecurityDashboard sessionId={activeSessionId ?? null} />,
            },
            {
              key: 'result-diff',
              label: (
                <span>
                  <DiffOutlined style={{ marginRight: 4 }} />
                  结果对比
                </span>
              ),
              children: <ResultDiffTimelinePanel sessionId={activeSessionId ?? null} />,
            },
          ]}
        />
      </Drawer>
    </>
  );
};
