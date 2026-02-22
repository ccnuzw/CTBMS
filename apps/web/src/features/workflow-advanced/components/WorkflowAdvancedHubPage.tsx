import React, { useMemo } from 'react';
import { Card, Space, Tabs, Typography } from 'antd';
import type { TabsProps } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { AgentProfilePage, AgentPromptTemplatePage } from '../../workflow-agent-center';
import { DecisionRulePackPage } from '../../workflow-rule-center';
import { ParameterSetPage } from '../../workflow-parameter-center';
import { DataConnectorPage } from '../../workflow-data-connector';
import { TriggerGatewayPage } from '../../trigger-gateway';
import { TemplateMarketPage } from '../../template-market';
import { UserConfigBindingPage } from '../../user-config-binding';
import { ExecutionAnalyticsDashboard } from '../../execution-analytics';
import { ReportExportPage } from '../../report-export';
import { ReplayEvaluationPage } from '../../replay-evaluation';
import { FuturesSimPage } from '../../futures-sim';

const { Title, Text } = Typography;

// ── 合并后的 6 个 Tab ──────────────────────────────────────────
// 1. agents      → 智能体管理（含 Agent 配置 + 指令模板）
// 2. rules       → 规则与参数（含 规则配置 + 参数配置）
// 3. connectors  → 数据连接（含 连接器配置 + 自动触发）
// 4. templates   → 模板市场（含 模板市场 + 应用绑定）
// 5. analytics   → 运行分析（含 运行分析 + 效果回溯 + 报告导出）
// 6. futures     → 模拟沙盘

type AdvancedTabKey =
  | 'agents'
  | 'rules'
  | 'connectors'
  | 'templates'
  | 'analytics'
  | 'futures';

const ADVANCED_TAB_KEYS: AdvancedTabKey[] = [
  'agents',
  'rules',
  'connectors',
  'templates',
  'analytics',
  'futures',
];

const isAdvancedTabKey = (value: string | null): value is AdvancedTabKey =>
  Boolean(value && ADVANCED_TAB_KEYS.includes(value as AdvancedTabKey));

const renderAdvancedTab = (key: AdvancedTabKey): React.ReactNode => {
  switch (key) {
    case 'agents':
      return (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <AgentProfilePage />
          <AgentPromptTemplatePage />
        </Space>
      );
    case 'rules':
      return (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <DecisionRulePackPage />
          <ParameterSetPage />
        </Space>
      );
    case 'connectors':
      return (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <DataConnectorPage />
          <TriggerGatewayPage />
        </Space>
      );
    case 'templates':
      return (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <TemplateMarketPage />
          <UserConfigBindingPage />
        </Space>
      );
    case 'analytics':
      return (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <ExecutionAnalyticsDashboard />
          <ReplayEvaluationPage />
          <ReportExportPage />
        </Space>
      );
    case 'futures':
      return <FuturesSimPage />;
    default:
      return null;
  }
};

export const WorkflowAdvancedHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: AdvancedTabKey = isAdvancedTabKey(tabParam) ? tabParam : 'agents';

  const tabItems = useMemo<TabsProps['items']>(
    () => [
      { key: 'agents', label: '智能体管理' },
      { key: 'rules', label: '规则与参数' },
      { key: 'connectors', label: '数据连接' },
      { key: 'templates', label: '模板市场' },
      { key: 'analytics', label: '运行分析' },
      { key: 'futures', label: '模拟沙盘' },
    ],
    [],
  );

  const handleTabChange = (key: string) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'agents') {
      next.delete('tab');
    } else {
      next.set('tab', key);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={4}>
          <Title level={4} style={{ margin: 0 }}>
            高级管理
          </Title>
          <Text type="secondary">管理员专区 · 管理智能体、规则、数据连接等底层能力</Text>
        </Space>
      </Card>

      <Tabs
        type="card"
        size="small"
        activeKey={activeTab}
        items={tabItems}
        onChange={handleTabChange}
      />

      {renderAdvancedTab(activeTab)}
    </Space>
  );
};
