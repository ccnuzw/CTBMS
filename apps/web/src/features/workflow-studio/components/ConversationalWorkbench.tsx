import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Markdown from 'react-markdown';
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Flex,
  Input,
  List,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  Tour,
  Typography,
  theme,
  Descriptions,
  Result,
  Badge,
  Grid,
} from 'antd';
import type { TourProps } from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  RobotOutlined,
  UserOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ExperimentOutlined,
  QuestionCircleOutlined,
  HistoryOutlined,
  EditOutlined,
  CompassOutlined,
  BarChartOutlined,
  AlertOutlined,
  FileTextOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  useCreateConversationSession,
  useSendConversationMessage,
  useConversationSessions,
  useConversationMessages,
  sendMessageWithSSE,
  type RichMessageBlock,
  type ConversationSessionItem,
} from '../api/conversational-workflow';

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

// ── 阶段标签 ──────────────────────────────────────────────

const PHASE_LABELS: Record<string, { text: string; color: string }> = {
  IDLE: { text: '等待输入', color: 'default' },
  INTENT_PARSED: { text: '意图识别', color: 'processing' },
  COLLECTING_PARAMS: { text: '收集参数', color: 'warning' },
  WORKFLOW_READY: { text: '就绪', color: 'success' },
  RUNNING: { text: '运行中', color: 'processing' },
  RESULT_DELIVERED: { text: '已完成', color: 'success' },
};

// ── 场景快捷卡片数据 ──────────────────────────────────────

interface SceneQuickItem {
  code: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  prompt: string;
}

const SCENE_CATEGORIES: Array<{ title: string; icon: React.ReactNode; items: SceneQuickItem[] }> = [
  {
    title: '日常分析',
    icon: <CompassOutlined />,
    items: [
      { code: 'MORNING_BRIEF', name: '晨间综判', description: '行情速览 + AI研判', icon: <CompassOutlined />, color: '#1677ff', prompt: '帮我做今天的晨间市场综判' },
      { code: 'INTRADAY_ALERT', name: '异动速报', description: '异常变动检出', icon: <AlertOutlined />, color: '#fa541c', prompt: '帮我监控盘中异动' },
      { code: 'CLOSING_JOURNAL', name: '收盘日志', description: '行情回顾 + 复盘', icon: <FileTextOutlined />, color: '#722ed1', prompt: '帮我做收盘日志' },
    ],
  },
  {
    title: '专项研判',
    icon: <BarChartOutlined />,
    items: [
      { code: 'SPREAD_ANALYSIS', name: '价差分析', description: '产销区价差', icon: <BarChartOutlined />, color: '#13c2c2', prompt: '分析一下区域价差' },
      { code: 'BASIS_ANALYSIS', name: '期现联动', description: '基差 + 套保', icon: <SyncOutlined />, color: '#52c41a', prompt: '分析一下期现联动' },
      { code: 'SUPPLY_DEMAND', name: '供需平衡', description: '全景分析', icon: <BarChartOutlined />, color: '#eb2f96', prompt: '做一个供需平衡分析' },
      { code: 'POLICY_DEBATE', name: '政策评估', description: '多角色讨论', icon: <ExperimentOutlined />, color: '#fa8c16', prompt: '评估一下最近的政策影响' },
    ],
  },
];

// ── 消息类型 ──────────────────────────────────────────────

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: RichMessageBlock[];
  timestamp: Date;
}

// ── 富消息渲染器 ──────────────────────────────────────────

