import React, { useState } from 'react';
import { Popover, Button } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { PageContainer, ProCard } from '@ant-design/pro-components';
import { TaskCalendarView } from './components/TaskCalendarView';
import { TaskTemplateList } from './components/TaskTemplateList';

export const TaskDistributionPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('calendar');

    return (
        <PageContainer
            header={{
                title: null,
                breadcrumb: undefined,
            }}
            tabList={[
                {
                    tab: '任务日历',
                    key: 'calendar',
                },
                {
                    tab: '任务模板',
                    key: 'templates',
                },
            ]}
            tabActiveKey={activeTab}
            onTabChange={setActiveTab}
            token={{
                paddingInlinePageContainerContent: 16,
                paddingBlockPageContainerContent: 16,
            }}
            tabBarExtraContent={
                <Popover
                    content={
                        <div style={{ maxWidth: 320 }}>
                            <strong>任务日历</strong>：可视化查看所有任务排期
                            <br />
                            <strong>任务模板</strong>：配置周期性任务（每日/每周/每月）
                            <br /><br />
                            模板激活后，系统将自动按周期生成任务分发给对应人员。
                        </div>
                    }
                    title="功能说明"
                >
                    <Button type="link" icon={<InfoCircleOutlined />}>
                        规则说明
                    </Button>
                </Popover>
            }
        >
            <ProCard
                direction="column"
                ghost
                gutter={[0, 16]}
                style={{ minHeight: '85vh', marginTop: -16 }}
            >
                {activeTab === 'calendar' && <TaskCalendarView />}
                {activeTab === 'templates' && <TaskTemplateList />}
            </ProCard>
        </PageContainer>
    );
};
