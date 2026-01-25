import React, { useState } from 'react';
import { Tabs, theme, Button, FloatButton } from 'antd';
import {
    CalendarOutlined,
    UnorderedListOutlined,
    AppstoreOutlined,
    FileTextOutlined,
    PlusOutlined
} from '@ant-design/icons';
import { TaskCalendarView } from './components/TaskCalendarView';
import { TaskList } from './components/TaskList';
import { TaskTemplateList } from './components/TaskTemplateList';
import { MyTaskBoard } from './components/MyTaskBoard';

import { CreateTaskModal } from './components/CreateTaskModal';

export const TaskDistributionPage: React.FC = () => {
    const { token } = theme.useToken();
    const [activeTab, setActiveTab] = useState('calendar');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleCreateTask = (values: any) => {
        console.log('Creating task:', values);
        setIsModalOpen(false);
        // TODO: Call API
    };

    const renderTabBarExtraContent = () => {
        return (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                创建任务
            </Button>
        );
    };

    const items = [
        {
            key: 'calendar',
            label: (<span><CalendarOutlined /> 任务日历</span>),
            children: <TaskCalendarView />,
        },
        {
            key: 'list',
            label: (<span><UnorderedListOutlined /> 任务管理</span>),
            children: <TaskList />,
        },
        {
            key: 'templates',
            label: (<span><AppstoreOutlined /> 任务模板</span>),
            children: <TaskTemplateList />,
        },
        {
            key: 'my-tasks',
            label: (<span><FileTextOutlined /> 我的任务</span>),
            children: <MyTaskBoard />,
        }
    ];

    return (
        <div style={{ height: '100%', padding: 24, background: token.colorBgLayout }}>
            <div style={{ background: token.colorBgContainer, padding: 24, borderRadius: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={items.map(item => ({ ...item, style: { height: '100%' } }))}
                    tabBarExtraContent={renderTabBarExtraContent()}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                />
            </div>
            <CreateTaskModal
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onCreate={handleCreateTask}
            />
        </div>
    );
};
