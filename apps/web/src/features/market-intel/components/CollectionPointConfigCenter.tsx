import React, { useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { CollectionPointManager } from './CollectionPointManager';
import { CollectionPointAllocationCenter } from './CollectionPointAllocationCenter';

/**
 * 采集点配置中心
 * 整合采集点管理和人员分配功能
 */
export const CollectionPointConfigCenter: React.FC = () => {
    const [activeTab, setActiveTab] = useState('points');

    return (
        <PageContainer
            header={{ title: null, breadcrumb: undefined }}
            tabList={[
                {
                    tab: '采集点配置',
                    key: 'points',
                },
                {
                    tab: '人员分配',
                    key: 'allocation',
                },
            ]}
            tabActiveKey={activeTab}
            onTabChange={setActiveTab}
            tabProps={{
                size: 'large',
                tabBarStyle: {
                    marginBottom: 0,
                    paddingLeft: 8,
                },
            }}
            token={{
                paddingInlinePageContainerContent: 16,
                paddingBlockPageContainerContent: 12,
            }}
        >
            {activeTab === 'points' && <CollectionPointManager />}
            {activeTab === 'allocation' && (
                <CollectionPointAllocationCenter defaultMode="BY_USER" />
            )}
        </PageContainer>
    );
};

export default CollectionPointConfigCenter;
