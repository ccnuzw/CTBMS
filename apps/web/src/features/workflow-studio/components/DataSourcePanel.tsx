import React, { useState } from 'react';
import { Tabs, Space } from 'antd';
import { ApiOutlined, DashboardOutlined, BookOutlined } from '@ant-design/icons';
import { DataConnectorPage } from '../../workflow-data-connector';
import { DataQualityDashboard } from '../../data-quality';
import { MetricDictionaryPanel } from '../../semantic-layer';

/**
 * 数据源综合面板
 *
 * 将连接器管理、数据质量、指标字典统一为一个面板（运营中心「数据源」Tab 使用）
 */
export const DataSourcePanel: React.FC = () => {
    const [activeKey, setActiveKey] = useState('connectors');

    return (
        <Tabs
            activeKey={activeKey}
            onChange={setActiveKey}
            size="small"
            destroyInactiveTabPane
            items={[
                {
                    key: 'connectors',
                    label: (
                        <Space size={4}>
                            <ApiOutlined />
                            连接器管理
                        </Space>
                    ),
                    children: <DataConnectorPage />,
                },
                {
                    key: 'quality',
                    label: (
                        <Space size={4}>
                            <DashboardOutlined />
                            数据质量
                        </Space>
                    ),
                    children: <DataQualityDashboard />,
                },
                {
                    key: 'metrics',
                    label: (
                        <Space size={4}>
                            <BookOutlined />
                            指标字典
                        </Space>
                    ),
                    children: <MetricDictionaryPanel />,
                },
            ]}
        />
    );
};
