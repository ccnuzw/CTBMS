import React from 'react';
import { Space } from 'antd';
import { useTaskCalendarViewModel } from './task-calendar/useTaskCalendarViewModel';
import { TaskCalendarFilterBar } from './task-calendar/TaskCalendarFilterBar';
import { TaskCalendarAdvancedDrawer } from './task-calendar/TaskCalendarAdvancedDrawer';
import { TaskCalendarMainContent } from './task-calendar/TaskCalendarMainContent';
import { TaskCalendarDayDetailDrawer } from './task-calendar/TaskCalendarDayDetailDrawer';

export const TaskCalendarView: React.FC = () => {
    const viewModel = useTaskCalendarViewModel();

    return (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <TaskCalendarFilterBar viewModel={viewModel} />
            <TaskCalendarAdvancedDrawer viewModel={viewModel} />
            <TaskCalendarMainContent viewModel={viewModel} />
            <TaskCalendarDayDetailDrawer viewModel={viewModel} />
        </Space>
    );
};
