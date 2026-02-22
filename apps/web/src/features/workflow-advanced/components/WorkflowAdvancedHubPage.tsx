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

type AdvancedTabKey =
  | 'agents'
  | 'prompts'
  | 'rules'
  | 'parameters'
  | 'connectors'
  | 'triggers'
  | 'templates'
  | 'bindings'
  | 'analytics'
  | 'exports'
  | 'replay'
  | 'futures';

const ADVANCED_TAB_KEYS: AdvancedTabKey[] = [
  'agents',
  'prompts',
  'rules',
  'parameters',
  'connectors',
  'triggers',
  'templates',
  'bindings',
  'analytics',
  'exports',
  'replay',
  'futures',
];

const isAdvancedTabKey = (value: string | null): value is AdvancedTabKey =>
  Boolean(value && ADVANCED_TAB_KEYS.includes(value as AdvancedTabKey));

const renderAdvancedTab = (key: AdvancedTabKey): React.ReactNode => {
  switch (key) {
    case 'agents':
      return <AgentProfilePage />;
    case 'prompts':
      return <AgentPromptTemplatePage />;
    case 'rules':
      return <DecisionRulePackPage />;
    case 'parameters':
      return <ParameterSetPage />;
    case 'connectors':
      return <DataConnectorPage />;
    case 'triggers':
      return <TriggerGatewayPage />;
    case 'templates':
      return <TemplateMarketPage />;
    case 'bindings':
      return <UserConfigBindingPage />;
    case 'analytics':
      return <ExecutionAnalyticsDashboard />;
    case 'exports':
      return <ReportExportPage />;
    case 'replay':
      return <ReplayEvaluationPage />;
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
      { key: 'agents', label: 'Agent配置' },
      { key: 'prompts', label: 'Prompt模板' },
      { key: 'rules', label: '规则配置' },
      { key: 'parameters', label: '参数配置' },
      { key: 'connectors', label: '连接器配置' },
      { key: 'triggers', label: '触发配置' },
      { key: 'templates', label: '模板市场' },
      { key: 'bindings', label: '配置绑定' },
      { key: 'analytics', label: '执行分析' },
      { key: 'exports', label: '报告导出' },
      { key: 'replay', label: '回放评估' },
      { key: 'futures', label: '期货模拟' },
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
            高级配置中心
          </Title>
          <Text type="secondary">低频能力集中管理，减少侧栏层级与切换成本。</Text>
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
