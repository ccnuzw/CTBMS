import React from 'react';
import { Drawer, Space, Button, Typography, Tag, Segmented, Select, Divider, Checkbox, Spin, Empty, List, Descriptions, theme } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import VirtualList from 'rc-virtual-list';
import { IntelTaskStatus, IntelTaskType, IntelTaskPriority, INTEL_TASK_PRIORITY_LABELS, INTEL_TASK_TYPE_LABELS } from '@packages/types';
import { INTEL_TASK_STATUS_LABELS } from '@/constants';
import { useTaskCalendarViewModel } from './useTaskCalendarViewModel';
import { PRIORITY_COLOR_MAP, PENDING_STATUSES, DEFAULT_DAY_PAGE_SIZE } from './constants';

const { Text, Link } = Typography;

interface Props {
    viewModel: ReturnType<typeof useTaskCalendarViewModel>;
}

export const TaskCalendarDayDetailDrawer: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const {
        state: { drawerOpen, isWideDrawer, selectedDate, drawerFilter, drawerSort, drawerGroup, selectedTaskIds, dayPageSize },
        refs: { taskDrawerContainerRef, taskDrawerFocusRef, taskDrawerProps },
        actions: { closeTaskDrawer, handleFocusDate, setDrawerFilter, setDrawerSort, setDrawerGroup, setSelectedTaskIds, setSelectedTaskId, handleBatchComplete, setDayPageSize },
        queries: { dayTasksLoading, daySummaryCounts, completeMutation, selectedDateTasks },
        computed: { drawerCounts, sortedDrawerTasks, groupedDrawerTasks, selectableTaskIds, selectedTask, totalDayTasks, loadedRealTasks }
    } = viewModel;

    const renderTaskItem = (item: any) => {
        const isPreview = item.isPreview;
        const isCompleted = item.status === IntelTaskStatus.COMPLETED;
        const isSelected = selectedTaskIds.includes(item.id);
        const isActive = viewModel.state.selectedTaskId === item.id;
        const dueTime = dayjs(item.dueAt || item.deadline).format('HH:mm');

        return (
            <List.Item
                key={item.id}
                style={{ cursor: 'pointer', borderRadius: 8, padding: '8px 12px', background: isActive ? token.colorFillSecondary : undefined }}
                onClick={() => setSelectedTaskId(item.id)}
                actions={[
                    <Button key="complete" type="link" disabled={isCompleted || isPreview} onClick={(e) => { e.stopPropagation(); completeMutation.mutate({ id: item.id }); }}>完成</Button>
                ]}
            >
                <List.Item.Meta
                    title={
                        <Space>
                            <Checkbox disabled={isCompleted || isPreview} checked={isSelected} onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.checked) setSelectedTaskIds(Array.from(new Set([...selectedTaskIds, item.id])));
                                else setSelectedTaskIds(selectedTaskIds.filter(id => id !== item.id));
                            }} />
                            <Text delete={isCompleted}>{item.title}</Text>
                            <Tag>{INTEL_TASK_TYPE_LABELS[item.type as IntelTaskType]}</Tag>
                            {item.priority && <Tag color={PRIORITY_COLOR_MAP.get(item.priority as IntelTaskPriority)}>{INTEL_TASK_PRIORITY_LABELS[item.priority as IntelTaskPriority]}</Tag>}
                            {INTEL_TASK_STATUS_LABELS[(item.status as IntelTaskStatus)] && <Tag>{INTEL_TASK_STATUS_LABELS[item.status as IntelTaskStatus]}</Tag>}
                            {isPreview && <Tag color="cyan">预览</Tag>}
                        </Space>
                    }
                    description={
                        <Space direction="vertical" size={0}>
                            <Text type="secondary" style={{ fontSize: 12 }}>负责人: {item.assignee?.name || '未分配'}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>截止: {dueTime}</Text>
                        </Space>
                    }
                />
            </List.Item>
        );
    };

    const selectedTaskDetails = selectedTask as any;

    const renderTaskDetail = () => {
        if (!selectedTask) return <Empty description="请选择任务查看详情" />;
        return (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Text strong>{selectedTask.title}</Text>
                <Space wrap>
                    <Tag>{INTEL_TASK_TYPE_LABELS[selectedTask.type as IntelTaskType]}</Tag>
                    {selectedTask.priority && <Tag color={PRIORITY_COLOR_MAP.get(selectedTask.priority as IntelTaskPriority)}>{INTEL_TASK_PRIORITY_LABELS[selectedTask.priority as IntelTaskPriority]}</Tag>}
                    {INTEL_TASK_STATUS_LABELS[(selectedTask.status as IntelTaskStatus)] && <Tag>{INTEL_TASK_STATUS_LABELS[selectedTask.status as IntelTaskStatus]}</Tag>}
                    {(selectedTask as any).isPreview && <Tag color="cyan">预览</Tag>}
                </Space>
                <Descriptions column={1} size="small" bordered={false}>
                    <Descriptions.Item label="负责人">{selectedTask.assignee?.name || '未分配'}</Descriptions.Item>
                    <Descriptions.Item label="截止时间">{dayjs(selectedTask.dueAt || selectedTask.deadline).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                    <Descriptions.Item label="任务ID">{selectedTask.id}</Descriptions.Item>
                </Descriptions>
                {selectedTaskDetails?.description && <div><Text type="secondary">任务描述</Text><div>{selectedTaskDetails.description}</div></div>}
                {selectedTaskDetails?.requirements && <div><Text type="secondary">任务要求</Text><div>{selectedTaskDetails.requirements}</div></div>}
                {selectedTaskDetails?.attachmentUrls?.length > 0 && (
                    <div>
                        <Text type="secondary">附件</Text>
                        <Space direction="vertical" size={4}>
                            {selectedTaskDetails.attachmentUrls.map((url: string) => <Link key={url} href={url} target="_blank" rel="noreferrer">{url}</Link>)}
                        </Space>
                    </div>
                )}
                <Space>
                    <Button type="primary" disabled={(selectedTask as any).isPreview || selectedTask.status === IntelTaskStatus.COMPLETED} onClick={() => completeMutation.mutate({ id: selectedTask.id })}>标记完成</Button>
                    <Button onClick={() => setSelectedTaskId(null)}>取消选中</Button>
                </Space>
            </Space>
        );
    };

    return (
        <Drawer
            title={selectedDate ? `${selectedDate.format('MM月DD日')} 任务工作台` : '任务工作台'}
            placement="right"
            width={isWideDrawer ? 860 : '100%'}
            onClose={closeTaskDrawer}
            open={drawerOpen}
            afterOpenChange={taskDrawerProps.afterOpenChange}
        >
            <div ref={taskDrawerContainerRef}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Space wrap>
                            <Button ref={taskDrawerFocusRef as any} icon={<LeftOutlined />} disabled={!selectedDate} onClick={() => selectedDate && handleFocusDate(selectedDate.subtract(1, 'day'), false)}>前一天</Button>
                            <Button icon={<RightOutlined />} disabled={!selectedDate} onClick={() => selectedDate && handleFocusDate(selectedDate.add(1, 'day'), false)}>后一天</Button>
                            <Button onClick={() => handleFocusDate(dayjs(), false)}>今天</Button>
                        </Space>
                        {selectedDate && <Text type="secondary">{selectedDate.format('YYYY-MM-DD')}</Text>}
                    </Space>

                    {daySummaryCounts && (
                        <Space wrap size={[6, 6]}>
                            <Tag>总数 {daySummaryCounts.total}</Tag>
                            <Tag color="green">完成 {daySummaryCounts.completed}</Tag>
                            <Tag color="gold">待完成 {daySummaryCounts.pending}</Tag>
                            <Tag color="red">逾期 {daySummaryCounts.overdue}</Tag>
                            <Tag color="orange">紧急 {daySummaryCounts.urgent}</Tag>
                            {daySummaryCounts.preview ? <Tag color="cyan">预览 {daySummaryCounts.preview}</Tag> : null}
                        </Space>
                    )}

                    <Segmented
                        value={drawerFilter}
                        onChange={(value) => setDrawerFilter(value as any)}
                        options={[
                            { label: <Space size={4}><span>全部</span><Tag>{drawerCounts.all}</Tag></Space>, value: 'ALL' },
                            { label: <Space size={4}><span>待办</span><Tag>{drawerCounts.pending}</Tag></Space>, value: 'PENDING' },
                            { label: <Space size={4}><span>已完成</span><Tag>{drawerCounts.completed}</Tag></Space>, value: 'COMPLETED' },
                            { label: <Space size={4}><span>逾期</span><Tag>{drawerCounts.overdue}</Tag></Space>, value: 'OVERDUE' },
                            { label: <Space size={4}><span>预览</span><Tag color="cyan">{drawerCounts.preview}</Tag></Space>, value: 'PREVIEW' },
                        ]}
                    />

                    <Space wrap align="center" size="small">
                        <Text type="secondary">排序</Text>
                        <Select size="small" value={drawerSort} style={{ minWidth: 120 }} onChange={(value) => setDrawerSort(value as any)} options={[{ label: '截止时间', value: 'DUE' }, { label: '优先级', value: 'PRIORITY' }, { label: '负责人', value: 'ASSIGNEE' }]} />
                        <Text type="secondary">分组</Text>
                        <Select size="small" value={drawerGroup} style={{ minWidth: 120 }} onChange={(value) => setDrawerGroup(value as any)} options={[{ label: '不分组', value: 'NONE' }, { label: '按负责人', value: 'ASSIGNEE' }, { label: '按类型', value: 'TYPE' }]} />
                        <Divider type="vertical" />
                        <Text type="secondary">已选 {selectedTaskIds.length} 项</Text>
                    </Space>

                    <div style={{ display: 'grid', gridTemplateColumns: isWideDrawer ? 'minmax(320px, 1.3fr) minmax(280px, 1fr)' : '1fr', gap: 12 }}>
                        <div>
                            <Space style={{ marginBottom: 12 }} wrap>
                                <Checkbox indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < selectableTaskIds.length} checked={selectableTaskIds.length > 0 && selectedTaskIds.length === selectableTaskIds.length} disabled={selectableTaskIds.length === 0} onChange={(e) => { e.target.checked ? setSelectedTaskIds(selectableTaskIds) : setSelectedTaskIds([]); }}>全选</Checkbox>
                                <Button type="primary" disabled={selectedTaskIds.length === 0} loading={completeMutation.isPending} onClick={handleBatchComplete}>批量完成</Button>
                            </Space>

                            {drawerGroup === 'NONE' ? (
                                dayTasksLoading ? <Spin /> : sortedDrawerTasks.length === 0 ? <Empty description="今日无任务" /> : (
                                    <List locale={{ emptyText: '今日无任务' }}>
                                        <VirtualList data={sortedDrawerTasks} height={520} itemHeight={76} itemKey="id">
                                            {(item) => renderTaskItem(item)}
                                        </VirtualList>
                                    </List>
                                )
                            ) : (
                                <>
                                    {dayTasksLoading ? <Spin /> : groupedDrawerTasks.length === 0 ? <Empty description="今日无任务" /> : (
                                        groupedDrawerTasks.map(group => (
                                            <div key={group.key} style={{ marginBottom: 12 }}>
                                                <Divider orientation="left">{group.label} <Tag>{group.tasks.length}</Tag></Divider>
                                                <List dataSource={group.tasks} locale={{ emptyText: '无匹配任务' }} renderItem={(item) => renderTaskItem(item)} />
                                            </div>
                                        ))
                                    )}
                                </>
                            )}

                            {totalDayTasks > loadedRealTasks && (
                                <Button block style={{ marginTop: 12 }} onClick={() => setDayPageSize(dayPageSize + DEFAULT_DAY_PAGE_SIZE)}>
                                    加载更多 ({loadedRealTasks}/{totalDayTasks})
                                </Button>
                            )}
                        </div>

                        {isWideDrawer && (
                            <div style={{ border: `1px solid ${token.colorSplit}`, borderRadius: 8, padding: 12, minHeight: 520, background: token.colorBgContainer }}>
                                {renderTaskDetail()}
                            </div>
                        )}
                    </div>

                    {!isWideDrawer && (
                        <div style={{ border: `1px solid ${token.colorSplit}`, borderRadius: 8, padding: 12, background: token.colorBgContainer }}>
                            {renderTaskDetail()}
                        </div>
                    )}
                </Space>
            </div>
        </Drawer>
    );
};
