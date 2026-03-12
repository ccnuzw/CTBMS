import React from 'react';
import { Tabs, Space, Typography, theme, Flex } from 'antd';
import {
    PlayCircleOutlined,
    ApiOutlined,
    BarChartOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { WorkflowExecutionPage } from '../../workflow-runtime';
import { DataSourcePanel } from './DataSourcePanel';
import { ExecutionAnalyticsDashboard } from '../../execution-analytics';
import { ReportExportPage } from '../../report-export';
import { WorkflowUxModeSwitcher } from '../../../components/WorkflowUxModeSwitcher';

const { Title, Paragraph } = Typography;

/**
 * 运营中心
 *
 * 收敛后统一入口：运行记录、数据源、统计分析、报告导出
 * （参数/规则已归入「配置管理」，分析报告已合并至此）
 */
export const WorkflowHubPage: React.FC = () => {
    const { token } = theme.useToken();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'executions';

    const handleTabChange = (key: string) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', key);
        ['page', 'pageSize', 'status', 'format'].forEach((k) => next.delete(k));
        setSearchParams(next);
    };

    return (
        <div>
            <Flex justify="space-between" align="flex-start" style={{ marginBottom: token.marginMD }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        运营中心
                    </Title>
                    <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                        工作流运行记录、数据源管理、运营统计与报告导出
                    </Paragraph>
                </div>
                <WorkflowUxModeSwitcher />
            </Flex>
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                type="card"
                size="large"
                destroyInactiveTabPane
                items={[
                    {
                        key: 'executions',
                        label: (
                            <Space>
                                <PlayCircleOutlined />
                                运行记录
                            </Space>
                        ),
                        children: <WorkflowExecutionPage />,
                    },
                    {
                        key: 'connectors',
                        label: (
                            <Space>
                                <ApiOutlined />
                                数据源
                            </Space>
                        ),
                        children: <DataSourcePanel />,
                    },
                    {
                        key: 'analytics',
                        label: (
                            <Space>
                                <BarChartOutlined />
                                统计分析
                            </Space>
                        ),
                        children: <ExecutionAnalyticsDashboard />,
                    },
                    {
                        key: 'exports',
                        label: (
                            <Space>
                                <FileTextOutlined />
                                报告导出
                            </Space>
                        ),
                        children: <ReportExportPage />,
                    },
                ]}
            />
        </div>
    );
};
