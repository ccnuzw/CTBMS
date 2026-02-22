import React, { useMemo } from 'react';
import { Calendar, Popover, Typography, Tag, Space, Button, Select, Radio, List, Spin, Table, theme } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { IntelTaskType, INTEL_TASK_TYPE_LABELS } from '@packages/types';
import { PRIORITY_META } from './constants';
import { useTaskCalendarViewModel } from './useTaskCalendarViewModel';

const { Text } = Typography;

interface Props {
    viewModel: ReturnType<typeof useTaskCalendarViewModel>;
}

export const TaskCalendarMainContent: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const {
        state: { filters, viewDate, viewMode, calendarMode },
        actions: { setViewDate, setCalendarMode, setViewMode, handleFocusDate, setSelectedDate, openTaskDrawer },
        queries: { summaryList, typeStats, summaryMap, summaryLoading, getSummaryCounts }
    } = viewModel;

    const filteredTypeStats = useMemo(() => typeStats.filter((row: Record<string, any>) => row.total > 0), [typeStats]);

    const typeStatsColumns = useMemo(() => [
        { title: '类型', dataIndex: 'type', key: 'type', render: (value: IntelTaskType) => INTEL_TASK_TYPE_LABELS[value] || value },
        ...PRIORITY_META.map(({ value, label, color }) => ({
            title: <Tag color={color}>{label}</Tag>, dataIndex: value, key: value, align: 'center' as const,
            render: (count: number) => (count ? <Tag color={color}>{count}</Tag> : <Text type="secondary">0</Text>),
        })),
        { title: '合计', dataIndex: 'total', key: 'total', align: 'center' as const },
    ], []);

    const yearOptions = useMemo(() => {
        const currentYear = dayjs().year();
        return Array.from({ length: 11 }, (_, idx) => currentYear - 5 + idx);
    }, []);

    const getHeatColor = (count: number) => {
        if (count >= 15) return token.colorErrorBg;
        if (count >= 8) return token.colorWarningBg;
        if (count >= 4) return token.colorPrimaryBg;
        if (count >= 1) return token.colorFillAlter;
        return 'transparent';
    };

    const dateCellRender = (value: dayjs.Dayjs) => {
        const dateStr = value.format('YYYY-MM-DD');
        const summary = summaryMap.get(dateStr);
        if (!summary) return null;

        const { total, completed, overdue, pending, urgent, preview, completionRate } = getSummaryCounts(summary);
        const countForHeat = total + preview;
        const content = (
            <div style={{ background: getHeatColor(countForHeat), borderRadius: 8, padding: '4px 6px', border: `1px solid ${token.colorBorderSecondary}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                    <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>完成/总数</Text>
                    <Text strong style={{ fontSize: 12, lineHeight: 1 }}>{completed}/{total}</Text>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: token.colorFillSecondary, overflow: 'hidden' }}>
                    <div style={{ width: `${completionRate}%`, height: '100%', background: token.colorSuccess, transition: 'width 0.2s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <Tag color="default" style={{ marginInlineEnd: 0, lineHeight: '16px', paddingInline: 6 }}>待 {pending}</Tag>
                    <Tag color={overdue > 0 ? 'red' : 'default'} style={{ marginInlineEnd: 0, lineHeight: '16px', paddingInline: 6 }}>逾 {overdue}</Tag>
                    {preview > 0 && <Tag color="cyan" style={{ marginInlineEnd: 0, lineHeight: '16px', paddingInline: 6 }}>预 {preview}</Tag>}
                </div>
            </div>
        );

        return (
            <Popover title="当日统计" content={<div style={{ minWidth: 160 }}><div>总数: {total}</div><div>完成: {completed}</div><div>待完成: {pending}</div><div>逾期: {overdue}</div><div>完成率: {completionRate}%</div><div>紧急: {urgent}</div>{preview > 0 && <div>预览: {preview}</div>}</div>}>
                <div style={{ display: 'inline-flex', width: '100%' }}>{content}</div>
            </Popover>
        );
    };

    const fullCellRender = (value: dayjs.Dayjs, info: Record<string, any>) => {
        if (info.type !== 'date') return info.originNode;
        return (
            <div className="ant-picker-cell-inner ant-picker-calendar-date">
                <div className="ant-picker-calendar-date-value">{value.date()}</div>
                <div className="ant-picker-calendar-date-content">{dateCellRender(value)}</div>
            </div>
        );
    };

    return (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ProCard ghost>
                <Space wrap>
                    <Text type="secondary">类型统计：</Text>
                    {PRIORITY_META.map(item => <Tag key={item.value} color={item.color}>{item.label}</Tag>)}
                </Space>
                <Table size="small" columns={typeStatsColumns as any} dataSource={filteredTypeStats} rowKey="type" pagination={false} loading={summaryLoading} style={{ marginTop: 8 }} locale={{ emptyText: '当前筛选无任务统计' }} />
            </ProCard>
            <ProCard ghost>
                <Spin spinning={summaryLoading}>
                    {viewMode === 'calendar' ? (
                        <Calendar
                            value={viewDate}
                            onChange={setViewDate}
                            onSelect={(date, { source }) => {
                                if (source === 'date') {
                                    setSelectedDate(date);
                                    openTaskDrawer();
                                }
                                setViewDate(date);
                            }}
                            fullCellRender={fullCellRender}
                            headerRender={({ value, onChange }) => (
                                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Space wrap>
                                        <Button onClick={() => onChange(value.subtract(1, 'month'))}>上个月</Button>
                                        <Button onClick={() => onChange(value.add(1, 'month'))}>下个月</Button>
                                        <Button onClick={() => onChange(dayjs())}>今天</Button>
                                        <Select value={value.year()} onChange={(year) => onChange(value.year(year))} options={yearOptions.map(year => ({ label: `${year}年`, value: year }))} style={{ width: 110 }} />
                                        <Select value={value.month() + 1} onChange={(month) => onChange(value.month(month - 1))} options={Array.from({ length: 12 }, (_, idx) => ({ label: `${idx + 1}月`, value: idx + 1 }))} style={{ width: 90 }} />
                                        <Radio.Group value={calendarMode} onChange={(e) => setCalendarMode(e.target.value)} optionType="button" buttonStyle="solid">
                                            <Radio.Button value="month">月</Radio.Button>
                                            <Radio.Button value="year">年</Radio.Button>
                                        </Radio.Group>
                                        <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)} optionType="button" buttonStyle="solid">
                                            <Radio.Button value="calendar">日历</Radio.Button>
                                            <Radio.Button value="agenda">议程</Radio.Button>
                                        </Radio.Group>
                                    </Space>
                                    <Space size="small" wrap>
                                        <Text type="secondary">密度</Text>
                                        {[{ label: '1-3', color: token.colorFillAlter }, { label: '4-7', color: token.colorPrimaryBg }, { label: '8-14', color: token.colorWarningBg }, { label: '15+', color: token.colorErrorBg }].map(item => <Tag key={item.label} style={{ background: item.color, borderColor: item.color, color: token.colorText }}>{item.label}</Tag>)}
                                        {filters.includePreview && <Tag color="cyan">预览</Tag>}
                                    </Space>
                                </div>
                            )}
                            mode={calendarMode}
                            onPanelChange={(date, mode) => { setViewDate(date); setCalendarMode(mode); }}
                        />
                    ) : (
                        <>
                            <Space style={{ padding: '12px 16px' }} wrap>
                                <Button onClick={() => setViewDate(viewDate.subtract(1, 'month'))}>上个月</Button>
                                <Button onClick={() => setViewDate(viewDate.add(1, 'month'))}>下个月</Button>
                                <Button onClick={() => setViewDate(dayjs())}>今天</Button>
                                <Select value={viewDate.year()} onChange={(year) => setViewDate(viewDate.year(year))} options={yearOptions.map(year => ({ label: `${year}年`, value: year }))} style={{ width: 110 }} />
                                <Select value={viewDate.month() + 1} onChange={(month) => setViewDate(viewDate.month(month - 1))} options={Array.from({ length: 12 }, (_, idx) => ({ label: `${idx + 1}月`, value: idx + 1 }))} style={{ width: 90 }} />
                                <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)} optionType="button" buttonStyle="solid">
                                    <Radio.Button value="calendar">日历</Radio.Button>
                                    <Radio.Button value="agenda">议程</Radio.Button>
                                </Radio.Group>
                            </Space>
                            <List
                                dataSource={summaryList}
                                locale={{ emptyText: '当前月份无任务' }}
                                renderItem={(item) => (
                                    <List.Item actions={[<Button key="open" type="link" onClick={() => { setSelectedDate(dayjs(item.date)); openTaskDrawer(); }}>查看任务</Button>]}>
                                        <List.Item.Meta title={<Space><Text>{dayjs(item.date).format('MM月DD日')}</Text><Tag>总数 {item.total}</Tag><Tag color="green">完成 {item.completed}</Tag><Tag color="red">逾期 {item.overdue}</Tag><Tag color="orange">紧急 {item.urgent}</Tag>{item.preview ? <Tag color="cyan">预览 {item.preview}</Tag> : null}</Space>} />
                                    </List.Item>
                                )}
                            />
                        </>
                    )}
                </Spin>
            </ProCard>
        </Space>
    );
};
