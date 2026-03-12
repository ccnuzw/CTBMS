import React from 'react';
import { Tabs, Space, Typography, theme, Flex } from 'antd';
import {
    TeamOutlined,
    FormOutlined,
    AppstoreOutlined,
    SettingOutlined,
    SafetyCertificateOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { AgentProfilePage, AgentPromptTemplatePage, SkillDashboardPage } from '../../workflow-agent-center';
import { TriggerGatewayPage } from '../../trigger-gateway';
import { ParameterSetPage } from '../../workflow-parameter-center';
import { DecisionRulePackPage } from '../../workflow-rule-center';
import { WorkflowUxModeSwitcher } from '../../../components/WorkflowUxModeSwitcher';
import { useWorkflowUxMode } from '../../../hooks/useWorkflowUxMode';

const { Title, Paragraph } = Typography;

interface TabDef {
    key: string;
    label: React.ReactNode;
    children: React.ReactNode;
    /** 'simple' | 'standard' | 'expert' — 最低显示级别 */
    minMode: 'simple' | 'standard' | 'expert';
}

const ALL_TABS: TabDef[] = [
    {
        key: 'agents',
        label: (
            <Space>
                <TeamOutlined />
                智能体
            </Space>
        ),
        children: <AgentProfilePage />,
        minMode: 'simple',
    },
    {
        key: 'params',
        label: (
            <Space>
                <SettingOutlined />
                参数配置
            </Space>
        ),
        children: <ParameterSetPage />,
        minMode: 'simple',
    },
    {
        key: 'rules',
        label: (
            <Space>
                <SafetyCertificateOutlined />
                规则配置
            </Space>
        ),
        children: <DecisionRulePackPage />,
        minMode: 'simple',
    },
    {
        key: 'prompts',
        label: (
            <Space>
                <FormOutlined />
                提示词
            </Space>
        ),
        children: <AgentPromptTemplatePage />,
        minMode: 'standard',
    },
    {
        key: 'skills',
        label: (
            <Space>
                <AppstoreOutlined />
                技能
            </Space>
        ),
        children: <SkillDashboardPage />,
        minMode: 'standard',
    },
    {
        key: 'triggers',
        label: (
            <Space>
                <ThunderboltOutlined />
                自动触发
            </Space>
        ),
        children: <TriggerGatewayPage />,
        minMode: 'expert',
    },
];

const MODE_LEVEL: Record<string, number> = { simple: 0, standard: 1, expert: 2 };

/**
 * 配置管理
 *
 * 收敛后 Tab：
 * - Simple:   智能体 | 参数配置 | 规则配置
 * - Standard: + 提示词 | 技能
 * - Expert:   + 自动触发
 *
 * 已移除：模板市场（→工作流管理页）、报告导出（→运营中心）、用户绑定、期货模拟
 */
export const WorkflowConfigPage: React.FC = () => {
    const { token } = theme.useToken();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'agents';
    const uxMode = useWorkflowUxMode((s) => s.mode);

    const visibleTabs = ALL_TABS.filter(
        (tab) => MODE_LEVEL[uxMode] >= MODE_LEVEL[tab.minMode],
    );

    const resolvedTab = visibleTabs.some((t) => t.key === activeTab)
        ? activeTab
        : visibleTabs[0]?.key ?? 'agents';

    const handleTabChange = (key: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', key);
        setSearchParams(next, { replace: true });
    };

    return (
        <div>
            <Flex justify="space-between" align="flex-start" style={{ marginBottom: token.marginMD }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        配置管理
                    </Title>
                    <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                        管理智能体、参数、规则和工作流工具
                    </Paragraph>
                </div>
                <WorkflowUxModeSwitcher />
            </Flex>
            <Tabs
                activeKey={resolvedTab}
                onChange={handleTabChange}
                type="card"
                size="large"
                destroyInactiveTabPane
                items={visibleTabs.map(({ key, label, children }) => ({
                    key,
                    label,
                    children,
                }))}
            />
        </div>
    );
};
