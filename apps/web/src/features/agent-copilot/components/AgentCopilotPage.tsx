import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Input,
  Modal,
  List,
  Progress,
  Segmented,
  Row,
  Space,
  Timeline,
  Tag,
  Typography,
} from 'antd';
import {
  BulbOutlined,
  DownloadOutlined,
  MailOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { getApiError } from '../../../api/client';
import {
  CopilotPromptScope,
  useConfirmConversationPlan,
  useConversationBacktest,
  useConversationConflicts,
  useConversationAssets,
  useConversationSubscriptions,
  useConversationDetail,
  useConversationResult,
  useConversationSessions,
  useCopilotPromptTemplates,
  useCreateConversationSubscription,
  useCreateConversationSession,
  useCreateConversationBacktest,
  useCreateSkillDraft,
  useDeliverConversation,
  useExportConversationResult,
  useRunConversationSubscription,
  useSendConversationTurn,
  useReuseConversationAsset,
  useSubmitSkillDraftReview,
  useSandboxSkillDraft,
  useReviewSkillDraft,
  useConsumeSkillRuntimeGrant,
  useSkillGovernanceEvents,
  useSkillGovernanceOverview,
  useSkillDraftRuntimeGrants,
  useUpdateConversationSubscription,
  useRevokeSkillRuntimeGrant,
  usePublishSkillDraft,
  useResolveScheduleCommand,
  useUpsertCopilotPromptTemplates,
} from '../api/conversations';

const { Text, Title, Paragraph } = Typography;

const QUICK_PROMPT_STORAGE_KEY_PREFIX = 'ctbms.agent.copilot.quick-prompts.v1';

type QuickPromptTemplate = {
  key: string;
  label: string;
  prompt: string;
};

const getOppositeScope = (scope: CopilotPromptScope): CopilotPromptScope =>
  scope === 'PERSONAL' ? 'TEAM' : 'PERSONAL';

const defaultQuickPrompts: QuickPromptTemplate[] = [
  {
    key: 'weekly-review',
    label: '周度复盘',
    prompt: '请结合日报/周报/研报和期货持仓，做过去一周复盘并给风险提示。',
  },
  {
    key: 'forecast-3m',
    label: '三月展望',
    prompt: '请分析最近一周东北玉米价格并给出未来三个月建议，输出Markdown+JSON。',
  },
  {
    key: 'debate-judge',
    label: '辩论裁判',
    prompt: '请就东北玉米未来三个月是否缺口并涨价进行多智能体辩论，并给出裁判结论。',
  },
];

const stateColor: Record<string, string> = {
  INTENT_CAPTURE: 'default',
  SLOT_FILLING: 'processing',
  PLAN_PREVIEW: 'warning',
  USER_CONFIRM: 'warning',
  EXECUTING: 'processing',
  RESULT_DELIVERY: 'success',
  DONE: 'success',
  FAILED: 'error',
};

const copilotErrorMessageByCode: Record<string, string> = {
  CONV_SESSION_NOT_FOUND: '会话不存在或无权限访问，请刷新后重试。',
  CONV_RESULT_NOT_FOUND: '会话结果不可见，请确认任务是否已执行。',
  CONV_PLAN_VERSION_NOT_FOUND: '计划版本已过期，请重新生成计划。',
  CONV_PLAN_ALREADY_CONFIRMED: '该计划已执行，请勿重复提交。',
  CONV_PLAN_ID_MISMATCH: '计划内容已变化，请刷新后确认。',
  CONV_WORKFLOW_NOT_BINDABLE: '未绑定可执行流程，请先选择模板。',
  CONV_EXECUTION_TRIGGER_FAILED: '执行触发失败，请稍后重试。',
  CONV_EXPORT_EXECUTION_NOT_FOUND: '没有可导出的执行结果，请先运行任务。',
  CONV_EXPORT_TASK_NOT_FOUND: '导出任务不存在或无权限访问。',
  CONV_EXPORT_TASK_NOT_READY: '导出任务尚未完成，请稍后再发送邮箱。',
  CONV_DELIVERY_TARGET_REQUIRED: '请补充投递目标信息。',
  CONV_SUB_PLAN_NOT_FOUND: '未找到可订阅计划，请先确认并执行计划。',
  CONV_SUB_NOT_FOUND: '订阅不存在或无权限访问。',
  CONV_BACKTEST_EXECUTION_NOT_FOUND: '未找到可回测的执行实例，请先完成一次执行。',
  CONV_BACKTEST_NOT_FOUND: '回测任务不存在或无权限访问。',
  CONV_BACKTEST_RUN_FAILED: '回测执行失败，请稍后重试。',
  SKILL_DRAFT_NOT_FOUND: 'Skill Draft 不存在或无权限访问。',
  SKILL_RUNTIME_GRANT_NOT_FOUND: '运行时授权不存在或无权限访问。',
  SKILL_RUNTIME_GRANT_INACTIVE: '运行时授权已失效。',
  SKILL_RUNTIME_GRANT_EXPIRED: '运行时授权已过期。',
  SKILL_REVIEWER_CONFLICT: '高风险草稿不能由创建者本人审批通过。',
  SKILL_HIGH_RISK_REVIEW_REQUIRED: '高风险草稿必须由非创建者审批后才能发布。',
  CONV_SCHEDULE_SUB_NOT_FOUND: '未找到可操作订阅，请先创建或指定正确名称。',
};

export const AgentCopilotPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [input, setInput] = useState('');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState<'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU'>('EMAIL');
  const [deliveryTarget, setDeliveryTarget] = useState('');
  const [sendRawFile, setSendRawFile] = useState(true);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateEditor, setTemplateEditor] = useState('');
  const [templateScope, setTemplateScope] = useState<CopilotPromptScope>('PERSONAL');
  const [templateMode, setTemplateMode] = useState<'FORM' | 'JSON'>('FORM');
  const [templateDraft, setTemplateDraft] = useState<QuickPromptTemplate[]>(defaultQuickPrompts);
  const [quickPrompts, setQuickPrompts] = useState<QuickPromptTemplate[]>(defaultQuickPrompts);
  const [subscriptionName, setSubscriptionName] = useState('每周玉米复盘订阅');
  const [subscriptionCronExpr, setSubscriptionCronExpr] = useState('0 0 8 * * 1');
  const [scheduleInstruction, setScheduleInstruction] = useState('每周一9点发到企业微信群ops-group-01');
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  const sessionsQuery = useConversationSessions({ page: 1, pageSize: 50 });
  const detailQuery = useConversationDetail(activeSessionId);
  const resultQuery = useConversationResult(activeSessionId);

  const createSessionMutation = useCreateConversationSession();
  const sendTurnMutation = useSendConversationTurn();
  const confirmPlanMutation = useConfirmConversationPlan();
  const exportMutation = useExportConversationResult();
  const deliverMutation = useDeliverConversation();
  const subscriptionsQuery = useConversationSubscriptions(activeSessionId);
  const createSubscriptionMutation = useCreateConversationSubscription();
  const updateSubscriptionMutation = useUpdateConversationSubscription();
  const runSubscriptionMutation = useRunConversationSubscription();
  const resolveScheduleMutation = useResolveScheduleCommand();
  const createBacktestMutation = useCreateConversationBacktest();
  const createSkillDraftMutation = useCreateSkillDraft();
  const sandboxSkillDraftMutation = useSandboxSkillDraft();
  const submitSkillDraftReviewMutation = useSubmitSkillDraftReview();
  const reviewSkillDraftMutation = useReviewSkillDraft();
  const publishSkillDraftMutation = usePublishSkillDraft();
  const revokeRuntimeGrantMutation = useRevokeSkillRuntimeGrant();
  const consumeRuntimeGrantMutation = useConsumeSkillRuntimeGrant();
  const governanceOverviewQuery = useSkillGovernanceOverview();
  const personalPromptTemplateQuery = useCopilotPromptTemplates('PERSONAL');
  const teamPromptTemplateQuery = useCopilotPromptTemplates('TEAM');
  const upsertPromptTemplatesMutation = useUpsertCopilotPromptTemplates();

  const activePromptTemplate =
    templateScope === 'PERSONAL' ? personalPromptTemplateQuery.data : teamPromptTemplateQuery.data;
  const oppositePromptTemplate =
    templateScope === 'PERSONAL' ? teamPromptTemplateQuery.data : personalPromptTemplateQuery.data;

  const latestPlan = useMemo(() => detailQuery.data?.plans?.[0], [detailQuery.data?.plans]);
  const latestAssistantTurn = useMemo(
    () => [...(detailQuery.data?.turns ?? [])].reverse().find((turn) => turn.role === 'ASSISTANT'),
    [detailQuery.data?.turns],
  );
  const latestAssistantPayload = (latestAssistantTurn?.structuredPayload ?? {}) as {
    missingSlots?: string[];
    proposedPlan?: Record<string, unknown> | null;
  };
  const missingSlots = latestAssistantPayload.missingSlots ?? [];
  const proposedPlanFromTurn = latestAssistantPayload.proposedPlan ?? null;
  const latestBacktestJobId = useMemo(() => {
    return [...(detailQuery.data?.turns ?? [])]
      .reverse()
      .map((turn) => turn.structuredPayload as Record<string, unknown> | undefined)
      .find((payload) => payload && typeof payload.backtestJobId === 'string')?.backtestJobId as
      | string
      | undefined;
  }, [detailQuery.data?.turns]);
  const latestSkillDraftId = useMemo(() => {
    return [...(detailQuery.data?.turns ?? [])]
      .reverse()
      .map((turn) => turn.structuredPayload as Record<string, unknown> | undefined)
      .find((payload) => payload && typeof payload.draftId === 'string')?.draftId as string | undefined;
  }, [detailQuery.data?.turns]);
  const governanceEventsQuery = useSkillGovernanceEvents(latestSkillDraftId);
  const runtimeGrantsQuery = useSkillDraftRuntimeGrants(latestSkillDraftId);
  const backtestQuery = useConversationBacktest(activeSessionId, latestBacktestJobId);
  const conflictsQuery = useConversationConflicts(activeSessionId);
  const assetsQuery = useConversationAssets(activeSessionId);
  const reuseAssetMutation = useReuseConversationAsset();

  const deliveryLogs = useMemo(() => {
    return (detailQuery.data?.turns ?? [])
      .filter((turn) => turn.role === 'ASSISTANT')
      .map((turn) => turn.structuredPayload as Record<string, unknown> | undefined)
      .filter((payload) => payload && typeof payload.deliveryTaskId === 'string')
      .map((payload) => ({
        deliveryTaskId: String(payload?.deliveryTaskId ?? ''),
        channel: String(payload?.channel ?? 'EMAIL'),
        target: typeof payload?.target === 'string' ? payload.target : null,
        status: String(payload?.status ?? 'UNKNOWN'),
        errorMessage: typeof payload?.errorMessage === 'string' ? payload.errorMessage : null,
      }))
      .reverse();
  }, [detailQuery.data?.turns]);
  const planSnapshot = (latestPlan?.planSnapshot ?? null) as
    | {
        planId?: string;
        skills?: string[];
        estimatedCost?: { token?: number; latencyMs?: number };
      }
    | null;

  const showCopilotError = (error: unknown, fallback: string) => {
    const apiError = getApiError(error);
    const codeMsg = apiError.code ? copilotErrorMessageByCode[apiError.code] : null;
    message.error(codeMsg || apiError.message || fallback);
  };

  const handleCreateSubscription = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!latestPlan) {
      message.warning('请先生成并确认计划');
      return;
    }
    try {
      await createSubscriptionMutation.mutateAsync({
        sessionId: activeSessionId,
        name: subscriptionName,
        cronExpr: subscriptionCronExpr,
        planVersion: latestPlan.version,
      });
      message.success('订阅创建成功');
    } catch (error) {
      showCopilotError(error, '订阅创建失败');
    }
  };

  const handleResolveSchedule = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!scheduleInstruction.trim()) {
      message.warning('请输入调度指令');
      return;
    }
    try {
      const result = await resolveScheduleMutation.mutateAsync({
        sessionId: activeSessionId,
        instruction: scheduleInstruction,
      });
      message.success(`调度已解析并执行：${result.data.action}`);
    } catch (error) {
      showCopilotError(error, '调度指令执行失败');
    }
  };

  const handleToggleSubscription = async (
    subscriptionId: string,
    status: 'ACTIVE' | 'PAUSED' | 'FAILED' | 'ARCHIVED',
  ) => {
    if (!activeSessionId) {
      return;
    }
    const nextStatus = status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await updateSubscriptionMutation.mutateAsync({
        sessionId: activeSessionId,
        subscriptionId,
        status: nextStatus,
      });
      message.success(nextStatus === 'ACTIVE' ? '已恢复订阅' : '已暂停订阅');
    } catch (error) {
      showCopilotError(error, '订阅更新失败');
    }
  };

  const handleRunSubscriptionNow = async (subscriptionId: string) => {
    if (!activeSessionId) {
      return;
    }
    try {
      await runSubscriptionMutation.mutateAsync({
        sessionId: activeSessionId,
        subscriptionId,
      });
      message.success('已触发补跑');
    } catch (error) {
      showCopilotError(error, '补跑失败');
    }
  };

  const handleCreateBacktest = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    const executionId = resultQuery.data?.executionId;
    if (!executionId) {
      message.warning('暂无可回测执行结果，请先确认并执行计划');
      return;
    }
    try {
      const created = await createBacktestMutation.mutateAsync({
        sessionId: activeSessionId,
        executionId,
        strategySource: 'LATEST_ACTIONS',
        lookbackDays: 180,
        feeModel: {
          spotFeeBps: 8,
          futuresFeeBps: 3,
        },
      });
      message.success(`回测任务已创建：${created.data.backtestJobId}`);
    } catch (error) {
      showCopilotError(error, '回测创建失败');
    }
  };

  const handleCreateSkillDraft = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    try {
      const result = await createSkillDraftMutation.mutateAsync({
        sessionId: activeSessionId,
        gapType: 'MISSING_EXTERNAL_DATA_SOURCE',
        requiredCapability: '需要补充外部市场数据抓取能力以提高结论覆盖度',
        suggestedSkillCode: `market_gap_${Date.now()}`,
      });
      message.success(`Skill Draft 已创建：${result.data.draftId}`);
    } catch (error) {
      showCopilotError(error, '创建 Skill Draft 失败');
    }
  };

  const handleReuseAsset = async (assetId: string, title: string) => {
    if (!activeSessionId) {
      return;
    }
    try {
      await reuseAssetMutation.mutateAsync({
        sessionId: activeSessionId,
        assetId,
        message: `请基于「${title}」继续分析，并输出更新后的结论。`,
      });
      message.success('已基于历史结果继续执行');
    } catch (error) {
      showCopilotError(error, '复用失败');
    }
  };

  const handleSandboxSkillDraft = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可测试的 Skill Draft');
      return;
    }
    try {
      const result = await sandboxSkillDraftMutation.mutateAsync({
        draftId: latestSkillDraftId,
        testCases: [
          {
            input: { symbol: 'C', date: '2026-02-25', market: 'DCE' },
            expectContains: ['symbol'],
          },
        ],
      });
      message.success(`沙箱测试完成：${result.status}（${result.passedCount}/${result.passedCount + result.failedCount}）`);
    } catch (error) {
      showCopilotError(error, '沙箱测试失败');
    }
  };

  const handleSubmitSkillDraftReview = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可提交的 Skill Draft');
      return;
    }
    try {
      const result = await submitSkillDraftReviewMutation.mutateAsync(latestSkillDraftId);
      message.success(`已提交审批：${result.status}`);
    } catch (error) {
      showCopilotError(error, '提交审批失败');
    }
  };

  const handleApproveSkillDraft = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可审批的 Skill Draft');
      return;
    }
    try {
      const result = await reviewSkillDraftMutation.mutateAsync({
        draftId: latestSkillDraftId,
        action: 'APPROVE',
        comment: '自动化验收通过',
      });
      message.success(`审批完成：${result.status}`);
    } catch (error) {
      showCopilotError(error, '审批失败');
    }
  };

  const handlePublishSkillDraft = async () => {
    if (!latestSkillDraftId) {
      message.warning('暂无可发布的 Skill Draft');
      return;
    }
    try {
      const result = await publishSkillDraftMutation.mutateAsync(latestSkillDraftId);
      message.success(`发布完成：${result.status}`);
    } catch (error) {
      showCopilotError(error, '发布失败');
    }
  };

  const handleRevokeRuntimeGrant = async (grantId: string) => {
    if (!latestSkillDraftId) {
      return;
    }
    try {
      await revokeRuntimeGrantMutation.mutateAsync({
        draftId: latestSkillDraftId,
        grantId,
        reason: 'manual revoke from copilot',
      });
      message.success('已撤销运行时授权');
    } catch (error) {
      showCopilotError(error, '撤销授权失败');
    }
  };

  const handleConsumeRuntimeGrant = async (grantId: string) => {
    if (!latestSkillDraftId) {
      return;
    }
    try {
      await consumeRuntimeGrantMutation.mutateAsync({
        draftId: latestSkillDraftId,
        grantId,
      });
      message.success('已记录一次运行时授权使用');
    } catch (error) {
      showCopilotError(error, '记录授权使用失败');
    }
  };

  const handleCreateSession = async () => {
    try {
      const session = await createSessionMutation.mutateAsync({
        title: `会话 ${new Date().toLocaleString('zh-CN')}`,
      });
      setActiveSessionId(session.id);
      message.success('已创建新会话');
    } catch (error) {
      showCopilotError(error, '创建会话失败');
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content) {
      return;
    }

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSessionMutation.mutateAsync({
          title: `会话 ${new Date().toLocaleString('zh-CN')}`,
        });
        targetSessionId = session.id;
        setActiveSessionId(session.id);
      } catch (error) {
        showCopilotError(error, '创建会话失败，请稍后重试');
        return;
      }
    }

    try {
      await sendTurnMutation.mutateAsync({ sessionId: targetSessionId, message: content });
      setInput('');
    } catch (error) {
      showCopilotError(error, '发送失败，请稍后重试');
    }
  };

  const handleQuickPromptSend = async (prompt: string) => {
    setInput(prompt);
    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const session = await createSessionMutation.mutateAsync({
          title: `会话 ${new Date().toLocaleString('zh-CN')}`,
        });
        targetSessionId = session.id;
        setActiveSessionId(session.id);
      } catch (error) {
        showCopilotError(error, '创建会话失败，请稍后重试');
        return;
      }
    }

    try {
      await sendTurnMutation.mutateAsync({ sessionId: targetSessionId, message: prompt });
      setInput('');
      message.success('已发送快捷问题');
    } catch (error) {
      showCopilotError(error, '快捷问题发送失败');
    }
  };

  const handleConfirmPlan = async () => {
    if (!activeSessionId || !latestPlan || !planSnapshot?.planId) {
      message.warning('暂无可确认的计划');
      return;
    }
    try {
      await confirmPlanMutation.mutateAsync({
        sessionId: activeSessionId,
        planId: planSnapshot.planId,
        planVersion: latestPlan.version,
      });
      message.success('计划已确认，任务执行中');
    } catch (error) {
      showCopilotError(error, '计划确认失败');
    }
  };

  const artifacts = resultQuery.data?.artifacts ?? [];
  const latestArtifact = artifacts[0];
  const executionTimeline = useMemo(() => {
    const state = resultQuery.data?.status ?? detailQuery.data?.state ?? 'INTENT_CAPTURE';
    const delivered = deliveryLogs.some((item) => item.status === 'SENT');
    return [
      {
        key: 'plan',
        label: '计划生成',
        done: Boolean(latestPlan),
      },
      {
        key: 'confirm',
        label: '计划确认',
        done: Boolean(latestPlan?.isConfirmed),
      },
      {
        key: 'execute',
        label: '任务执行',
        done: ['EXECUTING', 'DONE', 'FAILED', 'RESULT_DELIVERY'].includes(String(state)),
      },
      {
        key: 'export',
        label: '导出产物',
        done: artifacts.length > 0,
      },
      {
        key: 'deliver',
        label: '邮件投递',
        done: delivered,
      },
    ];
  }, [resultQuery.data?.status, detailQuery.data?.state, latestPlan, artifacts.length, deliveryLogs]);

  useEffect(() => {
    if (!timelineRef.current) {
      return;
    }
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [detailQuery.data?.turns, sendTurnMutation.isSuccess]);

  useEffect(() => {
    const remoteTemplates = (activePromptTemplate?.metadata as Record<string, unknown> | undefined)
      ?.templates;
    if (!Array.isArray(remoteTemplates)) {
      return;
    }
    const normalized = remoteTemplates
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const row = item as Record<string, unknown>;
        const key = typeof row.key === 'string' ? row.key.trim() : '';
        const label = typeof row.label === 'string' ? row.label.trim() : '';
        const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : '';
        if (!key || !label || !prompt) {
          return null;
        }
        return { key, label, prompt };
      })
      .filter((item): item is QuickPromptTemplate => Boolean(item));
    if (normalized.length) {
      setQuickPrompts(normalized);
    }
  }, [activePromptTemplate]);

  useEffect(() => {
    if (activePromptTemplate?.id) {
      return;
    }
    try {
      const raw = localStorage.getItem(`${QUICK_PROMPT_STORAGE_KEY_PREFIX}.${templateScope}`);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        return;
      }
      const normalized = parsed
        .map((item) => {
          const key = typeof item.key === 'string' ? item.key.trim() : '';
          const label = typeof item.label === 'string' ? item.label.trim() : '';
          const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
          if (!key || !label || !prompt) {
            return null;
          }
          return { key, label, prompt };
        })
        .filter((item): item is QuickPromptTemplate => Boolean(item));
      if (normalized.length) {
        setQuickPrompts(normalized);
      }
    } catch {
      // ignore invalid cache
    }
  }, [activePromptTemplate?.id, templateScope]);

  const handleExportPdf = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    const workflowExecutionId = resultQuery.data?.executionId;
    if (!workflowExecutionId) {
      message.warning('当前没有可导出的执行结果');
      return;
    }
    try {
      await exportMutation.mutateAsync({
        sessionId: activeSessionId,
        workflowExecutionId,
        format: 'PDF',
        title: '对话助手分析报告',
        sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'],
      });
      message.success('已触发导出，请稍后刷新结果查看下载链接');
    } catch (error) {
      showCopilotError(error, '导出失败');
    }
  };

  const handleSendDelivery = async () => {
    if (!activeSessionId) {
      message.warning('请先选择会话');
      return;
    }
    if (!latestArtifact?.exportTaskId) {
      message.warning('请先导出报告');
      return;
    }
    const to =
      deliveryChannel === 'EMAIL'
        ? emailTo
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    if (deliveryChannel === 'EMAIL' && !to.length) {
      message.warning('请输入收件邮箱');
      return;
    }
    if (deliveryChannel !== 'EMAIL' && !deliveryTarget.trim()) {
      message.warning('请输入投递目标，例如群ID或机器人标识');
      return;
    }

    try {
      const result = await deliverMutation.mutateAsync({
        sessionId: activeSessionId,
        exportTaskId: latestArtifact.exportTaskId,
        channel: deliveryChannel,
        to,
        target: deliveryChannel === 'EMAIL' ? undefined : deliveryTarget.trim(),
        subject: 'CTBMS 对话助手分析报告',
        content: '您好，附件为本次对话分析报告，请查收。',
        sendRawFile,
      });
      if (result.data.status === 'SENT') {
        message.success('投递已发送');
        setEmailModalOpen(false);
      } else {
        message.warning(result.data.errorMessage || '投递发送失败');
      }
    } catch (error) {
      showCopilotError(error, '投递失败');
    }
  };

  const openTemplateModal = () => {
    setTemplateMode('FORM');
    setTemplateDraft(quickPrompts);
    setTemplateEditor(JSON.stringify(quickPrompts, null, 2));
    setTemplateModalOpen(true);
  };

  const normalizeTemplateArray = (input: Array<Record<string, unknown>>) => {
    return input
      .map((item) => {
        const key = typeof item.key === 'string' ? item.key.trim() : '';
        const label = typeof item.label === 'string' ? item.label.trim() : '';
        const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
        if (!key || !label || !prompt) {
          return null;
        }
        return { key, label, prompt };
      })
      .filter((item): item is QuickPromptTemplate => Boolean(item));
  };

  const collectDuplicates = (items: QuickPromptTemplate[], field: 'key' | 'label') => {
    const seen = new Map<string, number>();
    for (const item of items) {
      const value = item[field].trim();
      seen.set(value, (seen.get(value) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value);
  };

  const persistTemplates = async (next: QuickPromptTemplate[]) => {
    setQuickPrompts(next);
    localStorage.setItem(`${QUICK_PROMPT_STORAGE_KEY_PREFIX}.${templateScope}`, JSON.stringify(next));
    try {
      await upsertPromptTemplatesMutation.mutateAsync({
        scope: templateScope,
        bindingId: activePromptTemplate?.id,
        templates: next,
      });
      message.success('模板保存成功（已同步到配置中心）');
    } catch {
      message.warning('模板已本地保存，但配置中心同步失败');
    } finally {
      setTemplateModalOpen(false);
    }
  };

  const handleSaveTemplates = async () => {
    try {
      const next =
        templateMode === 'FORM'
          ? templateDraft.filter((item) => item.key && item.label && item.prompt)
          : normalizeTemplateArray(JSON.parse(templateEditor) as Array<Record<string, unknown>>);

      if (!next.length) {
        message.error('至少保留一个有效模板（含 key/label/prompt）');
        return;
      }

      const duplicateKeys = collectDuplicates(next, 'key');
      if (duplicateKeys.length) {
        message.error(`存在重复 key：${duplicateKeys.join('、')}，请修改后保存`);
        return;
      }

      const duplicateLabels = collectDuplicates(next, 'label');
      if (duplicateLabels.length) {
        modal.confirm({
          title: '检测到重复模板名称',
          content: `重复名称：${duplicateLabels.join('、')}。是否继续保存？`,
          okText: '继续保存',
          cancelText: '返回修改',
          onOk: async () => {
            await persistTemplates(next);
          },
        });
        return;
      }

      await persistTemplates(next);
    } catch {
      message.error('JSON 解析失败，请检查格式');
    }
  };

  const handleTemplateScopeChange = (scope: CopilotPromptScope) => {
    setTemplateScope(scope);
  };

  const handleCopyFromOppositeScope = () => {
    const sourceTemplates = (oppositePromptTemplate?.metadata as Record<string, unknown> | undefined)
      ?.templates;
    if (!Array.isArray(sourceTemplates)) {
      message.warning('来源作用域暂无可复制模板');
      return;
    }

    const normalized = normalizeTemplateArray(sourceTemplates as Array<Record<string, unknown>>);
    if (!normalized.length) {
      message.warning('来源作用域模板无有效数据');
      return;
    }

    setTemplateDraft(normalized);
    setTemplateEditor(JSON.stringify(normalized, null, 2));
    setTemplateMode('FORM');
    message.success(`已从${getOppositeScope(templateScope) === 'PERSONAL' ? '个人' : '团队'}模板复制`);
  };

  const handleAddTemplate = () => {
    const idx = templateDraft.length + 1;
    setTemplateDraft([
      ...templateDraft,
      {
        key: `custom-${Date.now()}-${idx}`,
        label: `模板${idx}`,
        prompt: '',
      },
    ]);
  };

  const handleRemoveTemplate = (key: string) => {
    setTemplateDraft(templateDraft.filter((item) => item.key !== key));
  };

  const handleUpdateTemplate = (key: string, patch: Partial<QuickPromptTemplate>) => {
    setTemplateDraft(
      templateDraft.map((item) => {
        if (item.key !== key) {
          return item;
        }
        const nextLabel = patch.label ?? item.label;
        const nextKey =
          patch.key ??
          item.key ??
          `tmpl-${nextLabel.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '')}`;
        return {
          ...item,
          ...patch,
          key: nextKey,
        };
      }),
    );
  };

  const handleExportTemplates = () => {
    const payload = JSON.stringify(templateMode === 'FORM' ? templateDraft : quickPrompts, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ctbms-agent-copilot-templates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplatesClick = () => {
    templateFileInputRef.current?.click();
  };

  const handleImportTemplatesFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        message.error('导入失败：JSON 必须是数组');
        return;
      }

      const normalized = normalizeTemplateArray(parsed);
      if (!normalized.length) {
        message.error('导入失败：未识别到有效模板');
        return;
      }

      setTemplateDraft(normalized);
      setTemplateEditor(JSON.stringify(normalized, null, 2));
      setTemplateMode('FORM');
      message.success(`导入成功，共 ${normalized.length} 个模板`);
    } catch {
      message.error('导入失败：文件不是合法 JSON');
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <BulbOutlined style={{ color: '#1677ff' }} />
            <Title level={4} style={{ margin: 0 }}>
              对话助手
            </Title>
            <Text type="secondary">多轮对话生成计划并执行工作流</Text>
          </Space>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportPdf}
              loading={exportMutation.isPending}
              disabled={!resultQuery.data?.executionId}
            >
              顶部导出 PDF
            </Button>
            <Button onClick={openTemplateModal}>管理模板</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateSession}>
              新建会话
            </Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={6}>
          <Card title="会话列表" bodyStyle={{ padding: 8 }}>
            {sessionsQuery.data?.data?.length ? (
              <List
                size="small"
                dataSource={sessionsQuery.data.data}
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
                        {item.title || '未命名会话'}
                      </Text>
                      <Space>
                        <Tag color={stateColor[item.state] || 'default'}>{item.state}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(item.updatedAt).toLocaleString('zh-CN')}
                        </Text>
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" />
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card title="对话区" bodyStyle={{ height: 640, display: 'flex', flexDirection: 'column' }}>
            <div ref={timelineRef} style={{ flex: 1, overflow: 'auto', marginBottom: 12 }}>
              {detailQuery.data?.turns?.length ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {detailQuery.data.turns.map((turn) => (
                    <div
                      key={turn.id}
                      style={{
                        alignSelf: turn.role === 'USER' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        background: turn.role === 'USER' ? '#e6f4ff' : '#fafafa',
                        border: '1px solid #f0f0f0',
                        borderRadius: 10,
                        padding: '10px 12px',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {turn.role}
                      </Text>
                      <Paragraph style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{turn.content}</Paragraph>
                    </div>
                  ))}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="在左侧选择会话并开始提问" />
              )}
            </div>

            <Divider style={{ margin: '8px 0' }} />
            <Space wrap style={{ marginBottom: 8 }}>
              {quickPrompts.map((item) => (
                <Button
                  key={item.key}
                  size="small"
                  icon={<MessageOutlined />}
                  loading={sendTurnMutation.isPending || createSessionMutation.isPending}
                  onClick={() => void handleQuickPromptSend(item.prompt)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
            <Space.Compact style={{ width: '100%' }}>
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="输入你的业务问题，例如：请分析最近一周东北玉米价格并给出三个月建议"
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
              >
                发送
              </Button>
            </Space.Compact>
          </Card>
        </Col>

        <Col span={6}>
          <Card title="计划与结果" bodyStyle={{ minHeight: 640 }}>
            {latestPlan ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div>
                  <Text type="secondary">计划类型</Text>
                  <div>
                    <Tag color="blue">{latestPlan.planType}</Tag>
                    <Tag>v{latestPlan.version}</Tag>
                  </div>
                </div>

                <div>
                  <Text type="secondary">Skills</Text>
                  <div>
                    {(planSnapshot?.skills ?? []).map((skill) => (
                      <Tag key={skill}>{skill}</Tag>
                    ))}
                  </div>
                </div>

                <div>
                  <Text type="secondary">预估成本</Text>
                  <div>
                    <Text>
                      token: {planSnapshot?.estimatedCost?.token ?? '-'} / latency:{' '}
                      {planSnapshot?.estimatedCost?.latencyMs ?? '-'}ms
                    </Text>
                  </div>
                </div>

                <div>
                  <Text type="secondary">计划ID</Text>
                  <div>
                    <Text code>{String(planSnapshot?.planId ?? '-')}</Text>
                  </div>
                </div>

                <Divider style={{ margin: '8px 0' }} />
                <Text strong>订阅任务</Text>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Input
                    value={subscriptionName}
                    onChange={(e) => setSubscriptionName(e.target.value)}
                    placeholder="订阅名称"
                  />
                  <Input
                    value={subscriptionCronExpr}
                    onChange={(e) => setSubscriptionCronExpr(e.target.value)}
                    placeholder="cron 表达式，例如 0 0 8 * * 1"
                  />
                  <Button
                    onClick={handleCreateSubscription}
                    loading={createSubscriptionMutation.isPending}
                    disabled={!latestPlan}
                    block
                  >
                    创建订阅
                  </Button>

                  <Input.TextArea
                    value={scheduleInstruction}
                    onChange={(e) => setScheduleInstruction(e.target.value)}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder="自然语言调度，例如：每周五18点发到钉钉群ops"
                  />
                  <Button
                    onClick={handleResolveSchedule}
                    loading={resolveScheduleMutation.isPending}
                    block
                  >
                    自然语言配置调度
                  </Button>

                  <List
                    size="small"
                    dataSource={subscriptionsQuery.data ?? []}
                    locale={{ emptyText: '暂无订阅' }}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          <Button
                            key="toggle"
                            size="small"
                            loading={updateSubscriptionMutation.isPending}
                            onClick={() =>
                              void handleToggleSubscription(
                                item.id,
                                item.status as 'ACTIVE' | 'PAUSED' | 'FAILED' | 'ARCHIVED',
                              )
                            }
                          >
                            {item.status === 'ACTIVE' ? '暂停' : '恢复'}
                          </Button>,
                          <Button
                            key="rerun"
                            size="small"
                            loading={runSubscriptionMutation.isPending}
                            onClick={() => void handleRunSubscriptionNow(item.id)}
                          >
                            补跑
                          </Button>,
                        ]}
                      >
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Space>
                            <Text strong>{item.name}</Text>
                            <Tag color={item.status === 'ACTIVE' ? 'success' : 'default'}>{item.status}</Tag>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            cron: {item.cronExpr}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            下次执行: {item.nextRunAt ? new Date(item.nextRunAt).toLocaleString('zh-CN') : '-'}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Space>

                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={confirmPlanMutation.isPending}
                  onClick={handleConfirmPlan}
                  disabled={latestPlan.isConfirmed}
                  block
                >
                  {latestPlan.isConfirmed ? '计划已确认' : '确认执行'}
                </Button>

                <Divider />

                <div>
                  <Text strong>执行时间线</Text>
                  <Timeline
                    style={{ marginTop: 8 }}
                    items={executionTimeline.map((item) => ({
                      color: item.done ? 'green' : 'gray',
                      children: (
                        <Space>
                          <Text>{item.label}</Text>
                          <Tag color={item.done ? 'success' : 'default'}>{item.done ? '完成' : '待处理'}</Tag>
                        </Space>
                      ),
                    }))}
                  />
                </div>

                {resultQuery.data?.result ? (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Alert
                      type={resultQuery.data.status === 'FAILED' ? 'error' : 'info'}
                      message={`状态：${resultQuery.data.status}`}
                      description={resultQuery.data.error ?? `置信度：${resultQuery.data.result.confidence}`}
                      showIcon
                    />
                    <Progress
                      percent={Math.max(0, Math.min(100, Math.round(resultQuery.data.result.confidence * 100)))}
                      size="small"
                      status={resultQuery.data.status === 'FAILED' ? 'exception' : 'active'}
                    />
                    <Text strong>分析结论</Text>
                    <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{resultQuery.data.result.analysis || '-'}</Paragraph>

                    <Divider style={{ margin: '8px 0' }} />
                    <Space wrap>
                      <Button
                        icon={<PlayCircleOutlined />}
                        loading={createBacktestMutation.isPending}
                        onClick={handleCreateBacktest}
                        disabled={!resultQuery.data?.executionId}
                      >
                        发起回测
                      </Button>
                      <Button
                        icon={<DownloadOutlined />}
                        loading={exportMutation.isPending}
                        onClick={handleExportPdf}
                      >
                        导出 PDF
                      </Button>
                      <Button
                        icon={<MailOutlined />}
                        loading={deliverMutation.isPending}
                        onClick={() => {
                          setDeliveryChannel('EMAIL');
                          setEmailModalOpen(true);
                        }}
                        disabled={!latestArtifact?.exportTaskId}
                      >
                        发送渠道
                      </Button>
                      <Button
                        loading={deliverMutation.isPending}
                        onClick={() => {
                          setDeliveryChannel('DINGTALK');
                          setEmailModalOpen(true);
                        }}
                        disabled={!latestArtifact?.exportTaskId}
                      >
                        发钉钉
                      </Button>
                      <Button
                        loading={deliverMutation.isPending}
                        onClick={() => {
                          setDeliveryChannel('WECOM');
                          setEmailModalOpen(true);
                        }}
                        disabled={!latestArtifact?.exportTaskId}
                      >
                        发企微
                      </Button>
                      <Button
                        loading={deliverMutation.isPending}
                        onClick={() => {
                          setDeliveryChannel('FEISHU');
                          setEmailModalOpen(true);
                        }}
                        disabled={!latestArtifact?.exportTaskId}
                      >
                        发飞书
                      </Button>
                      {latestArtifact?.downloadUrl ? (
                        <Button
                          type="link"
                          href={latestArtifact.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          下载附件
                        </Button>
                      ) : null}
                    </Space>

                    {artifacts.length ? (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text strong>导出任务</Text>
                        <List
                          size="small"
                          dataSource={artifacts}
                          renderItem={(item) => (
                            <List.Item
                              actions={
                                item.downloadUrl
                                  ? [
                                      <a key="download" href={item.downloadUrl} target="_blank" rel="noreferrer">
                                        下载
                                      </a>,
                                    ]
                                  : []
                              }
                            >
                              <Space>
                                <Tag>{item.type}</Tag>
                                <Tag color={item.status === 'COMPLETED' ? 'success' : 'processing'}>
                                  {item.status}
                                </Tag>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {item.exportTaskId}
                                </Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </>
                    ) : null}

                    {deliveryLogs.length ? (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text strong>投递记录</Text>
                        <List
                          size="small"
                          dataSource={deliveryLogs}
                          renderItem={(item) => (
                            <List.Item>
                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                <Space>
                                  <Tag>{item.channel}</Tag>
                                  <Tag color={item.status === 'SENT' ? 'success' : item.status === 'FAILED' ? 'error' : 'processing'}>
                                    {item.status}
                                  </Tag>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    {item.deliveryTaskId}
                                  </Text>
                                </Space>
                                {item.target ? (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    目标: {item.target}
                                  </Text>
                                ) : null}
                                {item.errorMessage ? (
                                  <Text type="danger" style={{ fontSize: 12 }}>
                                    {item.errorMessage}
                                  </Text>
                                ) : null}
                              </Space>
                            </List.Item>
                          )}
                        />
                      </>
                    ) : null}

                    {backtestQuery.data ? (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text strong>回测结果</Text>
                        <Alert
                          type={
                            backtestQuery.data.status === 'FAILED'
                              ? 'error'
                              : backtestQuery.data.status === 'COMPLETED'
                                ? 'success'
                                : 'info'
                          }
                          message={`状态：${backtestQuery.data.status}`}
                          description={
                            backtestQuery.data.status === 'COMPLETED'
                              ? `收益 ${backtestQuery.data.summary?.returnPct ?? '-'}%，最大回撤 ${backtestQuery.data.summary?.maxDrawdownPct ?? '-'}%，胜率 ${backtestQuery.data.summary?.winRatePct ?? '-'}%，评分 ${backtestQuery.data.summary?.score ?? '-'}。`
                              : backtestQuery.data.errorMessage || '回测处理中'
                          }
                          showIcon
                        />
                      </>
                    ) : null}

                    {conflictsQuery.data ? (
                      <>
                        <Divider style={{ margin: '8px 0' }} />
                        <Text strong>冲突消解</Text>
                        <Alert
                          type={conflictsQuery.data.conflicts.length > 0 ? 'warning' : 'success'}
                          showIcon
                          message={`一致性分：${Math.round(conflictsQuery.data.consistencyScore * 100)}%`}
                          description={
                            conflictsQuery.data.conflicts.length > 0
                              ? `检测到 ${conflictsQuery.data.conflicts.length} 条冲突，请关注来源差异。`
                              : '未检测到显著冲突'
                          }
                        />
                        {conflictsQuery.data.conflicts.length > 0 ? (
                          <List
                            size="small"
                            dataSource={conflictsQuery.data.conflicts}
                            renderItem={(item) => (
                              <List.Item>
                                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                  <Text strong>{item.topic}</Text>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    来源: {item.sources.join(' vs ')}
                                  </Text>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    消解: {item.resolution || '-'} / {item.reason || '-'}
                                  </Text>
                                </Space>
                              </List.Item>
                            )}
                          />
                        ) : null}
                      </>
                    ) : null}

                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong>Skill Draft 审批流</Text>
                    <Space wrap>
                      <Button
                        onClick={handleCreateSkillDraft}
                        loading={createSkillDraftMutation.isPending}
                        icon={<PlusOutlined />}
                      >
                        创建 Draft
                      </Button>
                      <Button
                        onClick={handleSandboxSkillDraft}
                        loading={sandboxSkillDraftMutation.isPending}
                        disabled={!latestSkillDraftId}
                      >
                        沙箱测试
                      </Button>
                      <Button
                        onClick={handleSubmitSkillDraftReview}
                        loading={submitSkillDraftReviewMutation.isPending}
                        disabled={!latestSkillDraftId}
                      >
                        提交审批
                      </Button>
                      <Button
                        onClick={handleApproveSkillDraft}
                        loading={reviewSkillDraftMutation.isPending}
                        disabled={!latestSkillDraftId}
                      >
                        审批通过
                      </Button>
                      <Button
                        type="primary"
                        onClick={handlePublishSkillDraft}
                        loading={publishSkillDraftMutation.isPending}
                        disabled={!latestSkillDraftId}
                      >
                        发布 Skill
                      </Button>
                    </Space>
                    {latestSkillDraftId ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        当前 Draft: {latestSkillDraftId}
                      </Text>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        暂无 Draft
                      </Text>
                    )}

                    {governanceOverviewQuery.data ? (
                      <Alert
                        type={governanceOverviewQuery.data.highRiskPendingReview > 0 ? 'warning' : 'info'}
                        showIcon
                        message={`治理看板：活跃授权 ${governanceOverviewQuery.data.activeRuntimeGrants}，1小时内过期 ${governanceOverviewQuery.data.runtimeGrantsExpiringIn1h}，高风险待审 ${governanceOverviewQuery.data.highRiskPendingReview}`}
                      />
                    ) : null}

                    {governanceEventsQuery.data?.length ? (
                      <List
                        size="small"
                        dataSource={governanceEventsQuery.data.slice(0, 8)}
                        renderItem={(item) => (
                          <List.Item>
                            <Space direction="vertical" size={2} style={{ width: '100%' }}>
                              <Space>
                                <Tag>{item.eventType}</Tag>
                                <Text>{item.message}</Text>
                              </Space>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {new Date(item.createdAt).toLocaleString('zh-CN')}
                              </Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    ) : null}

                    {runtimeGrantsQuery.data?.length ? (
                      <>
                        <Text strong style={{ marginTop: 4 }}>
                          低风险先用后审授权
                        </Text>
                        <List
                          size="small"
                          dataSource={runtimeGrantsQuery.data}
                          renderItem={(item) => (
                            <List.Item
                              actions={
                                item.status === 'ACTIVE'
                                  ? [
                                      <Button
                                        key="use"
                                        size="small"
                                        loading={consumeRuntimeGrantMutation.isPending}
                                        onClick={() => void handleConsumeRuntimeGrant(item.id)}
                                      >
                                        记录使用
                                      </Button>,
                                      <Button
                                        key="revoke"
                                        size="small"
                                        loading={revokeRuntimeGrantMutation.isPending}
                                        onClick={() => void handleRevokeRuntimeGrant(item.id)}
                                      >
                                        撤销
                                      </Button>,
                                    ]
                                  : []
                              }
                            >
                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                <Space>
                                  <Tag color={item.status === 'ACTIVE' ? 'success' : 'default'}>{item.status}</Tag>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    使用 {item.useCount}/{item.maxUseCount}
                                  </Text>
                                </Space>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  过期: {new Date(item.expiresAt).toLocaleString('zh-CN')}
                                </Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </>
                    ) : null}

                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong>会话资产复用</Text>
                    <List
                      size="small"
                      dataSource={(assetsQuery.data ?? []).slice(0, 8)}
                      locale={{ emptyText: '暂无可复用资产' }}
                      renderItem={(item) => (
                        <List.Item
                          actions={[
                            <Button
                              key="reuse"
                              size="small"
                              loading={reuseAssetMutation.isPending}
                              onClick={() => void handleReuseAsset(item.id, item.title)}
                            >
                              继续基于此结果
                            </Button>,
                          ]}
                        >
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <Space>
                              <Tag>{item.assetType}</Tag>
                              <Text strong>{item.title}</Text>
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(item.createdAt).toLocaleString('zh-CN')}
                            </Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Space>
                ) : (
                  <Text type="secondary">暂无执行结果</Text>
                )}

                {(missingSlots.length > 0 || proposedPlanFromTurn) && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong>结构化提示</Text>
                    {missingSlots.length > 0 ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="待补充槽位"
                        description={missingSlots.join('、')}
                      />
                    ) : null}
                    {proposedPlanFromTurn ? (
                      <Card size="small" style={{ marginTop: 8 }}>
                        <Space direction="vertical" size={4}>
                          <Text type="secondary">计划ID</Text>
                          <Text code>{String(proposedPlanFromTurn.planId ?? '-')}</Text>
                          <Text type="secondary">计划类型</Text>
                          <Tag color="blue">{String(proposedPlanFromTurn.planType ?? '-')}</Tag>
                        </Space>
                      </Card>
                    ) : null}
                  </>
                )}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无计划" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="发送报告"
        open={emailModalOpen}
        onOk={handleSendDelivery}
        onCancel={() => setEmailModalOpen(false)}
        confirmLoading={deliverMutation.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Segmented
            value={deliveryChannel}
            options={[
              { label: '邮箱', value: 'EMAIL' },
              { label: '钉钉', value: 'DINGTALK' },
              { label: '企微', value: 'WECOM' },
              { label: '飞书', value: 'FEISHU' },
            ]}
            onChange={(value) => setDeliveryChannel(value as 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU')}
          />
          {deliveryChannel === 'EMAIL' ? (
            <>
              <Text type="secondary">多个邮箱请使用英文逗号分隔</Text>
              <Input
                placeholder="例如：user@example.com,ops@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </>
          ) : (
            <>
              <Text type="secondary">输入渠道目标，例如群ID、机器人标识或 webhook target</Text>
              <Input
                placeholder="例如：ops-group-01"
                value={deliveryTarget}
                onChange={(e) => setDeliveryTarget(e.target.value)}
              />
            </>
          )}
          <Button type={sendRawFile ? 'primary' : 'default'} onClick={() => setSendRawFile((v) => !v)}>
            {sendRawFile ? '当前发送原文件' : '当前发送导出文件'}
          </Button>
          {!latestArtifact?.exportTaskId ? (
            <Alert type="warning" message="请先导出报告，再发送" showIcon />
          ) : null}
        </Space>
      </Modal>

      <Modal
        title="快捷问题模板管理"
        open={templateModalOpen}
        onOk={handleSaveTemplates}
        onCancel={() => setTemplateModalOpen(false)}
        confirmLoading={upsertPromptTemplatesMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Segmented
              value={templateMode}
              options={[
                { label: '表单编辑', value: 'FORM' },
                { label: 'JSON 编辑', value: 'JSON' },
              ]}
              onChange={(value) => setTemplateMode(value as 'FORM' | 'JSON')}
            />
            <Segmented
              value={templateScope}
              options={[
                { label: '个人模板', value: 'PERSONAL' },
                { label: '团队模板', value: 'TEAM' },
              ]}
              onChange={(value) => handleTemplateScopeChange(value as CopilotPromptScope)}
            />
            <Space>
              <Button onClick={handleCopyFromOppositeScope}>从另一作用域复制</Button>
              <Button icon={<UploadOutlined />} onClick={handleImportTemplatesClick}>
                导入 JSON
              </Button>
              <Button onClick={handleExportTemplates}>导出 JSON</Button>
            </Space>
          </Space>

          <input
            ref={templateFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportTemplatesFile}
          />

          <Alert
            type="info"
            showIcon
            message="JSON 数组格式"
            description='每项需包含 key、label、prompt。示例：[{"key":"k1","label":"周度复盘","prompt":"..."}]'
          />

          {templateMode === 'FORM' ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button onClick={handleAddTemplate} icon={<PlusOutlined />}>
                新增模板
              </Button>
              <List
                size="small"
                dataSource={templateDraft}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="remove" danger size="small" onClick={() => handleRemoveTemplate(item.key)}>
                        删除
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Input
                        value={item.label}
                        placeholder="模板名称"
                        onChange={(e) =>
                          handleUpdateTemplate(item.key, {
                            label: e.target.value,
                          })
                        }
                      />
                      <Input.TextArea
                        value={item.prompt}
                        placeholder="模板提示词"
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        onChange={(e) => handleUpdateTemplate(item.key, { prompt: e.target.value })}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        key: {item.key}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Input.TextArea
              value={templateEditor}
              onChange={(e) => setTemplateEditor(e.target.value)}
              autoSize={{ minRows: 12, maxRows: 20 }}
            />
          )}
        </Space>
      </Modal>
    </Space>
  );
};
