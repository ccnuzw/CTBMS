import React, { useState } from 'react';
import { Tabs, Space, Card } from 'antd';
import { SettingOutlined, TeamOutlined } from '@ant-design/icons';
import { CollectionPointManager } from './CollectionPointManager';
import { CollectionPointAllocationCenter } from './CollectionPointAllocationCenter';

/**
 * 采集点配置中心
 * 整合采集点管理和人员分配功能
 */
export const CollectionPointConfigCenter: React.FC = () => {
    const [activeTab, setActiveTab] = useState('points');

    const items = [
        {
            key: 'points',
            label: (
                <Space>
                    <SettingOutlined />
                    <span>采集点配置</span>
                </Space>
            ),
            children: <CollectionPointManager />,
        },
        {
            key: 'allocation',
            label: (
                <Space>
                    <TeamOutlined />
                    <span>人员分配</span>
                </Space>
            ),
            children: (
                <div style={{ padding: 24 }}>
                    <CollectionPointAllocationCenter defaultMode="BY_USER" />
                </div>
            ),
        },
    ];

    return (
        <Card bordered={false} bodyStyle={{ padding: 0 }}>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={items}
                type="card"
                size="large"
                tabBarStyle={{ marginBottom: 0, paddingLeft: 16, paddingTop: 16 }}
            />
        </Card>
    );
};

export default CollectionPointConfigCenter;