const RichMessageRenderer: React.FC<{
  block: RichMessageBlock;
  onOptionClick?: (option: string) => void;
  onNavigate?: (path: string) => void;
}> = ({ block, onOptionClick, onNavigate }) => {
  const { token } = theme.useToken();

  switch (block.type) {
    case 'text':
      return (
        <div style={{ margin: 0, lineHeight: 1.7 }}>
          <Markdown>{block.content}</Markdown>
        </div>
      );

    case 'param_card':
      return (
        <Card size="small" style={{ background: token.colorInfoBg, borderColor: token.colorInfoBorder, marginTop: 8 }}>
          <Paragraph style={{ margin: 0 }}>{block.content}</Paragraph>
          {block.options && block.options.length > 0 && (
            <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
              {block.options.map((opt) => (
                <Tag key={opt} color="blue" style={{ cursor: 'pointer', padding: '4px 12px' }} onClick={() => onOptionClick?.(opt)}>
                  {opt}
                </Tag>
              ))}
            </Flex>
          )}
        </Card>
      );

    case 'workflow_preview':
      return (
        <Card
          size="small"
          title={<Space><ExperimentOutlined style={{ color: token.colorPrimary }} /><Text strong>{block.workflowPreview?.sceneName || '工作流预览'}</Text></Space>}
          style={{ background: token.colorBgElevated, borderColor: token.colorPrimaryBorder, marginTop: 8 }}
          extra={
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onNavigate?.('/workflow/hub')}>
              去编辑画布
            </Button>
          }
        >
          <Paragraph style={{ margin: 0 }}>{block.content}</Paragraph>
          {block.workflowPreview?.params && (
            <Descriptions
              size="small"
              column={1}
              style={{ marginTop: 8 }}
              items={Object.entries(block.workflowPreview.params).map(([key, value]) => ({
                key,
                label: key,
                children: String(value),
              }))}
            />
          )}
        </Card>
      );

    case 'execution_result': {
      const isSuccess = block.executionResult?.status === 'SUCCESS';
      const isFailed = block.executionResult?.status === 'FAILED';
      const isRunning = !isSuccess && !isFailed;

      return (
        <Card
          size="small"
          style={{
            background: isSuccess ? token.colorSuccessBg : isFailed ? token.colorErrorBg : token.colorInfoBg,
            borderColor: isSuccess ? token.colorSuccessBorder : isFailed ? token.colorErrorBorder : token.colorInfoBorder,
            marginTop: 8,
          }}
        >
          <Space>
            {isSuccess && <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 18 }} />}
            {isFailed && <CloseCircleOutlined style={{ color: token.colorError, fontSize: 18 }} />}
            {isRunning && <LoadingOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />}
            <Text strong>{block.executionResult?.summary || block.content}</Text>
          </Space>
          {block.executionResult?.reportContent && (
            <div
              style={{ marginTop: 12, padding: 12, background: token.colorBgContainer, borderRadius: token.borderRadius, fontSize: 13, maxHeight: 400, overflowY: 'auto', lineHeight: 1.7 }}
            >
              <Markdown>{block.executionResult.reportContent}</Markdown>
            </div>
          )}
          {block.executionResult?.detailUrl && (
            <Button type="link" size="small" onClick={() => onNavigate?.(block.executionResult!.detailUrl)} style={{ paddingLeft: 0, marginTop: 4 }}>
              查看执行详情 →
            </Button>
          )}
        </Card>
      );
    }

    case 'clarification':
      return (
        <Card size="small" style={{ background: token.colorWarningBg, borderColor: token.colorWarningBorder, marginTop: 8 }}>
          <Space align="start">
            <QuestionCircleOutlined style={{ color: token.colorWarning, fontSize: 16, marginTop: 3 }} />
            <div>
              <Paragraph style={{ margin: 0 }}>{block.content}</Paragraph>
              {block.options && block.options.length > 0 && (
                <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                  {block.options.map((opt) => (
                    <Tag key={opt} color="orange" style={{ cursor: 'pointer', padding: '4px 12px' }} onClick={() => onOptionClick?.(opt)}>
                      {opt}
                    </Tag>
                  ))}
                </Flex>
              )}
            </div>
          </Space>
        </Card>
      );

    default:
      return <Paragraph style={{ margin: 0 }}>{block.content}</Paragraph>;
  }
};

// ── 场景快捷卡片 ──────────────────────────────────────────

