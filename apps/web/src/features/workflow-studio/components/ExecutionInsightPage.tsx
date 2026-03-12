import React from 'react';
import { Tabs, Space, Typography, theme, Flex } from 'antd';
import {
    BarChartOutlined,
    PlayCircleOutlined,
    FileProtectOutlined,
    BookOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { ExecutionAnalyticsDashboard } from '../../execution-analytics';
import { ReplayEvaluationPage } from '../../replay-evaluation';
import { DecisionRecordPage } from '../../decision-record/components/DecisionRecordPage';
import { MetricDictionaryPanel } from '../../semantic-layer';
import { DataQualityDashboard } from '../../data-quality';
import { WorkflowUxModeSwitcher } from '../../../components/WorkflowUxModeSwitcher';

const { Title, Paragraph } = Typography;

/**
 * 分析报告（执行洞察）
 *
 * 合并 5 个分析视图：运营统计、历史回放、决策追踪、指标字典、数据质量
 */
export const ExecutionInsightPage: React.FC = () => {
    const { token } = theme.useToken();
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'analytics';

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
                        分析报告
                    </Title>
                    <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                        运营统计分析、历史回放评估、决策追踪、指标字典与数据质量
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
                        key: 'analytics',
                        label: (
                            <Space>
                                <BarChartOutlined />
                                运营统计
                            </Space>
                        ),
                        children: <ExecutionAnalyticsDashboard />,
                    },
                    {
                        key: 'replay',
                        label: (
                            <Space>
                                <PlayCircleOutlined />
                                历史回放
                            </Space>
                        ),
                        children: <ReplayEvaluationPage />,
                    },
                    {
                        key: 'decisions',
                        label: (
                            <Space>
                                <FileProtectOutlined />
                                决策追踪
                            </Space>
                        ),
                        children: <DecisionRecordPage />,
                    },
                    {
                        key: 'metrics',
                        label: (
                            <Space>
                                <BookOutlined />
                                指标字典
                            </Space>
                        ),
                        children: <MetricDictionaryPanel />,
                    },
                    {
                        key: 'quality',
                        label: (
                            <Space>
                                <CheckCircleOutlined />
                                数据质量
                            </Space>
                        ),
                        children: <DataQualityDashboard />,
                    },
                ]}
            />
        </div>
    );
};
