import React, { useState } from 'react';
import { Tabs, Space, Typography, theme, Segmented } from 'antd';
import {
    TeamOutlined,
    FormOutlined,
    AppstoreOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { AgentProfilePage, AgentPromptTemplatePage, SkillDashboardPage } from '../../workflow-agent-center';
import { TriggerGatewayPage } from '../../trigger-gateway';
import { ReportExportPage } from '../../report-export';
import { TemplateMarketPage } from '../../template-market';
import { UserConfigBindingPage } from '../../user-config-binding';
import { FuturesSimPage } from '../../futures-sim';

const { Title, Paragraph } = Typography;

type ToolView = 'skills' | 'triggers' | 'exports' | 'templates' | 'bindings' | 'futures';

const TOOL_OPTIONS = [
    { label: '技能管理', value: 'skills' as ToolView },
    { label: '自动触发', value: 'triggers' as ToolView },
    { label: '报告导出', value: 'exports' as ToolView },
    { label: '模板市场', value: 'templates' as ToolView },
    { label: '用户绑定', value: 'bindings' as ToolView },
    { label: '期货模拟', value: 'futures' as ToolView },
];

const TOOL_VIEWS: Record<ToolView, React.ReactNode> = {
    skills: <SkillDashboardPage />,
    triggers: <TriggerGatewayPage />,
    exports: <ReportExportPage />,
    templates: <TemplateMarketPage />,
    bindings: <UserConfigBindingPage />,
    futures: <FuturesSimPage />,
};

/**
 * 配置管理
 *
 * 收敛后 3 个 Tab：智能体、提示词、技能与工具
 */
export const WorkflowConfigPage: React.FC = () => {
    const { token } = theme.useToken();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'agents';
    const [toolView, setToolView] = useState<ToolView>('skills');

    const handleTabChange = (key: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', key);
        setSearchParams(next, { replace: true });
    };

    return (
        <div>
            <div style={{ marginBottom: token.marginMD }}>
                <Title level={4} style={{ margin: 0 }}>
                    配置管理
                </Title>
                <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                    管理智能体、提示词和技能工具
                </Paragraph>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                type="card"
                size="large"
                destroyInactiveTabPane
                items={[
                    {
                        key: 'agents',
                        label: (
                            <Space>
                                <TeamOutlined />
                                智能体
                            </Space>
                        ),
                        children: <AgentProfilePage />,
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
                    },
                    {
                        key: 'tools',
                        label: (
                            <Space>
                                <AppstoreOutlined />
                                技能与工具
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                <Segmented
                                    options={TOOL_OPTIONS}
                                    value={toolView}
                                    onChange={(value) => setToolView(value as ToolView)}
                                />
                                {TOOL_VIEWS[toolView]}
                            </Space>
                        ),
                    },
                ]}
            />
        </div>
    );
};