const SceneQuickCards: React.FC<{ onSelect: (prompt: string) => void }> = ({ onSelect }) => {
  const { token } = theme.useToken();

  return (
    <Flex vertical gap={32} style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      {SCENE_CATEGORIES.map((cat) => (
        <div key={cat.title}>
          <Space style={{ marginBottom: 16 }}>
            {React.cloneElement(cat.icon as React.ReactElement, { style: { fontSize: 18, color: token.colorPrimary } })}
            <Text strong style={{ fontSize: 16 }}>{cat.title}</Text>
          </Space>
          <Row gutter={[16, 16]}>
            {cat.items.map((item) => (
              <Col key={item.code} xs={24} sm={12} md={8}>
                <Card
                  hoverable
                  onClick={() => onSelect(item.prompt)}
                  style={{
                    borderLeft: `4px solid ${item.color}`,
                    cursor: 'pointer',
                    height: '100%',
                    transition: 'all 0.25s ease',
                  }}
                  bodyStyle={{ padding: '20px 24px' }}
                >
                  <Flex vertical gap={8}>
                    <Flex align="center" gap={8}>
                      {React.cloneElement(item.icon as React.ReactElement, { style: { fontSize: 20, color: item.color } })}
                      <Text strong style={{ color: item.color, fontSize: 16 }}>{item.name}</Text>
                    </Flex>
                    <Text type="secondary" style={{ fontSize: 13 }}>{item.description}</Text>
                  </Flex>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </Flex>
  );
};

// ── 会话列表抽屉 ──────────────────────────────────────────

const SessionDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  sessions: ConversationSessionItem[];
  isLoading: boolean;
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
}> = ({ open, onClose, sessions, isLoading, currentSessionId, onSelect }) => {
  const { token } = theme.useToken();

  return (
    <Drawer
      title="历史会话"
      placement="left"
      width={320}
      open={open}
      onClose={onClose}
    >
      <List
        loading={isLoading}
        dataSource={sessions}
        locale={{ emptyText: '暂无历史会话' }}
        renderItem={(item) => {
          const phaseInfo = PHASE_LABELS[item.phase] || { text: item.phase, color: 'default' };
          const isActive = item.sessionId === currentSessionId;
          return (
            <List.Item
              onClick={() => { onSelect(item.sessionId); onClose(); }}
              style={{
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: token.borderRadius,
                background: isActive ? token.colorPrimaryBg : undefined,
                marginBottom: 4,
              }}
            >
              <List.Item.Meta
                title={
                  <Flex justify="space-between" align="center">
                    <Text ellipsis style={{ maxWidth: 180, fontSize: 13 }}>{item.summary}</Text>
                    <Badge
                      status={phaseInfo.color as 'default' | 'processing' | 'warning' | 'success'}
                      text={<Text style={{ fontSize: 11 }}>{phaseInfo.text}</Text>}
                    />
                  </Flex>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(item.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                }
              />
            </List.Item>
          );
        }}
      />
    </Drawer>
  );
};

// ── 主组件 ────────────────────────────────────────────────

export const ConversationalWorkbench: React.FC = () => {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>('IDLE');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string>('思考中...');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sceneCardsRef = useRef<HTMLDivElement>(null);
  const newSessionBtnRef = useRef<HTMLButtonElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  const createSessionMutation = useCreateConversationSession();
  const sendMessageMutation = useSendConversationMessage();
  const { data: sessions = [], isLoading: isLoadingSessions } = useConversationSessions();
  const { data: historyData } = useConversationMessages(sessionId);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 切换会话时恢复历史消息
  useEffect(() => {
    if (historyData && historyData.messages.length > 0 && messages.length === 0) {
      setPhase(historyData.phase);
      const restored = historyData.messages.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      setMessages(restored);
    }
  }, [historyData, messages.length]);

  // 创建会话
  const handleCreateSession = useCallback(async () => {
    try {
      const result = await createSessionMutation.mutateAsync();
      setSessionId(result.sessionId);
      setPhase('IDLE');
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          blocks: [
            {
              type: 'text',
              content:
                '👋 你好！我是粮贸智能助手。\n\n' +
                '请从下方选择一个分析场景，或直接描述你想做什么分析。',
            },
          ],
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('创建会话失败', error);
    }
  }, [createSessionMutation]);

  // 切换到已有会话
  const handleSwitchSession = useCallback((targetSessionId: string) => {
    setSessionId(targetSessionId);
    setMessages([]); // 清空以触发历史加载
  }, []);

  // 场景卡片快捷选择（自动创建会话 + 发送）
  const handleSceneSelect = useCallback(async (prompt: string) => {
    try {
      const result = await createSessionMutation.mutateAsync();
      setSessionId(result.sessionId);
      setPhase('IDLE');
      setMessages([]);

      setTimeout(async () => {
        setIsSending(true);
        setThinkingStatus('正在分析你的意图...');
        const userMsg: DisplayMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          blocks: [{ type: 'text', content: prompt }],
          timestamp: new Date(),
        };
        setMessages([userMsg]);

        try {
          const response = await sendMessageWithSSE(
            result.sessionId,
            prompt,
            {
              onThinking: (status) => setThinkingStatus(status),
              onPhaseUpdate: (p) => setPhase(p),
              onError: (msg) => {
                setMessages((prev) => [...prev, {
                  id: `error-${Date.now()}`,
                  role: 'assistant' as const,
                  blocks: [{ type: 'text' as const, content: `⚠️ ${msg}` }],
                  timestamp: new Date(),
                }]);
              },
            },
          );
          if (response) {
            setPhase(response.phase);
            const assistantMsg: DisplayMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              blocks: response.messages,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
        } catch (error) {
          setMessages((prev) => [...prev, {
            id: `error-${Date.now()}`,
            role: 'assistant' as const,
            blocks: [{ type: 'text' as const, content: `⚠️ 发送失败: ${error instanceof Error ? error.message : '网络错误'}` }],
            timestamp: new Date(),
          }]);
        } finally {
          setIsSending(false);
        }
      }, 100);
    } catch (error) {
      console.error('创建会话失败', error);
    }
  }, [createSessionMutation]);

  // 发送消息（使用 SSE）
  const handleSend = useCallback(
    async (messageOverride?: string) => {
      const text = (messageOverride || inputValue).trim();
      if (!text || !sessionId || isSending) return;

      setInputValue('');
      setIsSending(true);
      setThinkingStatus('正在分析你的意图...');

      const userMsg: DisplayMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        blocks: [{ type: 'text', content: text }],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const response = await sendMessageWithSSE(
          sessionId,
          text,
          {
            onThinking: (status) => setThinkingStatus(status),
            onPhaseUpdate: (p) => setPhase(p),
            onError: (msg) => {
              setMessages((prev) => [...prev, {
                id: `error-${Date.now()}`,
                role: 'assistant' as const,
                blocks: [{ type: 'text' as const, content: `⚠️ ${msg}` }],
                timestamp: new Date(),
              }]);
            },
          },
        );
        if (response) {
          setPhase(response.phase);
          const assistantMsg: DisplayMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            blocks: response.messages,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch (error) {
        setMessages((prev) => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant' as const,
          blocks: [{ type: 'text' as const, content: `⚠️ 发送失败: ${error instanceof Error ? error.message : '网络错误'}` }],
          timestamp: new Date(),
        }]);
      } finally {
        setIsSending(false);
      }
    },
    [inputValue, sessionId, isSending],
  );

  const handleOptionClick = useCallback((option: string) => { handleSend(option); }, [handleSend]);
  const handleNavigate = useCallback((path: string) => { navigate(path); }, [navigate]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    },
    [handleSend],
  );

  const phaseInfo = PHASE_LABELS[phase] || { text: phase, color: 'default' };

  // ── Tour 新手引导 ───────────────────────────────────────
  const tourSteps: TourProps['steps'] = [
    {
      title: '选择分析场景',
      description: '点击卡片即可快速启动对应的智能分析工作流。',
      target: () => sceneCardsRef.current!,
    },
    {
      title: '自由对话',
      description: '也可以直接描述你的需求，AI 会帮你匹配最合适的分析流程。',
      target: () => newSessionBtnRef.current!,
    },
    {
      title: '历史记录',
      description: '之前的分析会话都会保存在这里，随时可以回顾。',
      target: null,
    },
  ];

  // 首次访问检测
  useEffect(() => {
    const visited = localStorage.getItem('ctbms_conv_tour_done');
    if (!visited && !sessionId) {
      setIsTourOpen(true);
    }
  }, [sessionId]);

  const handleTourClose = useCallback(() => {
    setIsTourOpen(false);
    localStorage.setItem('ctbms_conv_tour_done', '1');
  }, []);

  // ── 欢迎页（未创建会话） ────────────────────────────────

  if (!sessionId) {
    return (
      <Flex vertical style={{ height: '100%', overflowY: 'auto' }}>
        <Flex
          align="center"
          justify="space-between"
          style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgElevated }}
        >
          <Space>
            <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
            <Title level={5} style={{ margin: 0 }}>智能工作流助手</Title>
          </Space>
          {sessions.length > 0 && (
            <Button size="small" icon={<HistoryOutlined />} onClick={() => setIsHistoryOpen(true)}>
              历史会话 ({sessions.length})
            </Button>
          )}
        </Flex>

        <Flex vertical align="center" style={{ padding: '40px 24px', flex: 1 }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: token.colorPrimary, marginBottom: 16 }} />
          <Title level={4} style={{ marginBottom: 8 }}>选择一个分析场景</Title>
          <Paragraph type="secondary" style={{ marginBottom: 32, textAlign: 'center' }}>
            点击下方卡片快速开始，或
            <Button ref={newSessionBtnRef} type="link" style={{ padding: '0 4px' }} onClick={handleCreateSession}>
              开始自由对话
            </Button>
          </Paragraph>
          <div ref={sceneCardsRef}>
            <SceneQuickCards onSelect={handleSceneSelect} />
          </div>
        </Flex>

        <SessionDrawer
          open={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          sessions={sessions}
          isLoading={isLoadingSessions}
          currentSessionId={sessionId}
          onSelect={handleSwitchSession}
        />

        <Tour open={isTourOpen} onClose={handleTourClose} steps={tourSteps} />
      </Flex>
    );
  }

  // ── 对话界面 ────────────────────────────────────────────

  return (
    <Flex vertical style={{ height: '100%' }}>
      {/* 头部 */}
      <Flex
        align="center"
        justify="space-between"
        style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgElevated }}
      >
        <Space>
          <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
          <Title level={5} style={{ margin: 0 }}>智能工作流助手</Title>
          <Badge
            status={phaseInfo.color as 'default' | 'processing' | 'warning' | 'success' | 'error'}
            text={phaseInfo.text}
          />
        </Space>
        <Space>
          <Tooltip title="历史会话">
            <Button size="small" icon={<HistoryOutlined />} onClick={() => setIsHistoryOpen(true)} />
          </Tooltip>
          <Button size="small" icon={<PlusOutlined />} onClick={handleCreateSession}>
            新会话
          </Button>
        </Space>
      </Flex>

      {/* 消息列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messages.length === 0 && <Empty description="加载中..." style={{ marginTop: 80 }} />}

        {messages.map((msg) => (
          <Flex
            key={msg.id}
            justify={msg.role === 'user' ? 'flex-end' : 'flex-start'}
            style={{ marginBottom: 16 }}
          >
            {msg.role === 'assistant' && (
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 10, flexShrink: 0,
              }}>
                <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
              </div>
            )}

            <div style={{
              maxWidth: screens.md ? '75%' : '85%',
              padding: '10px 14px',
              borderRadius: token.borderRadiusLG,
              background: msg.role === 'user' ? token.colorPrimary : token.colorBgElevated,
              color: msg.role === 'user' ? '#fff' : token.colorText,
              boxShadow: token.boxShadowTertiary,
            }}>
              {msg.blocks.map((block, idx) => (
                <RichMessageRenderer
                  key={idx}
                  block={block}
                  onOptionClick={handleOptionClick}
                  onNavigate={handleNavigate}
                />
              ))}
              <Text
                type="secondary"
                style={{
                  fontSize: 11, display: 'block', textAlign: 'right', marginTop: 4,
                  color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : undefined,
                }}
              >
                {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </div>

            {msg.role === 'user' && (
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: token.colorBgTextHover,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: 10, flexShrink: 0,
              }}>
                <UserOutlined style={{ color: token.colorTextSecondary, fontSize: 16 }} />
              </div>
            )}
          </Flex>
        ))}

        {isSending && (
          <Flex style={{ marginBottom: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginRight: 10, flexShrink: 0,
            }}>
              <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <Card size="small" style={{ background: token.colorBgElevated }}>
              <Space>
                <LoadingOutlined spin style={{ color: token.colorPrimary }} />
                <Text type="secondary">{thinkingStatus}</Text>
              </Space>
            </Card>
          </Flex>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <Flex
        gap={8}
        align="flex-end"
        style={{ padding: '12px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgElevated }}
      >
        <TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想做什么分析...（Enter 发送，Shift+Enter 换行）"
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={isSending}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleSend()}
          loading={isSending}
          disabled={!inputValue.trim()}
        >
          发送
        </Button>
      </Flex>

      <SessionDrawer
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        isLoading={isLoadingSessions}
        currentSessionId={sessionId}
        onSelect={handleSwitchSession}
      />
    </Flex>
  );
};
