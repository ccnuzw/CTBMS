import React from 'react';
import { Tabs, Space, Typography, theme } from 'antd';
import {
    BarChartOutlined,
    PlayCircleOutlined,
    FileProtectOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { ExecutionAnalyticsDashboard } from '../../execution-analytics';
import { ReplayEvaluationPage } from '../../replay-evaluation';
import { DecisionRecordPage } from '../../decision-record/components/DecisionRecordPage';

const { Title, Paragraph } = Typography;

/**
 * 执行洞察
 *
 * 合并 3 个分析视图：执行统计、回放评估、决策记录
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
            <div style={{ marginBottom: token.marginMD }}>
                <Title level={4} style={{ margin: 0 }}>
                    分析报告
                </Title>
                <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                    运营统计分析、历史回放评估与决策追踪
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
                ]}
            />
        </div>
    );
};
