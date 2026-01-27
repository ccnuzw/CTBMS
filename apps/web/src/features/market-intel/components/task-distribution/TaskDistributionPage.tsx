import React, { useState } from 'react';
import { Popover, Button } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { PageContainer, ProCard } from '@ant-design/pro-components';
import { TaskCalendarView } from './components/TaskCalendarView';
import { TaskList } from './components/TaskList';
import { TaskTemplateList } from './components/TaskTemplateList';
import { MyTaskBoard } from './components/MyTaskBoard';

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
                    tab: '任务管理',
                    key: 'list',
                },
                {
                    tab: '任务模板',
                    key: 'templates',
                },
                {
                    tab: '我的任务',
                    key: 'my-tasks',
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
                            创建任务 = 一次性任务；任务模板 = 周期任务规则。
                            <br />
                            模板不直接生成任务，需要等待自动调度或手动分发。
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
                {activeTab === 'list' && <TaskList />}
                {activeTab === 'templates' && <TaskTemplateList />}
                {activeTab === 'my-tasks' && <MyTaskBoard />}
            </ProCard>
        </PageContainer>
    );
};
