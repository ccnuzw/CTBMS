import React from 'react';
import { Tabs, Space, Typography, theme } from 'antd';
import {
    PlayCircleOutlined,
    ApiOutlined,
    ControlOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { WorkflowExecutionPage } from '../../workflow-runtime';
import { DataConnectorPage } from '../../workflow-data-connector';
import { ParameterSetPage } from '../../workflow-parameter-center';
import { DecisionRulePackPage } from '../../workflow-rule-center';

const { Title, Paragraph } = Typography;

/**
 * 运营中心
 *
 * 合并 4 个运营面板为 Tabs：运行记录、数据连接器、参数中心、规则中心
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
            <div style={{ marginBottom: token.marginMD }}>
                <Title level={4} style={{ margin: 0 }}>
                    运营中心
                </Title>
                <Paragraph type="secondary" style={{ margin: 0, marginTop: 4 }}>
                    工作流运行记录、数据源、参数和业务规则管理
                </Paragraph>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                type="card"
                size="large"
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
                        children: <DataConnectorPage />,
                    },
                    {
                        key: 'parameters',
                        label: (
                            <Space>
                                <ControlOutlined />
                                参数配置
                            </Space>
                        ),
                        children: <ParameterSetPage />,
                    },
                    {
                        key: 'rules',
                        label: (
                            <Space>
                                <SafetyCertificateOutlined />
                                业务规则
                            </Space>
                        ),
                        children: <DecisionRulePackPage />,
                    },
                ]}
            />
        </div>
    );
};
