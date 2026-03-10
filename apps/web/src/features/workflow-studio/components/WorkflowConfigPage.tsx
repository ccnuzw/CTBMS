import React from 'react';
import { Tabs, Space, Typography, theme, Card } from 'antd';
import {
    TeamOutlined,
    FormOutlined,
    ExperimentOutlined,
    RocketOutlined,
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

/**
 * 工作流配置管理页面
 *
 * 将分散的配置页面统一为 Tabs：
 *   - Agent 配置 (原 /workflow/agents)
 *   - 提示词模板 (原 /workflow/prompts)
 *   - 技能管理 (原 /workflow/skills)
 *   - 触发器 (原 /workflow/triggers)
 *   - 更多工具 (导出/模板/绑定/期货)
 */
export const WorkflowConfigPage: React.FC = () => {
    const { token } = theme.useToken();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'agents';

    const handleTabChange = (key: string) => {
        const next = new URLSearchParams();
        next.set('tab', key);
        setSearchParams(next);
    };

    return (
        <div>
            <div style={{ marginBottom: token.marginMD }}>
                <Title level={4} style={{ margin: 0 }}>
                    配置管理
                </Title>
                <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                    管理智能体角色、提示词模板、技能工具和触发规则
                </Paragraph>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                type="card"
                size="large"
                items={[
                    {
                        key: 'agents',
                        label: (
                            <Space>
                                <TeamOutlined />
                                智能体配置
                            </Space>
                        ),
                        children: <AgentProfilePage />,
                    },
                    {
                        key: 'prompts',
                        label: (
                            <Space>
                                <FormOutlined />
                                提示词模板
                            </Space>
                        ),
                        children: <AgentPromptTemplatePage />,
                    },
                    {
                        key: 'skills',
                        label: (
                            <Space>
                                <ExperimentOutlined />
                                技能管理
                            </Space>
                        ),
                        children: <SkillDashboardPage />,
                    },
                    {
                        key: 'triggers',
                        label: (
                            <Space>
                                <RocketOutlined />
                                触发器
                            </Space>
                        ),
                        children: <TriggerGatewayPage />,
                    },
                    {
                        key: 'tools',
                        label: (
                            <Space>
                                <AppstoreOutlined />
                                更多工具
                            </Space>
                        ),
                        children: (
                            <Tabs
                                type="line"
                                size="small"
                                items={[
                                    { key: 'exports', label: '报告导出', children: <ReportExportPage /> },
                                    { key: 'templates', label: '模板市场', children: <TemplateMarketPage /> },
                                    { key: 'bindings', label: '用户绑定', children: <UserConfigBindingPage /> },
                                    { key: 'futures', label: '期货模拟', children: <FuturesSimPage /> },
                                ]}
                            />
                        ),
                    },
                ]}
            />
        </div>
    );
};
