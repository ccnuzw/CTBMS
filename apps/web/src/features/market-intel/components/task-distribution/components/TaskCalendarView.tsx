import React from 'react';
import { Calendar, Badge, theme, Drawer } from 'antd';
import type { Dayjs } from 'dayjs';
import { useTasks } from '@/features/market-intel/api';
import { IntelTaskType, INTEL_TASK_TYPE_LABELS, IntelTaskStatus } from '@packages/types';

export const TaskCalendarView: React.FC = () => {
    const { token } = theme.useToken();

    // TODO: Fetch tasks for the current month range
    // const { data: tasks } = useTasks({ startDate: ..., endDate: ... });
    const tasks = []; // Placeholder

    const getListData = (value: Dayjs) => {
        // Filter tasks by date (simple implementation)
        // In real app, we should use a map for O(1) lookup
        return [
            { type: 'warning', content: '市场日报 (待)' },
            { type: 'success', content: '周报 (完)' },
        ];
    };

    const cellRender = (value: Dayjs, info: any) => {
        if (info.type === 'date') {
            const listData = getListData(value);
            return (
                <ul style={{ padding: 0, listStyle: 'none' }}>
                    {listData.map((item, index) => (
                        <li key={index}>
                            <Badge status={item.type as any} text={item.content} />
                        </li>
                    ))}
                </ul>
            );
        }
        return info.originNode;
    };

    return (
        <div style={{ height: '100%', overflow: 'auto' }}>
            <Calendar cellRender={cellRender} />
        </div>
    );
};
